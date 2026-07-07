import { uuid } from "mu";
import {
  getWindowStart,
} from "../utils/utils";
import {
  createJob,
  createTask,
  getActiveNotificationPreferences,
  getFeedbackChanges,
  getFormalInformalChanges,
  getReviewStatusChanges,
  insertEmail,
  updateLastNotifiedAt,
  updateStatus,
  addError,
} from "../utils/queries";
import { FROM_EMAIL_ADDRESS } from "../env";
import { JOB_STATUS } from "../utils/constants";
import { NOTIFICATION_RULES } from '../utils/constants.js';
import {
  newEmail,
  generateHtmlSummaryEmail,
  generatePlainTextSummaryEmail,
} from "./emails";

export async function processNotifications() {
  const notificationPreferences = await getActiveNotificationPreferences();

  for (const notificationPreference of notificationPreferences) {
    await processNotificationPreference(notificationPreference);
  }
}

async function processNotificationPreference(notificationPreference) {
  let job;
  let task;
  try {
    const windowStart = getWindowStart(notificationPreference.frequency);
    const since = notificationPreference.lastNotifiedAt ?? windowStart;

    // Skip if the notificationPreference was already notified within the current window
    if (
      notificationPreference.lastNotifiedAt &&
      notificationPreference.lastNotifiedAt >= windowStart
    ) {
      return;
    }

    // fetch the feedback, review and formal/informal changes for the instanceUris since the lastNotifiedAt
    const feedbackInstances = notificationPreference.enabledRules.includes(NOTIFICATION_RULES.FEEDBACK)
      ? await getFeedbackChanges(
          notificationPreference.instanceUris,
          since,
          notificationPreference.orgUuid,
        )
      : [];

    const reviewInstances = notificationPreference.enabledRules.includes(NOTIFICATION_RULES.HERZIENING)
      ? await getReviewStatusChanges(
          notificationPreference.instanceUris,
          since,
          notificationPreference.orgUuid,
        )
      : [];

    const formalInformalInstances = notificationPreference.enabledRules.includes(NOTIFICATION_RULES.FORMAL_INFORMAL)
      ? await getFormalInformalChanges(
          notificationPreference.instanceUris,
          since,
          notificationPreference.orgUuid,
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
      notificationPreference.targetLabel,
      notificationPreference.emailAddress,
      feedbackInstances,
      reviewInstances,
      formalInformalInstances,
    );
    await insertEmail(notificationPreference, email);
    await updateLastNotifiedAt(notificationPreference.uri, new Date());

    await updateStatus(job, JOB_STATUS.SUCCESS);
    await updateStatus(task, JOB_STATUS.SUCCESS);
  } catch (err) {
    console.log(
      `An error occurred when processing the notificationPreference ${notificationPreference.uri}: ${err}`,
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
