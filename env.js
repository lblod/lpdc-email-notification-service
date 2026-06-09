import env from "env-var";

const IPDC_URL = env
  .get("IPDC_URL")
  .default("https://productcatalogus.ipdc.vlaanderen.be")
  .asString();
const WEEKLY_CRON = env.get("WEEKLY_CRON").default("0 8 * * 1").asString();
const MONTHLY_CRON = env.get("MONTHLY_CRON").default("0 8 1 * *").asString();
const FROM_EMAIL_ADDRESS = env
  .get("FROM_EMAIL_ADDRESS")
  .default(
    "Agentschap Binnenlands Bestuur Vlaanderen <noreply-binnenland@vlaanderen.be>",
  )
  .asString();
const SYSTEM_EMAIL_GRAPH = env
  .get("SYSTEM_EMAIL_GRAPH")
  .default("http://mu.semte.ch/graphs/system/email")
  .asString();
const OUTBOX_FOLDER_URI = env
  .get("OUTBOX_FOLDER_URI")
  .default("http://data.lblod.info/id/mail-folders/2")
  .asString();

export {
  IPDC_URL,
  WEEKLY_CRON,
  MONTHLY_CRON,
  FROM_EMAIL_ADDRESS,
  SYSTEM_EMAIL_GRAPH,
  OUTBOX_FOLDER_URI,
};
