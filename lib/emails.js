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