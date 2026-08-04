import { formatInTimeZone } from "date-fns-tz";
import { sparqlEscapeUri } from "mu";
import { FREQUENCIES, MAX_INSTANCES_PER_EMAIL_SECTION, REPORT_MONTHS, RETRY_WINDOW_DAYS} from "./constants";
import { convert } from "html-to-text";

export function getUUIDFromUri(uri) {
  const segmentedUri = uri.split("/");
  return segmentedUri[segmentedUri.length - 1];
}

export function getWindowStart(frequency) {
  const now = new Date();
  if (frequency === FREQUENCIES.WEEKLY) now.setDate(now.getDate() - 7);
  if (frequency === FREQUENCIES.MONTHLY) now.setMonth(now.getMonth() - 1);
  return now;
}

export function formatDate(date) {
  return formatInTimeZone(date, "Europe/Brussels", "dd/MM/yyyy HH:mm");
}

export function userGraph(orgUuid) {
  return sparqlEscapeUri(
    `http://mu.semte.ch/graphs/organizations/${orgUuid}/LoketLB-LPDCGebruiker`,
  );
}

export function orgGraph(orgUuid) {
  return sparqlEscapeUri(`http://mu.semte.ch/graphs/organizations/${orgUuid}`);
}

export function stripHtmlAndTruncate(htmlString, maxLength = 100) {
  const text = convert(htmlString ?? "", {
    wordwrap: false,
  })
    .replace(/\s+/g, " ")
    .trim();

  if (text.length > maxLength) {
    return `${text.substring(0, maxLength).trim()}...`;
  }

  return text;
}

export function buildIpdcCompareUrl(ipdcUrl, productID, dutchLanguageVariant, versionedSource, hasLatestFunctionalChange) {
  const languageVersion = dutchLanguageVariant?.toLowerCase() === "nl-be-x-informal"
    ? "nl/informeel"
    : "nl";
  const publicServiceSnapshot = getUUIDFromUri(versionedSource);
  const latestSnapshot = getUUIDFromUri(hasLatestFunctionalChange);
  return `${ipdcUrl}/${languageVersion}/concept/${productID}/revisie/vergelijk?revisie1=${publicServiceSnapshot}&revisie2=${latestSnapshot}`;
}

export function sortAndLimitInstances(instances, dateField) {
  return [...instances]
    .sort((a, b) => new Date(b[dateField]) - new Date(a[dateField]))
    .slice(0, MAX_INSTANCES_PER_EMAIL_SECTION);
}

// Checks if the statusReport is due, with a 2 day retry window (RETRY_WINDOW_DAYS) in case of errors
// => will run on march 1 and 2 & september 1 and 2
export function isStatusReportDue() {
  const now = new Date();
  const currentMonth = now.getUTCMonth();
  const dayOfMonth = now.getUTCDate();

  const isReportMonth = REPORT_MONTHS.includes(currentMonth);
  const isWithinRetryWindow = dayOfMonth <= RETRY_WINDOW_DAYS;

  return isReportMonth && isWithinRetryWindow;
}

// Generates the ISO timestamp representing the start of the current reporting period.
export function getStatusReportPeriodStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
