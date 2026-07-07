import { uuid } from "mu";
import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import {
  getUUIDFromUri,
  getWindowStart,
  formatDate,
  stripHtmlAndTruncate,
  buildIpdcCompareUrl,
  isStatusReportDue,
} from "../utils/utils";
import {
  createJob,
  createTask,
  getActiveNotificationPreferences,
  getFeedbackChanges,
  getFormalInformalChanges,
  getReviewStatusChanges,
  getStatusReportData,
  insertEmail,
  updateLastNotifiedAt,
  updateStatus,
  addError,
} from "../utils/queries";
import { LPDC_URL, IPDC_URL, FROM_EMAIL_ADDRESS } from "../env";
import { JOB_STATUS } from "../utils/constants";
import { NOTIFICATION_RULES } from '../utils/constants.js';

const statusReportTemplatePath = path.join(
  process.cwd(),
  "templates",
  "status-report.hbs",
);

const statusReportTemplate = Handlebars.compile(
  fs.readFileSync(statusReportTemplatePath, "utf8"),
);

/**
 * @param {String} emailFrom
 * @param {String} to
 * @param {String} subject
 * @param {String} content
 * @returns
 */
export function newEmail(emailFrom, to, subject, content) {
  const email = {};
  email.uuid = uuid();
  email.from = emailFrom;
  email.to = to;
  email.subject = subject;
  email.content = content;
  return email;
}

/**
 * Builds a plain text template for the mail to be sent.
 * @param {String} targetLabel
 * @param {Array} feedbackInstances
 * @param {Array} reviewInstances
 * @param {Array} formalInformalInstances
 * @returns plain text email template
 */
export function generatePlainTextSummaryEmail(
  targetLabel,
  feedbackInstances,
  reviewInstances,
  formalInformalInstances,
) {
  let email = `Beste ${targetLabel}\n\n`;
  email += `Een aantal instanties in je LPDC-omgeving (${LPDC_URL}) vragen je aandacht / een actie:\n\n`;

  // 1. Feedback instanties
  if (feedbackInstances.length > 0) {
    email += `- Feedback (${feedbackInstances.length})\n`;
    email +=
      feedbackInstances
        .sort(
          (a, b) =>
            new Date(b.feedbackModifiedDate) - new Date(a.feedbackModifiedDate),
        )
        .slice(0, 7)
        .map(
          ({
            title,
            creator,
            lastModifier,
            feedbackText,
            feedbackOrganization,
            feedbackDate,
          }) => {
            return (
              `   • ${title}\n` +
              `     - Aangemaakt door: ${creator}\n` +
              `     - Laatst bewerkt door: ${lastModifier}\n` +
              `     - Feedback: ${stripHtmlAndTruncate(feedbackText, 100)} - ${feedbackOrganization} - ${formatDate(new Date(feedbackDate))}\n`
            );
          },
        )
        .join("\n\n") + "\n\n";
  }

  // 2. Herziening nodig instances
  if (reviewInstances.length > 0) {
    email += `- Herziening (${reviewInstances.length})\n`;
    email +=
      reviewInstances
        .sort(
          (a, b) =>
            new Date(b.reviewStatusModifiedDate) -
            new Date(a.reviewStatusModifiedDate),
        )
        .slice(0, 7)
        .map(
          ({
            title,
            productID,
            hasLatestFunctionalChange,
            versionedSource,
            creator,
            lastModifier,
            status,
            dutchLanguageVariant,
          }) => {
            return (
              `   • ${title}\n` +
              `     - Aangemaakt door: ${creator}\n` +
              `     - Laatst bewerkt door: ${lastModifier}\n` +
              `     - Status: ${status}\n` +
              `     - IPDC vergelijking: ${buildIpdcCompareUrl(IPDC_URL, productID, dutchLanguageVariant, versionedSource, hasLatestFunctionalChange)}\n`
            );
          },
        )
        .join("\n\n") + "\n\n";
  }

  // 3. U/je instanties (Omzetting)
  if (formalInformalInstances.length > 0) {
    email += `- Omzetting naar de 'je'-vorm (${formalInformalInstances.length})\n`;
    email +=
      formalInformalInstances
        .sort(
          (a, b) =>
            new Date(b.formalInformalModifiedDate) -
            new Date(a.formalInformalModifiedDate),
        )
        .slice(0, 7)
        .map(({ title, creator, lastModifier }) => {
          return (
            `   • ${title}\n` +
            `     - Aangemaakt door: ${creator}\n` +
            `     - Laatst bewerkt door: ${lastModifier}\n`
          );
        })
        .join("\n") + "\n\n";
  }

  email += `Ga naar LPDC ${LPDC_URL}\n\n`;
  // TODO: figure out how the unsubscribe will work
  email += `Wil je deze e-mail niet langer ontvangen of je meldingsinstellingen aanpassen? Dat kan via het alarmbel-icoon rechtsboven in LPDC.`;

  return email;
}

/**
 * Builds the plain text status report email.
 *
 * @param {String} targetLabel - Name of the recipient.
 * @param {String} bestuurseenheid - Name of the bestuurseenheid.
 * @param {Object} statusReportData - Aggregated status report data for the governing body.
 * @returns {String} The plain text email.
 */
export function generateStatusReportPlainTextEmail(
  targetLabel,
  bestuurseenheid,
  statusReportData
) {
  let email = `Beste ${targetLabel},

Met de Lokale Producten- en Dienstencatalogus (LPDC) maak je informatie over de dienstverleningen van jouw bestuur beschikbaar voor én via verschillende kanalen. Toepassingen zoals het Verenigingsloket, de Rechtenverkenner, Mijn Burgerprofiel, Your Europe, ... zorgen ervoor dat jouw doelgroep snel en eenvoudig de juiste info én de weg naar jouw dienstverlening vindt.
Tenminste... áls de informatie in LPDC volledig, correct en up-to-date is.

Dit is de huidige status voor jouw bestuur ${bestuurseenheid}:

Jouw LPDC-omgeving bevat ${statusReportData.totalInstances} instanties.

- Feedback: ${statusReportData.totalFeedback} instanties hebben feedback gekregen. Bekijk deze instanties via ${LPDC_URL}/?isFeedbackAvailable=true
    Soms vindt een hergebruiker een typfout, dode link, of verouderde of ontbrekende informatie in een instantie. Dankzij de feedbackfunctie kunnen ze dit rechtstreeks melden.
    Wat moet je doen? Handleiding: https://abb-vlaanderen.gitbook.io/informatie-lpdc/handleiding-lpdc-module-in-loket-lokale-besturen/feedback-op-een-instantie

- Herziening: ${statusReportData.totalHerziening} instanties zijn gekoppeld met een gewijzigd concept. Bekijk deze instanties via ${LPDC_URL}/?isReviewRequiredFilterEnabled=true
    Wanneer een concept wordt gewijzigd, bijvoorbeeld naar aanleiding van een aanpassing in de wetgeving, kan het nodig zijn dat jouw gekoppelde instantie ook een update moet krijgen.
    Wat moet je doen? Handleiding: https://abb-vlaanderen.gitbook.io/informatie-lpdc/handleiding-lpdc-module-in-loket-lokale-besturen/herziening-nodig-wijziging-aan-een-concept-verwerken-in-een-instantie

- Dubbele instanties: Van ${statusReportData.totalDuplicateProductIds} instanties bestaan er meerdere versies. Ga naar je LPDC omgeving: ${LPDC_URL}
    In de LPDC-omgeving van jouw bestuur staan meerdere versies van hetzelfde concept. Enerzijds betekent dit dubbel werk, anderzijds creëert het verwarring over welke versie correct is. Kijk na welke versie je wil behouden en verwijder de andere versie(s). Zo heb je slechts één bron van waarheid en hoef je maar één versie up-to-date te houden.
    De concepten met meerdere versies zijn: ${statusReportData.duplicateProductTitles.join(", ")}
    Wat moet je doen? Handleiding: https://abb-vlaanderen.gitbook.io/informatie-lpdc/handleiding-lpdc-module-in-loket-lokale-besturen/product-of-dienst-verwijderen
`;

  if (statusReportData.totalFormalInformal > 0) {
    email += `
- U > Je-omzetting: ${statusReportData.totalFormalInformal} instanties moeten nog worden omgezet. Bekijk de instanties via ${LPDC_URL}/?needsConversionFromFormalToInformalFilterEnabled=true
    Jouw bestuur heeft gekozen om in de je-vorm te werken. Instanties die aangemaakt zijn voordat deze keuze werd gemaakt, hebben de u-vorm als basis. Je kan deze instanties eenvoudig omzetten naar de je-vorm.
    Wat moet je doen? Handleiding: https://abb-vlaanderen.gitbook.io/informatie-lpdc/handleiding-lpdc-module-in-loket-lokale-besturen/kies-je-voor-u-of-je
`;
  }

  email += `
Heb je vragen? Neem contact op via loketlokaalbestuur@vlaanderen.be.

Met vriendelijke groeten,
`;

  return email;
}

/**
 * Builds an HTML template for the mail to be sent.
 * @param {String} targetLabel
 * @param {Array} feedbackInstances
 * @param {Array} reviewInstances
 * @param {Array} formalInformalInstances
 * @returns html email template
 */
export function generateHtmlSummaryEmail(
  targetLabel,
  feedbackInstances,
  reviewInstances,
  formalInformalInstances,
) {
  // Feedback instanties
  let htmlFeedbackRows = `<li style="margin-bottom: 15px;"><strong>Feedback (${feedbackInstances.length})</strong>`;
  if (feedbackInstances.length > 0) {
    htmlFeedbackRows += `<ul style="margin-top: 5px;">`;
    htmlFeedbackRows += feedbackInstances
      .sort(
        (a, b) =>
          new Date(b.feedbackModifiedDate) - new Date(a.feedbackModifiedDate),
      )
      .slice(0, 7)
      .map(
        ({
          title,
          creator,
          lastModifier,
          feedbackText,
          feedbackOrganization,
          feedbackDate,
        }) =>
          `<li style="margin-bottom: 24px;">
             <strong style="display: inline-block; margin-bottom: 4px;">${title}</strong><br />
             <span>Aangemaakt door: ${creator}</span><br />
             <span>Laatst bewerkt door: ${lastModifier}</span><br />
             <span>Feedback: <i>${stripHtmlAndTruncate(feedbackText, 100)}</i> - ${feedbackOrganization} - ${formatDate(new Date(feedbackDate))}</span>
          </li>`,
      )
      .join("");
    htmlFeedbackRows += `</ul>`;
  }
  htmlFeedbackRows += `</li>`;

  // Herziening nodig instances
  let htmlReviewRows = `<li style="margin-bottom: 15px;"><strong>Herziening (${reviewInstances.length})</strong>`;
  if (reviewInstances.length > 0) {
    htmlReviewRows += `<ul style="margin-top: 5px;">`;
    htmlReviewRows += reviewInstances
      .sort(
        (a, b) =>
          new Date(b.reviewStatusModifiedDate) -
          new Date(a.reviewStatusModifiedDate),
      )
      .slice(0, 7)
      .map(
        ({
          title,
          productID,
          hasLatestFunctionalChange,
          versionedSource,
          creator,
          lastModifier,
          status,
          dutchLanguageVariant,
        }) => {
          const ipdcCompareUrl = buildIpdcCompareUrl(IPDC_URL, productID, dutchLanguageVariant, versionedSource, hasLatestFunctionalChange);

          // TODO: add the fields changed, will require a call to lpdc-management (which is not usually done is my understanding) or copying a lot of code over into this service
          return `<li style="margin-bottom: 24px;">
            <strong style="display: inline-block; margin-bottom: 4px;">${title}</strong><br />
            <span>Aangemaakt door: ${creator}</span><br />
            <span>Laatst bewerkt door: ${lastModifier}</span><br />
            <span>Status: ${status}</span><br />
            <span><a href="${ipdcCompareUrl}">IPDC vergelijking</a></span>
          </li>`;
        },
      )
      .join("");
    htmlReviewRows += `</ul>`;
  }
  htmlReviewRows += `</li>`;

  // U/je instanties
  let htmlFormalInformalRows = `<li style="margin-bottom: 15px;"><strong>Omzetting naar de 'je'-vorm (${formalInformalInstances.length})</strong>`;
  if (formalInformalInstances.length > 0) {
    htmlFormalInformalRows += `<ul style="margin-top: 5px;">`;
    htmlFormalInformalRows += formalInformalInstances
      .sort(
        (a, b) =>
          new Date(b.formalInformalModifiedDate) -
          new Date(a.formalInformalModifiedDate),
      )
      .slice(0, 7)
      .map(
        ({ title, creator, lastModifier }) =>
          `<li style="margin-bottom: 24px;">
            <strong style="display: inline-block; margin-bottom: 4px;">${title}</strong><br />
            <span>Aangemaakt door: ${creator}</span><br />
            <span>Laatst bewerkt door: ${lastModifier}</span><br />
          </li>`,
      )
      .join("");
    htmlFormalInformalRows += `</ul>`;
  }
  htmlFormalInformalRows += `</li>`;

  return `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="nl">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Type" content="text/html charset=UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0 " />
    <meta name="format-detection" content="telephone=no" />
    <!--[if !mso]><! -->
    <link href="https://fonts.googleapis.com/css?family=Open+Sans:300,400,600,700" rel="stylesheet" />
    <!--<![endif]-->
  </head>

  <body>
    <p style="margin:0; font-family:sans-serif; letter-spacing:normal; line-height:1.6">Beste ${targetLabel}</p>
    <p style="margin:0; font-family:sans-serif; letter-spacing:normal; line-height:1.6">Een aantal instanties in je <a href="${LPDC_URL}">LPDC-omgeving</a> vragen je aandacht / een actie:</p>

    ${feedbackInstances.length > 0 ? htmlFeedbackRows : ""}
    ${reviewInstances.length > 0 ? htmlReviewRows : ""}
    ${formalInformalInstances.length > 0 ? htmlFormalInformalRows : ""}

    <hr style="border: 0; border-top: 1px solid #ccc; margin: 20px 0;">

    <p style="margin:0; font-family:sans-serif; letter-spacing:normal; line-height:1.6">
      <a href="${LPDC_URL}">Ga naar LPDC</a>
    </p>
    <p style="font-family:sans-serif; font-size: 0.85em; color: #666;">
      Wil je deze e-mail niet langer ontvangen of je meldingsinstellingen aanpassen? Dat kan via het alarmbel-icoon rechtsboven in LPDC.
    </p>
    </body>
  </html>
  `;
}

/**
 * Builds the HTML status report email.
 *
 * @param {String} targetLabel - Name of the recipient.
 * @param {String} bestuurseenheid - Name of the bestuurseenheid.
 * @param {Object} statusReportData - Aggregated status report data for the governing body.
 * @returns {String} The HTML email.
 */
export function generateStatusReportHtmlEmail(
  targetLabel,
  bestuurseenheid,
  statusReportData
) {
  const lpdcInfoUrl =
    "https://www.vlaanderen.be/lokaal-bestuur/digitale-transformatie/lokale-producten-en-dienstencatalogus/online-opleiding-het-wat-en-waarom-van-ipdc-en-lpdc/22-09-2026";

  const feedbackHandleidingUrl =
    "https://abb-vlaanderen.gitbook.io/informatie-lpdc/handleiding-lpdc-module-in-loket-lokale-besturen/feedback-op-een-instantie";

  const herzieningHandleidingUrl =
    "https://abb-vlaanderen.gitbook.io/informatie-lpdc/handleiding-lpdc-module-in-loket-lokale-besturen/herziening-nodig-wijziging-aan-een-concept-verwerken-in-een-instantie";

  const verwijderenHandleidingUrl =
    "https://abb-vlaanderen.gitbook.io/informatie-lpdc/handleiding-lpdc-module-in-loket-lokale-besturen/product-of-dienst-verwijderen";

  const jeVormHandleidingUrl =
    "https://abb-vlaanderen.gitbook.io/informatie-lpdc/handleiding-lpdc-module-in-loket-lokale-besturen/kies-je-voor-u-of-je";

  const paragraphStyle =
    "margin:0 0 16px 0; font-family:sans-serif; letter-spacing:normal; line-height:1.6;";

  return statusReportTemplate({
    targetLabel,
    bestuurseenheid,

    paragraphStyle,

    lpdcUrl: LPDC_URL,
    lpdcInfoUrl,
    feedbackInstancesUrl: `${LPDC_URL}/?isFeedbackAvailable=true`,
    herzieningInstancesUrl: `${LPDC_URL}/?isReviewRequiredFilterEnabled=true`,
    formalInformalInstancesUrl: `${LPDC_URL}/?needsConversionFromFormalToInformalFilterEnabled=true`,

    feedbackHandleidingUrl,
    herzieningHandleidingUrl,
    verwijderenHandleidingUrl,
    jeVormHandleidingUrl,

    totalInstances: statusReportData.totalInstances,
    totalFeedback: statusReportData.totalFeedback,
    totalHerziening: statusReportData.totalHerziening,
    totalDuplicateProductIds: statusReportData.totalDuplicateProductIds,
    duplicateProductTitles: statusReportData.duplicateProductTitles.join(", "),
    totalFormalInformal: statusReportData.totalFormalInformal,
    hasFormalInformal: statusReportData.totalFormalInformal > 0,
  });
}

export async function processNotifications() {
  const subscriptions = await getActiveNotificationPreferences();

  for (const subscription of subscriptions) {
    await processSubscription(subscription);
  }
}

async function processSubscription(subscription) {
  await processStatusReport(subscription);
  await processDigest(subscription);
}

async function processStatusReport(subscription) {
  if (
    !subscription.enabledRules.includes(NOTIFICATION_RULES.STATUS_REPORT) ||
    !isStatusReportDue()
  ) {
    return;
  }

  let job;
  let task;
  try {
    job = await createJob();
    task = await createTask(job);
    await updateStatus(job, JOB_STATUS.BUSY);
    await updateStatus(task, JOB_STATUS.BUSY);

    const statusReportData = await getStatusReportData(subscription.orgUuid);
    const statusReportEmail = createStatusReportEmail(
      subscription.targetLabel,
      subscription.emailAddress,
      subscription.bestuurseenheid,
      statusReportData,
    );
    await insertEmail(subscription, statusReportEmail);

    await updateStatus(job, JOB_STATUS.SUCCESS);
    await updateStatus(task, JOB_STATUS.SUCCESS);
  } catch (err) {
    console.log(
      `An error occurred when processing the status report for subscription ${subscription.uri}: ${err}`,
    );
    if (job !== undefined && task !== undefined) {
      await addError(job, err);
      await updateStatus(job, JOB_STATUS.FAILED);
      await updateStatus(task, JOB_STATUS.FAILED);
    }
  }
}

async function processDigest(subscription) {
  let job;
  let task;
  try {
    const windowStart = getWindowStart(subscription.frequency);
    const since = subscription.lastNotifiedAt ?? windowStart;

    // Skip if the subscription was already notified within the current window
    if (
      subscription.lastNotifiedAt &&
      subscription.lastNotifiedAt >= windowStart
    ) {
      return;
    }

    // fetch the feedback, review and formal/informal changes for the instanceUris since the lastNotifiedAt
    const feedbackInstances = subscription.enabledRules.includes(NOTIFICATION_RULES.FEEDBACK)
      ? await getFeedbackChanges(
          subscription.instanceUris,
          since,
          subscription.orgUuid,
        )
      : [];

    const reviewInstances = subscription.enabledRules.includes(NOTIFICATION_RULES.HERZIENING)
      ? await getReviewStatusChanges(
          subscription.instanceUris,
          since,
          subscription.orgUuid,
        )
      : [];

    const formalInformalInstances = subscription.enabledRules.includes(NOTIFICATION_RULES.FORMAL_INFORMAL)
      ? await getFormalInformalChanges(
          subscription.instanceUris,
          since,
          subscription.orgUuid,
        )
      : [];

    // skip if no updates found for all 3 types of notifications
    if (
      feedbackInstances.length === 0 &&
      reviewInstances.length === 0 &&
      formalInformalInstances.length === 0
    ) {
      return;
    }

    // TODO: check where to create the job so that empty runs don't create empty jobs
    job = await createJob();
    task = await createTask(job);
    await updateStatus(job, JOB_STATUS.BUSY);
    await updateStatus(task, JOB_STATUS.BUSY);

    const email = createEmailForTarget(
      subscription.targetLabel,
      subscription.emailAddress,
      feedbackInstances,
      reviewInstances,
      formalInformalInstances,
    );
    await insertEmail(subscription, email);
    await updateLastNotifiedAt(subscription.uri, new Date());

    await updateStatus(job, JOB_STATUS.SUCCESS);
    await updateStatus(task, JOB_STATUS.SUCCESS);
  } catch (err) {
    console.log(
      `An error occurred when processing the digest for subscription ${subscription.uri}: ${err}`,
    );
    if (job !== undefined && task !== undefined) {
      await addError(job, err);
      await updateStatus(job, JOB_STATUS.FAILED);
      await updateStatus(task, JOB_STATUS.FAILED);
    }
  }
}

function createEmailForTarget(
  targetLabel,
  emailAddress,
  feedbackInstances,
  reviewInstances,
  formalInformalInstances,
) {
  const subject = "Enkele instanties vragen je aandacht";

  let email = newEmail(FROM_EMAIL_ADDRESS, emailAddress, subject, null);

  email.htmlContent = generateHtmlSummaryEmail(
    targetLabel,
    feedbackInstances,
    reviewInstances,
    formalInformalInstances,
  );
  email.plainTextMessageContent = generatePlainTextSummaryEmail(
    targetLabel,
    feedbackInstances,
    reviewInstances,
    formalInformalInstances,
  );
  email.uri = `http://data.lblod.info/id/emails/${email.uuid}`;

  return email;
}

function createStatusReportEmail(targetLabel, emailAddress, bestuurseenheid, statusReportData) {
  const subject = `LPDC-rapport: Is de informatie over jouw lokale dienstverlening klaar voor hergebruik?  `;
  const email = newEmail(FROM_EMAIL_ADDRESS, emailAddress, subject, null);

  email.htmlContent = generateStatusReportHtmlEmail(targetLabel, bestuurseenheid, statusReportData);
  email.plainTextMessageContent = generateStatusReportPlainTextEmail(targetLabel, bestuurseenheid, statusReportData);
  email.uri = `http://data.lblod.info/id/emails/${email.uuid}`;

  return email;
}
