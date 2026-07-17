import { app } from "mu";
import bodyParser from "body-parser";
import { CronJob } from "cron";
import { processNotifications } from "./lib/tasks";
import { CRON_FREQUENCY } from "./env";

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
  }),
);

app.get("/", function (req, res) {
  res.send("Hello from lpdc-email-notification-service");
});
