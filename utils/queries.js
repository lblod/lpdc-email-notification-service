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
  FROM_EMAIL_ADDRESS,
} from "../env";
import { PREFIXES, FEEDBACK_STATUS, SERVICE_URI } from "./constants";

// TODO:
export async function getActiveSubscriptions(frequency) {
  const queryString = `
   ${PREFIXES}
   `;

  const queryResult = await query(queryString);
}

export async function getFeedbackChanges(instanceUris, since) {
  if (!instanceUris || instanceUris.length === 0) return [];

  const escapedUris = instanceUris.map((uri) => sparqlEscapeUri(uri)).join(" ");
  const queryString = `
    ${PREFIXES}
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
                      schema2:actionStatus <${FEEDBACK_STATUS.OPEN}>;
                      schema2:dateCreated ?feedbackDate;
                      schema2:question ?question .

            ?question schema2:agent ?feedbackOrganization;
                      schema2:question ?feedbackText .

            FILTER NOT EXISTS {
              ?newerFeedback skos:primarySubject ?instanceUri;
                             schema2:actionStatus <${FEEDBACK_STATUS.OPEN}>;
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

// TODO: subject to change once subscription data model is defined
export async function updateLastNotifiedAt(subscriptionUri, date) {
  const queryString = `
    ${PREFIXES}
    DELETE {
      GRAPH ?g {
        ${sparqlEscapeUri(subscriptionUri)} ext:lastNotifiedAt ?oldTime .
      }
    }
    INSERT {
      GRAPH ?g {
        ${sparqlEscapeUri(subscriptionUri)} ext:lastNotifiedAt ${sparqlEscapeDateTime(date)} .
      }
    }
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(subscriptionUri)} a ext:Subscription .
        OPTIONAL { ${sparqlEscapeUri(subscriptionUri)} ext:lastNotifiedAt ?oldTime . }
      }
    }
    FILTER STRSTARTS(str(?g), "http://mu.semte.ch/graphs/organizations/")
    FILTER STRENDS(str(?g), "/LoketLB-LPDCGebruiker")
  `;
  await update(queryString);
}

/**
 * Puts email in the right mail folder graph for sending
 * @param {object} subscription
 * @param {Object} email
 */
export async function insertEmail(subscription, email) {
  try {
    const now = new Date();
    const emailQuery = `
    ${PREFIXES}
    INSERT DATA {
      GRAPH ${sparqlEscapeUri(SYSTEM_EMAIL_GRAPH)} {
        ${sparqlEscapeUri(email.uri)} rdf:type nmo:Email ;
                                      mu:uuid ${sparqlEscapeString(email.uuid)} ;
                                      nmo:isPartOf ${sparqlEscapeUri(OUTBOX_FOLDER_URI)} ;
                                      nmo:htmlMessageContent ${sparqlEscapeString(email.htmlContent)} ;
                                      nmo:plainTextMessageContent ${sparqlEscapeString(email.plainTextMessageContent)} ;
                                      nmo:messageSubject ${sparqlEscapeString(email.subject)} ;
                                      nmo:emailTo ${sparqlEscapeString(email.to)} ;
                                      nmo:messageFrom ${sparqlEscapeString(FROM_EMAIL_ADDRESS)} ;
                                      dcterms:creator ${sparqlEscapeUri(SERVICE_URI)} ;
                                      dcterms:references ${sparqlEscapeUri(subscription.uri)} ;
                                      dcterms:created ${sparqlEscapeDateTime(now)} .
      }
    }`;
    await update(emailQuery);
  } catch (err) {
    console.log("error", err);
    throw new Error(err);
  }
}
