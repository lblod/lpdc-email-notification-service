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
  const notificationpreferences = await getActiveNotificationPreferences();

  for (const notificationpreference of notificationpreferences) {
    await processNotificationPreference(notificationpreference);
  }
}

async function processNotificationPreference(notificationpreference) {
  let job;
  let task;
  try {
    const windowStart = getWindowStart(notificationpreference.frequency);
    const since = notificationpreference.lastNotifiedAt ?? windowStart;

    // Skip if the notificationpreference was already notified within the current window
    if (
      notificationpreference.lastNotifiedAt &&
      notificationpreference.lastNotifiedAt >= windowStart
    ) {
      return;
    }

    // fetch the feedback, review and formal/informal changes for the instanceUris since the lastNotifiedAt
    const feedbackInstances = notificationpreference.enabledRules.includes(NOTIFICATION_RULES.FEEDBACK)
      ? await getFeedbackChanges(
          notificationpreference.instanceUris,
          since,
          notificationpreference.orgUuid,
        )
      : [];

    const reviewInstances = notificationpreference.enabledRules.includes(NOTIFICATION_RULES.HERZIENING)
      ? await getReviewStatusChanges(
          notificationpreference.instanceUris,
          since,
          notificationpreference.orgUuid,
        )
      : [];

    const formalInformalInstances = notificationpreference.enabledRules.includes(NOTIFICATION_RULES.FORMAL_INFORMAL)
      ? await getFormalInformalChanges(
          notificationpreference.instanceUris,
          since,
          notificationpreference.orgUuid,
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
      notificationpreference.targetLabel,
      notificationpreference.emailAddress,
      feedbackInstances,
      reviewInstances,
      formalInformalInstances,
    );
    await insertEmail(notificationpreference, email);
    await updateLastNotifiedAt(notificationpreference.uri, new Date());

    await updateStatus(job, JOB_STATUS.SUCCESS);
    await updateStatus(task, JOB_STATUS.SUCCESS);
  } catch (err) {
    console.log(
      `An error occurred when processing the notificationpreference ${notificationpreference.uri}: ${err}`,
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
