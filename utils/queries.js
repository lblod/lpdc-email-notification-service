import {
  sparqlEscapeUri,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  uuid,
} from "mu";
import { querySudo as query, updateSudo as update } from "@lblod/mu-auth-sudo";
import {
  SYSTEM_EMAIL_GRAPH,
  OUTBOX_FOLDER_URI,
  FROM_EMAIL_ADDRESS,
} from "../env";
import { PREFIXES, FEEDBACK_STATUS, SERVICE_URI } from "./constants";
import { userGraph, orgGraph } from "./utils";

// TODO:
export async function getActiveSubscriptions(frequency) {
  const queryString = `
   ${PREFIXES}
   `;

  const queryResult = await query(queryString);
// TODO: change back to array of instanceUris
export async function getFeedbackChanges(instanceUri, since, orgUuid) {
  if (!instanceUri) return [];

  const escapedUri = sparqlEscapeUri(instanceUri);
  const queryString = `
    ${PREFIXES}
    SELECT ?instanceUri ?title ?creator ?feedbackModifiedDate ?creatorFirstName ?creatorFamilyName ?lastModifier ?lastModifierFirstName ?lastModifierFamilyName ?feedbackText ?feedbackOrganizationLabel ?feedbackDate WHERE {
          GRAPH ${userGraph(orgUuid)} {
            VALUES ?instanceUri { ${escapedUri} }

            ?instanceUri lpdcExt:feedbackAvailable true ;
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
            FILTER(?feedbackModifiedDate >= ${sparqlEscapeDateTime(since)})
          }
          OPTIONAL {
            GRAPH ${orgGraph(orgUuid)} {
              ?creator foaf:firstName ?creatorFirstName ;
                      foaf:familyName ?creatorFamilyName .
            }
          }
          OPTIONAL {
            GRAPH ${orgGraph(orgUuid)} {
              ?lastModifier foaf:firstName ?lastModifierFirstName ;
                            foaf:familyName ?lastModifierFamilyName .
            }
          }
          OPTIONAL {
            GRAPH <http://mu.semte.ch/graphs/public> {
              ?feedbackOrganization skos:prefLabel ?feedbackOrganizationLabel .
            }
          }
        }
   `;

  const queryResult = await query(queryString);
  return (queryResult.results?.bindings || []).map((binding) => {
    const creatorFirstName = binding.creatorFirstName?.value || "";
    const creatorLastName = binding.creatorFamilyName?.value || "";
    const creatorFullName = `${creatorFirstName} ${creatorLastName}`.trim();

    const modifierFirstName = binding.lastModifierFirstName?.value || "";
    const modifierLastName = binding.lastModifierFamilyName?.value || "";
    const modifierFullName = `${modifierFirstName} ${modifierLastName}`.trim();

    return {
      instanceUri: binding.instanceUri.value,
      title: binding.title?.value || "",
      creator: creatorFullName || "Onbekend",
      lastModifier: modifierFullName || "Onbekend",
      feedbackText: binding.feedbackText?.value || "",
      feedbackOrganization: binding.feedbackOrganizationLabel?.value || "Onbekend",
      feedbackModifiedDate: new Date(binding.feedbackModifiedDate?.value),
      feedbackDate: new Date(binding.feedbackDate?.value),
    };
  });
}
export async function getFormalInformalChanges(instanceUris, since, orgUuid) {
  return [];
}
export async function getReviewChanges(instanceUris, since, orgUuid) {
  return [];
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
      FILTER STRSTARTS(str(?g), "http://mu.semte.ch/graphs/organizations/")
      FILTER STRENDS(str(?g), "/LoketLB-LPDCGebruiker")
    }
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
                                      dct:creator ${sparqlEscapeUri(SERVICE_URI)} ;
                                      dct:references ${sparqlEscapeUri(subscription.uri)} ;
                                      dct:created ${sparqlEscapeDateTime(now)} .
      }
    }`;
    await update(emailQuery);
  } catch (err) {
    console.log("error", err);
    throw new Error(err);
  }
}
