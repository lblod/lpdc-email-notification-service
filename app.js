import { app } from "mu";
import bodyParser from "body-parser";
import { CronJob } from "cron";
import { processNotifications } from "./lib/tasks";
import { CRON_FREQUENCY } from "./env";
import { FREQUENCIES } from "./utils/constants.js";

// Daily cron to process the notifications for both frequencies, in case of downtime/missed runs the maximum delay would be a day instead of a week/month
new CronJob(CRON_FREQUENCY, async () => {
  await Promise.all([
    processNotifications(FREQUENCIES.WEEKLY),
    processNotifications(FREQUENCIES.MONTHLY),
  ]);
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
