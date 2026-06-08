import env from "env-var";

const IPDC_URL = env
  .get("IPDC_URL")
  .default("https://productcatalogus.ipdc.vlaanderen.be")
  .asString();
const WEEKLY_CRON = env.get("INGEST_CRON").default("0 8 * * 1").asString();
const MONTHLY_CRON = env.get("PUBLISH_CRON").default("0 8 1 * *").asString();
const FROM_EMAIL_ADDRESS = env
  .get("FROM_EMAIL_ADDRESS")
  .default(
    "Agentschap Binnenlands Bestuur Vlaanderen <noreply-binnenland@vlaanderen.be>",
  )
  .asString();

export { IPDC_URL, WEEKLY_CRON, MONTHLY_CRON, FROM_EMAIL_ADDRESS };
