import { app } from "mu";
import bodyParser from "body-parser";
import { CronJob } from "cron";
import { processNotifications } from "./lib/tasks";
import { WEEKLY_CRON, MONTHLY_CRON } from "./env";

const weeklyJob = new CronJob(WEEKLY_CRON, () =>
  processNotifications("weekly"),
);
weeklyJob.start();
console.log(
  `Registered a weekly task for fetching and processing instance subscription notifications at ${new Date().toISOString()}`,
);

const monthlyJob = new CronJob(MONTHLY_CRON, () =>
  processNotifications("monthly"),
);
monthlyJob.start();
console.log(
  `Registered a monthly task for fetching and processing instance subscription notifications at ${new Date().toISOString()}`,
);

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
