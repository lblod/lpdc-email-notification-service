import { uuid } from "mu";
import {
  getWindowStart,
  isStatusReportDue,
  getStatusReportPeriodStart,
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
  getAllActiveBestuurseenheden,
  hasStatusReportBeenSent,
} from "../utils/queries";
import { FROM_EMAIL_ADDRESS, ENABLE_STATUSREPORT_NOTIFICATIONS } from "../env";
import {
  NOTIFICATION_RULES,
  JOB_STATUS,
  TASK_OPERATION,
  FREQUENCIES,
} from "../utils/constants";
import {
  newEmail,
  generateHtmlSummaryEmail,
  generatePlainTextSummaryEmail,
  generateStatusReportHtmlEmail,
  generateStatusReportPlainTextEmail,
} from "./emails";

export async function processNotifications() {
  const notificationPreferences = await getActiveNotificationPreferences();

  let digestJob;
  let digestHasFailure = false;

  for (const notificationPreference of notificationPreferences) {
    if (notificationPreference.frequency === FREQUENCIES.ADHOC) continue;

    const digestResult = await processDigest(notificationPreference, digestJob);
    digestJob = digestResult.job;
    if (digestResult.failed) digestHasFailure = true;
  }

  if (digestJob !== undefined) {
    await updateStatus(
      digestJob,
      digestHasFailure ? JOB_STATUS.FAILED : JOB_STATUS.SUCCESS,
    );
  }

  if (isStatusReportDue()) {
    let statusReportJob;
    let statusReportHasFailure = false;

    for (const pref of notificationPreferences) {
      if (!pref.enabledRules.includes(NOTIFICATION_RULES.STATUS_REPORT))
        continue;
      const result = await processStatusReport(
        {
          orgUuid: pref.orgUuid,
          targetLabel: pref.targetLabel,
          emailAddress: pref.emailAddress,
          bestuurseenheid: pref.bestuurseenheid,
          uri: pref.uri,
        },
        statusReportJob,
      );
      statusReportJob = result.job;
      if (result.failed) statusReportHasFailure = true;
    }

    if (!ENABLE_STATUSREPORT_NOTIFICATIONS) {
      console.log(
        "Statusrapport notifications to bestuurseenheden disabled via ENABLE_STATUSREPORT_NOTIFICATIONS, skipping.",
      );
    } else {
      let bestuurseenheden;
      try {
        bestuurseenheden = await getAllActiveBestuurseenheden();
      } catch (error) {
        console.error(
          "Failed to get bestuurseenheden for status report processing",
          error,
        );
        statusReportHasFailure = true;
        bestuurseenheden = [];
      }

      const runStartedAt = getStatusReportPeriodStart();
      for (const b of bestuurseenheden) {
        let alreadySent = false;
        try {
          alreadySent = await hasStatusReportBeenSent(b.uri, runStartedAt);
        } catch (err) {
          console.error(
            `Error checking existing status report for ${b.bestuurseenheid}: ${err}`,
          );
          // fall through and reprocess rather than silently skip on a check failure
        }
        if (alreadySent) {
          console.log(
            `Skipping ${b.bestuurseenheid}, already sent since ${runStartedAt}.`,
          );
          continue;
        }

        const result = await processStatusReport(
          {
            orgUuid: b.orgUuid,
            targetLabel: b.bestuurseenheid,
            emailAddress: b.emailAddress,
            bestuurseenheid: b.bestuurseenheid,
            uri: b.uri,
          },
          statusReportJob,
        );
        statusReportJob = result.job;
        if (result.failed) statusReportHasFailure = true;
      }
    }

    if (statusReportJob !== undefined) {
      await updateStatus(
        statusReportJob,
        statusReportHasFailure ? JOB_STATUS.FAILED : JOB_STATUS.SUCCESS,
      );
    }
  }
}

async function processStatusReport(recipient, job) {
  let task;
  try {
    if (job === undefined) {
      job = await createJob();
      await updateStatus(job, JOB_STATUS.BUSY);
    }

    task = await createTask(job, TASK_OPERATION.STATUS_REPORT);
    await updateStatus(task, JOB_STATUS.BUSY);

    const statusReportData = await getStatusReportData(recipient.orgUuid);

    const hasNothingToReport =
      !statusReportData ||
      (statusReportData.totalHerziening === 0 &&
        statusReportData.totalFeedback === 0 &&
        statusReportData.totalFormalInformal === 0 &&
        statusReportData.totalDuplicateProductIds === 0);

    if (hasNothingToReport) {
      await updateStatus(task, JOB_STATUS.SUCCESS);
      return { job, failed: false };
    }
    const statusReportEmail = createStatusReportEmail(
      recipient.targetLabel,
      recipient.emailAddress,
      recipient.bestuurseenheid,
      statusReportData,
    );
    await insertEmail(recipient, statusReportEmail, task);

    await updateStatus(task, JOB_STATUS.SUCCESS);
    return { job, failed: false };
  } catch (err) {
    console.error(
      `Error processing status report for ${recipient.bestuurseenheid}: ${err}`,
    );
    if (job !== undefined && task !== undefined) {
      await addError(job, err, recipient.uri);
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

    const feedbackInstances = notificationPreference.enabledRules.includes(
      NOTIFICATION_RULES.FEEDBACK,
    )
      ? await getFeedbackChanges(
          notificationPreference.instanceUris,
          notificationPreference.orgUuid,
          since,
        )
      : [];

    const reviewInstances = notificationPreference.enabledRules.includes(
      NOTIFICATION_RULES.HERZIENING,
    )
      ? await getReviewStatusChanges(
          notificationPreference.instanceUris,
          notificationPreference.orgUuid,
          since,
        )
      : [];

    const formalInformalInstances =
      notificationPreference.enabledRules.includes(
        NOTIFICATION_RULES.FORMAL_INFORMAL,
      )
        ? await getFormalInformalChanges(
            notificationPreference.instanceUris,
            notificationPreference.orgUuid,
            since,
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
    console.error(
      `An error occurred when processing the digest for notificationPreference ${notificationPreference.uri}: ${err}`,
    );
    if (job !== undefined && task !== undefined) {
      await addError(job, err, notificationPreference.uri);
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

function createStatusReportEmail(
  targetLabel,
  emailAddress,
  bestuurseenheid,
  statusReportData,
) {
  const subject = `LPDC-rapport: Is de informatie over jouw lokale dienstverlening klaar voor hergebruik?`;
  const email = newEmail(FROM_EMAIL_ADDRESS, emailAddress, subject, null);

  email.htmlContent = generateStatusReportHtmlEmail(
    targetLabel,
    bestuurseenheid,
    statusReportData,
  );
  email.plainTextMessageContent = generateStatusReportPlainTextEmail(
    targetLabel,
    bestuurseenheid,
    statusReportData,
  );
  email.uri = `http://data.lblod.info/id/emails/${email.uuid}`;

  return email;
}

export async function processAdhocNotification(
  instanceUri,
  notificationPreference,
  ruleType,
) {
  try {
    const orgUuid = notificationPreference.orgUuid;
    const instanceUris = [instanceUri];

    let changes = [];
    switch (ruleType) {
      case NOTIFICATION_RULES.FEEDBACK:
        changes = await getFeedbackChanges(instanceUris, orgUuid);
        break;
      case NOTIFICATION_RULES.FORMAL_INFORMAL:
        changes = await getFormalInformalChanges(instanceUris, orgUuid);
        break;
      case NOTIFICATION_RULES.HERZIENING:
        changes = await getReviewStatusChanges(instanceUris, orgUuid);
        break;
      default:
        throw new Error(`Unknown notification rule type: ${ruleType}`);
        break;
    }

    if (changes.length === 0) return;

    const email = createAdhocEmail(notificationPreference, changes, ruleType);

    await insertEmail(notificationPreference, email);
  } catch (err) {
    console.error(
      `Failed to process adhoc notification for ${instanceUri}:`,
      err,
    );
  }
}

function createAdhocEmail(notificationPreference, changes, ruleType) {
  const feedbackInstances =
    ruleType === NOTIFICATION_RULES.FEEDBACK ? changes : [];
  const reviewInstances =
    ruleType === NOTIFICATION_RULES.HERZIENING ? changes : [];
  const formalInformalInstances =
    ruleType === NOTIFICATION_RULES.FORMAL_INFORMAL ? changes : [];

  const subject = "Een instantie vraagt je aandacht";
  const email = newEmail(
    FROM_EMAIL_ADDRESS,
    notificationPreference.emailAddress,
    subject,
    null,
  );

  email.htmlContent = generateHtmlSummaryEmail(
    notificationPreference.targetLabel,
    feedbackInstances,
    reviewInstances,
    formalInformalInstances,
    true,
  );
  email.plainTextMessageContent = generatePlainTextSummaryEmail(
    notificationPreference.targetLabel,
    feedbackInstances,
    reviewInstances,
    formalInformalInstances,
    true,
  );
  email.uri = `http://data.lblod.info/id/emails/${email.uuid}`;

  return email;
}
