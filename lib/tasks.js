import { uuid } from "mu";
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
  email += `Wil je deze mail niet langer ontvangen, of wil je je instellingen aanpassen klik hier: `;

  return email;
}

export function generateStatusReportPlainTextEmail(targetLabel, statusReportData) {
  let email = `Beste ${targetLabel}\n\n`;
  email += `Hierbij je halfjaarlijkse statusrapport voor je bestuurseenheid.\n\n`;
  // TODO: fill in once statusReportData shape is decided
  email += `Ga naar LPDC ${LPDC_URL}\n\n`;
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
      Wil je deze mail niet langer ontvangen, of wil je je instellingen aanpassen <a href="TODO">klik hier</a>.
    </p>
    </body>
  </html>
  `;
}

export function generateStatusReportHtmlEmail(targetLabel, statusReportData) {
  return `
  <!DOCTYPE html ...>
  <html lang="nl">
  <body>
    <p>Beste ${targetLabel}</p>
    <p>Hierbij je halfjaarlijkse statusrapport voor je bestuurseenheid.</p>
    <!-- TODO: fill in once statusReportData shape is decided -->
    <p><a href="${LPDC_URL}">Ga naar LPDC</a></p>
  </body>
  </html>
  `;
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

function createStatusReportEmail(targetLabel, emailAddress, statusReportData) {
  const subject = "Je halfjaarlijkse statusrapport";
  const email = newEmail(FROM_EMAIL_ADDRESS, emailAddress, subject, null);

  email.htmlContent = generateStatusReportHtmlEmail(targetLabel, statusReportData);
  email.plainTextMessageContent = generateStatusReportPlainTextEmail(targetLabel, statusReportData);
  email.uri = `http://data.lblod.info/id/emails/${email.uuid}`;

  return email;
}
