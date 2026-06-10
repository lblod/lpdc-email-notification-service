import { uuid } from "mu";
import {} from "../utils/queries";
import { getUUIDFromUri, getWindowStart, formatDate } from "../utils/utils";
import {
  getActiveSubscriptions,
  getFeedbackChanges,
  getFormalInformalChanges,
  getReviewChanges,
  insertEmail,
  updateLastNotifiedAt,
} from "../utils/queries";
import { LPDC_URL, IPDC_URL, FROM_EMAIL_ADDRESS } from "../env";

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
            const truncatedText = feedbackText
              ? `${feedbackText.substring(0, 50)}${feedbackText.length > 50 ? "..." : ""}`
              : "";

            return (
              `   • ${title}\n` +
              `     - Aangemaakt door: ${creator}\n` +
              `     - Laatst bewerkt door: ${lastModifier}\n` +
              `     - Feedback: ${truncatedText} - ${feedbackOrganization} - ${formatDate(new Date(feedbackDate))}\n`
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
            productId,
            dutchLanguageVariant,
            hasLatestFunctionalChange,
            versionedSource,
            creator,
            lastModifier,
            dateModified,
            status,
          }) => {
            // TODO add the ipdc compare url once it's ready
            return (
              `   • ${title}\n` +
              `     - Aangemaakt door ${creator}\n` +
              `     - Laatst bewerkt door ${lastModifier} op ${dateModified}\n` +
              `     - Status ${status}\n`
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
        .map(({ title }) => `   • ${title}`)
        .join("\n") + "\n\n";
  }

  email += `Ga naar LPDC ${LPDC_URL}\n\n`;
  // TODO: figure out how the unsubscribe will work
  email += `Wil je deze mail niet langer ontvangen, of wil je je instellingen aanpassen klik hier: `;

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
          // TODO check appropriate feedback length here
          `<li style="margin-bottom: 8px;"><strong>${title}</strong></li>
           <li style="margin-bottom: 8px;">Aangemaakt door ${creator}</li>
           <li style="margin-bottom: 8px;">Laatst bewerkt door ${lastModifier}</li>
           <li style="margin-bottom: 8px;">Feedback: ${feedbackText.substring(0, 50)}${feedbackText.length > 50 ? "..." : ""} - ${feedbackOrganization} - ${formatDate(new Date(feedbackDate))}</li>
          `,
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
          productId,
          dutchLanguageVariant,
          hasLatestFunctionalChange,
          versionedSource,
          creator,
          lastModifier,
          dateModified,
          status,
        }) => {
          // TODO: finish the url building here and extract into a separate function
          const languageVersion =
            dutchLanguageVariant.toLowerCase() === "nl-be-x-informal"
              ? "nl/informeel"
              : "nl";
          const latestSnapshot = getUUIDFromUri(hasLatestFunctionalChange);
          const publicServiceSnapshot = getUUIDFromUri(versionedSource);
          const ipdcCompareUrl = `${IPDC_URL}/${languageVersion}/concept/${productId}/revisie/vergelijk?revisie1=${publicServiceSnapshot}&revisie2=${latestSnapshot}`;

          return `<li style="margin-bottom: 8px;"><strong>${title}</strong></li>
           <li style="margin-bottom: 8px;">Aangemaakt door ${creator}</li>
           <li style="margin-bottom: 8px;">Laatst bewerkt door ${lastModifier} op ${formatDate(new Date(dateModified))}</li>
           <li style="margin-bottom: 8px;">Status ${status}</li>
           // TODO: add the fields changed, will require a call to lpdc-management (which is not usually done is my understanding) or copying a lot of code over into this service
           <li style="margin-bottom: 8px;"><a href="${ipdcCompareUrl}">IPDC vergelijking</a></li>
          `;
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
        ({ title }) =>
          `<li style="margin-bottom: 8px;"><strong>${title}</strong></li>`,
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

export async function processNotifications(frequency) {
  // get the subscriptions for that frequency
  const subscriptions = await getActiveSubscriptions(frequency);
  const emails = [];
  const errors = [];

  for (const subscription of subscriptions) {
    const { email, error } = await processSubscription(subscription);
    if (email) emails.push(email);
    if (error) errors.push(error);
  }
}

// TODO: finish
async function processSubscription(subscription) {
  const result = { email: null, error: null };

  try {
    const since =
      subscription.lastNotifiedAt ?? getWindowStart(subscription.frequency);
    // fetch the feedback, review and formal/informal changes for the instanceUris since the lastNotifiedAt
    const feedbackInstances = await getFeedbackChanges(
      subscription.instanceUri,
      since,
      subscription.orgUuid,
    );
    const reviewInstances = await getReviewChanges(
      subscription.instanceUris,
      since,
      subscription.orgUuid,
    );
    const formalInformalInstances = await getFormalInformalChanges(
      subscription.instanceUris,
      since,
      subscription.orgUuid,
    );

    // skip if no updates found for all 3 types of notifications
    if (
      feedbackInstances.length === 0 &&
      reviewInstances.length === 0 &&
      formalInformalInstances.length === 0
    ) {
      return result;
    }

    const email = createEmailForTarget(
      subscription.targetLabel,
      subscription.emailAddress,
      feedbackInstances,
      reviewInstances,
      formalInformalInstances,
    );
    await insertEmail(subscription, email);
    await updateLastNotifiedAt(subscription.uri, new Date());
    result.email = email;
  } catch (err) {
    const errMsg = `
      Error processing subscription ${subscription.uri} : ${err.message || err}`;
    console.error(errMsg);
    result.error = errMsg;
  }

  return result;
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
