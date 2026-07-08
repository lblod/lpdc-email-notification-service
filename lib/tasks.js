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

  let job;
  let hasFailure = false;

  for (const notificationPreference of notificationPreferences) {
    const result = await processNotificationPreference(notificationPreference, job);
    job = result.job;
    if (result.failed) {
      hasFailure = true;
    }
  }

  if (job !== undefined) {
    await updateStatus(job, hasFailure ? JOB_STATUS.FAILED : JOB_STATUS.SUCCESS);
  }
}

async function processNotificationPreference(notificationPreference, job) {
  let task;
  try {
    const windowStart = getWindowStart(notificationPreference.frequency);
    const since = notificationPreference.lastNotifiedAt ?? windowStart;

    if (
      notificationPreference.lastNotifiedAt &&
      notificationPreference.lastNotifiedAt >= windowStart
    ) {
      return { job, failed: false };
    }

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

    if (
      feedbackInstances.length === 0 &&
      reviewInstances.length === 0 &&
      formalInformalInstances.length === 0
    ) {
      return { job, failed: false };
    }

    if (job === undefined) {
      job = await createJob();
      await updateStatus(job, JOB_STATUS.BUSY);
    }

    task = await createTask(job);
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

    await updateStatus(task, JOB_STATUS.SUCCESS);
    return { job, failed: false };
  } catch (err) {
    console.log(
      `An error occurred when processing the notificationPreference ${notificationPreference.uri}: ${err}`,
    );
    if (job !== undefined && task !== undefined) {
      await addError(job, err);
      await updateStatus(task, JOB_STATUS.FAILED);
    }
    return { job, failed: true };
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
