import { formatInTimeZone } from "date-fns-tz";
import { sparqlEscapeUri } from "mu";
import { FREQUENCIES } from "./constants.js";

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
  let cleanText = htmlString
    .replace(/<\/p>|<\/div>|<br\s*\/?>/gi, " ")
    .replace(/<\/?[^>]+(>|$)/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  if (cleanText.length > maxLength) {
    return cleanText.substring(0, maxLength).trim() + "...";
  }

  return cleanText;
}

export function buildIpdcCompareUrl(ipdcUrl, productID, dutchLanguageVariant, versionedSource, hasLatestFunctionalChange) {
  const languageVersion = dutchLanguageVariant?.toLowerCase() === "nl-be-x-informal"
    ? "nl/informeel"
    : "nl";
  const publicServiceSnapshot = getUUIDFromUri(versionedSource);
  const latestSnapshot = getUUIDFromUri(hasLatestFunctionalChange);
  return `${ipdcUrl}/${languageVersion}/concept/${productID}/revisie/vergelijk?revisie1=${publicServiceSnapshot}&revisie2=${latestSnapshot}`;
}

export function isStatusReportDue() { 
  const now = new Date();
  const month = now.getMonth(); 
  const day = now.getDate();
  //Jan 1 and Jul 1
  return (month === 0 && day === 1) || (month === 6 && day === 1);
}