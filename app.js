import { app } from "mu";
import bodyParser from "body-parser";
import { CronJob } from "cron";
import { processAdhocNotification, processNotifications } from "./lib/tasks";
import { Delta } from "./lib/delta";
import { CRON_FREQUENCY } from "./env";
import { getAdhocNotificationPreferencesForInstance } from "./utils/queries";
import { NOTIFICATION_RULES } from "./utils/constants";

// Daily cron to process the notifications for both frequencies, in case of downtime/missed runs the maximum delay would be a day instead of a week/month
CronJob.from({
  cronTime: CRON_FREQUENCY,
  onTick: async () => {
    try {
      await processNotifications();
    } catch (error) {
      console.error("Failed to process notifications", error);
    }
  },
  start: true,
  timeZone: "Europe/Brussels",
});

app.use(
  bodyParser.json({
    type: function (req) {
      return req.get("content-type").startsWith("application/json");
    },
    limit: "50mb",
  }),
);

/**
 * Delta endpoints to handle adhoc notifications
 */
app.post("/delta-feedback", async (req, res) => {
  try {
    const feedbackInstances = new Delta(req.body).getInsertsFor(
      "https://productencatalogus.data.vlaanderen.be/ns/ipdc-lpdc#feedbackAvailable",
      "true",
    );
    for (const instance of feedbackInstances) {
      const notificationPreferences =
        await getAdhocNotificationPreferencesForInstance(
          instance,
          NOTIFICATION_RULES.FEEDBACK,
        );
      for (const preference of notificationPreferences) {
        try {
          await processAdhocNotification(
            instance,
            preference,
            NOTIFICATION_RULES.FEEDBACK,
          );
        } catch (err) {
          console.error(
            `Failed to process notification for instance ${instance}, preference ${preference}:`,
            err,
          );
        }
      }
    }

    return res.status(204).send();
  } catch (e) {
    console.error("Error in delta-feedback", e);
    return res.status(500).send({ error: e.message });
  }
});

app.post("/delta-formal-informal", async (req, res) => {
  try {
    const formalInformalInstances = new Delta(req.body).getInsertsFor(
      "https://productencatalogus.data.vlaanderen.be/ns/ipdc-lpdc#needsConversionFromFormalToInformal",
      "true",
    );
    for (const instance of formalInformalInstances) {
      const notificationPreferences =
        await getAdhocNotificationPreferencesForInstance(
          instance,
          NOTIFICATION_RULES.FORMAL_INFORMAL,
        );
      for (const preference of notificationPreferences) {
        try {
          await processAdhocNotification(
            instance,
            preference,
            NOTIFICATION_RULES.FORMAL_INFORMAL,
          );
        } catch (err) {
          console.error(
            `Failed to process notification for instance ${instance}, preference ${preference}:`,
            err,
          );
        }
      }
    }

    return res.status(204).send();
  } catch (e) {
    console.error("Error in delta-formal-informal", e);
    return res.status(500).send({ error: e.message });
  }
});

app.post("/delta-review-status", async (req, res) => {
  try {
    const archived = new Delta(req.body).getInsertsFor(
      "http://mu.semte.ch/vocabularies/ext/reviewStatus",
      "http://lblod.data.gift/concepts/review-status/concept-gearchiveerd",
    );
    const modified = new Delta(req.body).getInsertsFor(
      "http://mu.semte.ch/vocabularies/ext/reviewStatus",
      "http://lblod.data.gift/concepts/review-status/concept-gewijzigd",
    );
    const reviewStatusInstances = [...new Set([...archived, ...modified])];
    for (const instance of reviewStatusInstances) {
      const notificationPreferences =
        await getAdhocNotificationPreferencesForInstance(
          instance,
          NOTIFICATION_RULES.HERZIENING,
        );
      for (const preference of notificationPreferences) {
        try {
          await processAdhocNotification(
            instance,
            preference,
            NOTIFICATION_RULES.HERZIENING,
          );
        } catch (err) {
          console.error(
            `Failed to process notification for instance ${instance}, preference ${preference}:`,
            err,
          );
        }
      }
    }

    return res.status(204).send();
  } catch (e) {
    console.error("Error in delta-review-status", e);
    return res.status(500).send({ error: e.message });
  }
});

app.get("/", function (req, res) {
  res.send("Hello from lpdc-email-notification-service");
});
