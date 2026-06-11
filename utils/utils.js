import { formatInTimeZone } from "date-fns-tz";
import { sparqlEscapeUri } from "mu";

export function getUUIDFromUri(uri) {
  const segmentedUri = uri.split("/");
  return segmentedUri[segmentedUri.length - 1];
}

export function getWindowStart(frequency) {
  const now = new Date();
  if (frequency === "weekly") now.setDate(now.getDate() - 7);
  if (frequency === "monthly") now.setMonth(now.getMonth() - 1);
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
