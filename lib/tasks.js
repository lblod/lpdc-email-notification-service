import { uuid } from "mu";
import {
  getWindowStart,
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
  linkTaskToPreference,
  updateStatus,
  addError,
} from "../utils/queries";
import { FROM_EMAIL_ADDRESS, ENABLE_NOTIFICATIONS } from "../env";
import { NOTIFICATION_RULES, JOB_STATUS, TASK_OPERATION } from "../utils/constants";
import {
  newEmail,
  generateHtmlSummaryEmail,
  generatePlainTextSummaryEmail,
  generateStatusReportHtmlEmail,
  generateStatusReportPlainTextEmail
} from "./emails";

export async function processNotifications() {
  if (!ENABLE_NOTIFICATIONS) {
    console.log("Notifications are disabled via ENABLE_NOTIFICATIONS, skipping.");
    return;
  }

  const notificationPreferences = await getActiveNotificationPreferences();

  let job;
  let hasFailure = false;

  for (const notificationPreference of notificationPreferences) {
    const digestResult = await processDigest(notificationPreference, job);
    job = digestResult.job;
    if (digestResult.failed) hasFailure = true;

    const statusReportResult = await processStatusReport(notificationPreference, job);
    job = statusReportResult.job;
    if (statusReportResult.failed) hasFailure = true;
  }

  if (job !== undefined) {
    await updateStatus(job, hasFailure ? JOB_STATUS.FAILED : JOB_STATUS.SUCCESS);
  }
}

async function processStatusReport(notificationPreference, job) {
  let task;
  try {
    if (
      !notificationPreference.enabledRules.includes(NOTIFICATION_RULES.STATUS_REPORT) ||
      !isStatusReportDue()
    ) {
      return { job, failed: false };
    }

    if (job === undefined) {
      job = await createJob();
      await updateStatus(job, JOB_STATUS.BUSY);
    }

    task = await createTask(job, TASK_OPERATION.STATUS_REPORT);
    await updateStatus(task, JOB_STATUS.BUSY);

    const statusReportData = await getStatusReportData(notificationPreference.orgUuid);
    const statusReportEmail = createStatusReportEmail(
      notificationPreference.targetLabel,
      notificationPreference.emailAddress,
      notificationPreference.bestuurseenheid,
      statusReportData,
    );
    await insertEmail(notificationPreference, statusReportEmail, task);

    await updateStatus(task, JOB_STATUS.SUCCESS);
    return { job, failed: false };
  } catch (err) {
    console.log(
      `An error occurred when processing the status report for notificationPreference ${notificationPreference.uri}: ${err}`,
    );
    if (job !== undefined && task !== undefined) {
      await addError(job, err);
      await updateStatus(task, JOB_STATUS.FAILED);
    }
    return { job, failed: true };
  }
}

async function processDigest(notificationPreference, job) {
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

    task = await createTask(job, TASK_OPERATION.DIGEST);
    await updateStatus(task, JOB_STATUS.BUSY);

    const email = createEmailForTarget(
      notificationPreference.targetLabel,
      notificationPreference.emailAddress,
      feedbackInstances,
      reviewInstances,
      formalInformalInstances,
    );
    await insertEmail(notificationPreference, email, task);
    await linkTaskToPreference(task, notificationPreference.uri);

    await updateStatus(task, JOB_STATUS.SUCCESS);
    return { job, failed: false };
  } catch (err) {
    console.log(
      `An error occurred when processing the digest for notificationPreference ${notificationPreference.uri}: ${err}`,
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

function createStatusReportEmail(targetLabel, emailAddress, bestuurseenheid, statusReportData) {
  const subject = `LPDC-rapport: Is de informatie over jouw lokale dienstverlening klaar voor hergebruik?`;
  const email = newEmail(FROM_EMAIL_ADDRESS, emailAddress, subject, null);

  email.htmlContent = generateStatusReportHtmlEmail(targetLabel, bestuurseenheid, statusReportData);
  email.plainTextMessageContent = generateStatusReportPlainTextEmail(targetLabel, bestuurseenheid, statusReportData);
  email.uri = `http://data.lblod.info/id/emails/${email.uuid}`;

  return email;
}
