import {
  sparqlEscapeUri,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  uuid,
} from "mu";
import { querySudo as query, updateSudo as update } from "@lblod/mu-auth-sudo";
import {
  ORG_GRAPH_BASE,
  ORG_GRAPH_SUFFIX,
  SYSTEM_EMAIL_GRAPH,
  OUTBOX_FOLDER_URI,
  ERROR_GRAPH,
} from "../config";
import { prefixes, feedbackStatus } from "./constants";

// TODO:
export async function getActiveSubscriptions(cadence) {
  const queryString = `
   ${prefixes}
   `;

  const queryResult = await query(queryString);
}

export async function getFeedbackChanges(instanceUris, since) {
  if (!instanceUris || instanceUris.length === 0) return [];

  const escapedUris = instanceUris.map((uri) => sparqlEscapeUri(uri)).join(" ");
  const queryString = `
    ${prefixes}
    SELECT ?instanceUri ?title ?creator ?lastModifier ?feedbackModifiedDate ?feedbackText ?feedbackOrganization ?feedbackDate WHERE {
          GRAPH ?g {
            VALUES ?instanceUri { ${escapedUris} }

            ?instanceUri ipdc:feedbackAvailable true ;
                         ext:feedbackModifiedDate ?feedbackModifiedDate .
            OPTIONAL {
              ?instanceUri dct:title ?title .
            }
            OPTIONAL {
              ?instanceUri dct:creator ?creator .
            }
            OPTIONAL {
              ?instanceUri ext:lastModifiedBy ?lastModifier .
            }

            ?feedback skos:primarySubject ?instanceUri;
                      schema2:actionStatus <${feedbackStatus.OPEN}>;
                      schema2:dateCreated ?feedbackDate;
                      schema2:question ?question .

            ?question schema2:agent ?feedbackOrganization;
                      schema2:question ?feedbackText .

            FILTER NOT EXISTS {
              ?newerFeedback skos:primarySubject ?instanceUri;
                             schema2:actionStatus <${feedbackStatus.OPEN}>;
                             schema2:dateCreated ?newerFeedbackDate .

              FILTER (?newerFeedbackDate > ?feedbackDate || (?newerFeedbackDate = ?feedbackDate && str(?newerFeedback) > str(?feedback)))
            }

            FILTER STRSTARTS(str(?g), "http://mu.semte.ch/graphs/organizations/")
            FILTER STRENDS(str(?g), "/LoketLB-LPDCGebruiker")
            FILTER(?feedbackModifiedDate >= ${sparqlEscapeDateTime(since)})
          }
        }
   `;

  const queryResult = await query(queryString);
  return (queryResult.results?.bindings || []).map((binding) => ({
    instanceUri: binding.instanceUri.value,
    title: binding.title?.value || "",
    creator: binding.creator?.value || "Onbekend",
    lastModifier: binding.lastModifier?.value || "Onbekend",
    feedbackText: binding.feedbackText?.value || "",
    feedbackOrganization: binding.feedbackOrganization.value,
    feedbackModifiedDate: binding.feedbackModifiedDate?.value,
    feedbackDate: binding.feedbackDate?.value,
  }));
}
