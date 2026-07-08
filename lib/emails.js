import { uuid } from "mu";
import {
  formatDate,
  stripHtmlAndTruncate,
  buildIpdcCompareUrl,
  sortAndLimitInstances,
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

//  Shared instance prep, used by both plain text and HTML generators
function prepareFeedbackInstances(feedbackInstances) {
  return sortAndLimitInstances(feedbackInstances, "feedbackModifiedDate").map(
    (instance) => ({
      ...instance,
      feedbackText: stripHtmlAndTruncate(instance.feedbackText, 100),
      feedbackDate: formatDate(new Date(instance.feedbackDate)),
    }),
  );
}

function prepareReviewInstances(reviewInstances) {
  return sortAndLimitInstances(reviewInstances, "reviewStatusModifiedDate").map(
    (instance) => ({
      ...instance,
      ipdcCompareUrl: buildIpdcCompareUrl(
        IPDC_URL,
        instance.productID,
        instance.dutchLanguageVariant,
        instance.versionedSource,
        instance.hasLatestFunctionalChange,
      ),
    }),
  );
}

function prepareFormalInformalInstances(formalInformalInstances) {
  return sortAndLimitInstances(formalInformalInstances, "formalInformalModifiedDate");
}

// Plain text section rendering

function formatPlainTextSection(header, items, formatItem, joinWith = "\n\n") {
  if (items.length === 0) {
    return "";
  }
  return `- ${header} (${items.length})\n${items.map(formatItem).join(joinWith)}\n\n`;
}

const formatFeedbackItem = ({
  title,
  creator,
  lastModifier,
  feedbackText,
  feedbackOrganization,
  feedbackDate,
}) =>
  `   • ${title}\n` +
  `     - Aangemaakt door: ${creator}\n` +
  `     - Laatst bewerkt door: ${lastModifier}\n` +
  `     - Feedback: ${feedbackText} - ${feedbackOrganization} - ${feedbackDate}\n`;

const formatReviewItem = ({ title, creator, lastModifier, status, ipdcCompareUrl }) =>
  `   • ${title}\n` +
  `     - Aangemaakt door: ${creator}\n` +
  `     - Laatst bewerkt door: ${lastModifier}\n` +
  `     - Status: ${status}\n` +
  `     - IPDC vergelijking: ${ipdcCompareUrl}\n`;

const formatFormalInformalItem = ({ title, creator, lastModifier }) =>
  `   • ${title}\n` +
  `     - Aangemaakt door: ${creator}\n` +
  `     - Laatst bewerkt door: ${lastModifier}\n`;

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

  email += formatPlainTextSection(
    "Feedback",
    prepareFeedbackInstances(feedbackInstances),
    formatFeedbackItem,
  );
  email += formatPlainTextSection(
    "Herziening",
    prepareReviewInstances(reviewInstances),
    formatReviewItem,
  );
  email += formatPlainTextSection(
    "Omzetting naar de 'je'-vorm",
    prepareFormalInformalInstances(formalInformalInstances),
    formatFormalInformalItem,
    "\n", // original used single "\n" for this section, unlike the other two
  );

  email += `Ga naar LPDC ${LPDC_URL}\n\n`;
  // TODO: figure out how the unsubscribe will work
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
    feedbackInstances: prepareFeedbackInstances(feedbackInstances),
    reviewInstances: prepareReviewInstances(reviewInstances),
    formalInformalInstances: prepareFormalInformalInstances(formalInformalInstances),
  });
}