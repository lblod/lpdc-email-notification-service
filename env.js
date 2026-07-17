import env from "env-var";

const LPDC_URL = env
  .get("LPDC_URL")
  .default("https://lpdc.lokaalbestuur.vlaanderen.be")
  .asString();
const IPDC_URL = env
  .get("IPDC_URL")
  .default("https://productcatalogus.ipdc.tni-vlaanderen.be")
  .asString();
const CRON_FREQUENCY = env.get("CRON_FREQUENCY").default("0 8 * * *").asString();
const FROM_EMAIL_ADDRESS = env
  .get("FROM_EMAIL_ADDRESS")
  .default(
    "Agentschap Binnenlands Bestuur Vlaanderen <noreply-binnenland@vlaanderen.be>",
  )
  .asString();
const OUTBOX_FOLDER_URI = env
  .get("OUTBOX_FOLDER_URI")
  .default("http://data.lblod.info/id/mail-folders/2")
  .asString();
const ENABLE_NOTIFICATIONS = process.env.ENABLE_NOTIFICATIONS !== "false";

export {
  LPDC_URL,
  IPDC_URL,
  CRON_FREQUENCY,
  FROM_EMAIL_ADDRESS,
  OUTBOX_FOLDER_URI,
  ENABLE_NOTIFICATIONS
};
