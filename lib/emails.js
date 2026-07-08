import { uuid } from "mu";
import {
  formatDate,
  stripHtmlAndTruncate,
  buildIpdcCompareUrl,
} from "../utils/utils";

import {
  LPDC_URL,
  IPDC_URL,
  FROM_EMAIL_ADDRESS,
} from "../env";
import path from "path";
import fs from 'fs';
import Handlebars from 'handlebars';


const notificationSummaryTemplatePath = path.join(
  process.cwd(),
  "templates",
  "notification-summary.hbs",
);

const notificationSummaryTemplate = Handlebars.compile(
  fs.readFileSync(notificationSummaryTemplatePath, "utf8"),
);

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
  email += `Wil je deze e-mail niet langer ontvangen of je meldingsinstellingen aanpassen? Dat kan via het alarmbel-icoon rechtsboven in LPDC.`;

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
  return notificationSummaryTemplate({
    targetLabel,
    lpdcUrl: LPDC_URL,

    feedbackInstances: feedbackInstances
      .sort(
        (a, b) =>
          new Date(b.feedbackModifiedDate) -
          new Date(a.feedbackModifiedDate),
      )
      .slice(0, 7)
      .map((instance) => ({
        ...instance,
        feedbackText: stripHtmlAndTruncate(instance.feedbackText, 100),
        feedbackDate: formatDate(new Date(instance.feedbackDate)),
      })),

    reviewInstances: reviewInstances
      .sort(
        (a, b) =>
          new Date(b.reviewStatusModifiedDate) -
          new Date(a.reviewStatusModifiedDate),
      )
      .slice(0, 7)
      .map((instance) => ({
        ...instance,
        ipdcCompareUrl: buildIpdcCompareUrl(
          IPDC_URL,
          instance.productID,
          instance.dutchLanguageVariant,
          instance.versionedSource,
          instance.hasLatestFunctionalChange,
        ),
      })),

    formalInformalInstances: formalInformalInstances
      .sort(
        (a, b) =>
          new Date(b.formalInformalModifiedDate) -
          new Date(a.formalInformalModifiedDate),
      )
      .slice(0, 7),
  });
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
