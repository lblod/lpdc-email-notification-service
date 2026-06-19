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

// TODO: Gebruikersinfo (bestuurseenheid, wil mail ontvangen en linked notification preference)
export async function getActiveNotificationPreferences(frequency) {
  const queryString = `
   ${PREFIXES}
    SELECT ?notificationPreference ?instanceUri ?emailAddress
          ?lastNotifiedAt ?notifyFeedback ?notifyReviewNeeded ?notifyFormalInformal
          ?wilMailOntvangen ?bestuurseenheid
    WHERE {
      GRAPH ?g {
        ?gebruiker a foaf:Person ;
                  ext:wilMailOntvangen ?wilMailOntvangen ;
                  foaf:member ?bestuurseenheid ;
                  lpdcExt:hasNotificationPreference ?notificationPreference .

        ?notificationPreference a ext:NotificationPreference ;
                                ext:mailAdresVoorNotificaties ?emailAddress ;
                                ext:notificationFrequency ${sparqlEscapeString(frequency)} ;
                                lpdcExt:notifyFeedback ?notifyFeedback ;
                                lpdcExt:notifyReviewStatus ?notifyReviewNeeded ;
                                lpdcExt:notifyFormalInformal ?notifyFormalInformal .

        OPTIONAL {
          ?notificationPreference ext:notificationInstance ?instanceUri .
        }

        OPTIONAL {
          ?notificationPreference lpdcExt:lastNotifiedAt ?lastNotifiedAt .
        }
      }

      FILTER STRSTARTS(STR(?g), "http://mu.semte.ch/graphs/organizations/")
      FILTER STRENDS(STR(?g), "/LoketLB-LPDCGebruiker")
      FILTER(?wilMailOntvangen = true)
    }
   `;

  const queryResult = await query(queryString);
  const bindings = queryResult.results?.bindings || [];

  // Group by subscription URI, as there can be multiple instanceUris per subscription
  const map = new Map();
  for (const binding of bindings) {
    const uri = binding.notificationPreference.value;
    if (!map.has(uri)) {
      map.set(uri, {
      uri,
      frequency,
      emailAddress: binding.emailAddress.value,
      lastNotifiedAt: binding.lastNotifiedAt?.value
        ? new Date(binding.lastNotifiedAt.value)
        : null,
      bestuurseenheidUri: binding.bestuurseenheid?.value,
      notifyFeedback: binding.notifyFeedback?.value === "true",
      notifyReviewNeeded: binding.notifyReviewNeeded?.value === "true",
      notifyFormalInformal: binding.notifyFormalInformal?.value === "true",
      instanceUris: [],
    });
    }

    if (binding.instanceUri?.value) {
      map.get(uri).instanceUris.push(binding.instanceUri.value);
    }
  }

  console.log(
    "Finished grouping the subscriptions by URI, result:",
    Array.from(map.values()),
  );
  return Array.from(map.values());
}

export async function getFeedbackChanges(instanceUris, since, orgUuid) {
  if (!instanceUris || instanceUris.length === 0) return [];

  const escapedUris = instanceUris
    .map((uri) => sparqlEscapeUri(uri))
    .join(" ");
  const queryString = `
    ${PREFIXES}
    SELECT DISTINCT ?instanceUri ?title ?creator ?feedbackModifiedDate ?creatorFirstName ?creatorFamilyName ?lastModifier ?lastModifierFirstName ?lastModifierFamilyName ?feedbackText ?feedbackOrganizationLabel ?feedbackDate WHERE {
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
      feedbackOrganization:
        binding.feedbackOrganizationLabel?.value || "Onbekend",
      feedbackModifiedDate: new Date(binding.feedbackModifiedDate?.value),
      feedbackDate: new Date(binding.feedbackDate?.value),
    };
  });
}

export async function getFormalInformalChanges(instanceUris, since, orgUuid) {
  if (!instanceUris || instanceUris.length === 0) return [];

  const escapedUris = instanceUris
    .map((uri) => sparqlEscapeUri(uri))
    .join(" ");
  const queryString = `
    ${PREFIXES}
    SELECT ?instanceUri ?title ?creator ?formalInformalModifiedDate ?dutchLanguageVariant ?creatorFirstName ?creatorFamilyName ?lastModifier ?lastModifierFirstName ?lastModifierFamilyName
    WHERE {
      GRAPH ${userGraph(orgUuid)} {
        VALUES ?instanceUri { ${escapedUris} }

        ?instanceUri lpdcExt:needsConversionFromFormalToInformal true ;
                     lpdcExt:dutchLanguageVariant ?dutchLanguageVariant ;
                     lpdcExt:formalInformalModifiedDate ?formalInformalModifiedDate .

        OPTIONAL { ?instanceUri dct:title ?title . }
        OPTIONAL { ?instanceUri dct:creator ?creator . }
        OPTIONAL { ?instanceUri ext:lastModifiedBy ?lastModifier . }

        FILTER(?formalInformalModifiedDate >= ${sparqlEscapeDateTime(since)})
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
      dutchLanguageVariant: binding.dutchLanguageVariant?.value || "",
      formalInformalModifiedDate: new Date(
        binding.formalInformalModifiedDate.value
      ),
    };
  });
}

export async function getReviewStatusChanges(instanceUris, since, orgUuid) {
  if (!instanceUris || instanceUris.length === 0) return [];

  const escapedUris = instanceUris
    .map((uri) => sparqlEscapeUri(uri))
    .join(" ");
  const queryString = `
    ${PREFIXES}
    SELECT DISTINCT ?instanceUri ?title ?creator ?status ?productID ?reviewStatusModifiedDate ?creatorFirstName ?creatorFamilyName ?lastModifier ?lastModifierFirstName ?lastModifierFamilyName ?versionedSource ?hasLatestFunctionalChange
    WHERE {
      GRAPH ${userGraph(orgUuid)} {
        VALUES ?instanceUri { ${escapedUris} }

        ?instanceUri ext:reviewStatus ?status ;
                     schema:productID ?productID ;
                     lpdcExt:reviewStatusModifiedDate ?reviewStatusModifiedDate .

        OPTIONAL { ?instanceUri dct:title ?title . }
        OPTIONAL { ?instanceUri dct:creator ?creator . }
        OPTIONAL { ?instanceUri ext:lastModifiedBy ?lastModifier . }
        OPTIONAL { ?instanceUri ext:versionedSource ?versionedSource . }

        OPTIONAL { ?instanceUri dct:source ?source .
                   ?source lpdc:hasLatestFunctionalChange ?hasLatestFunctionalChange .}

        FILTER(?reviewStatusModifiedDate >= ${sparqlEscapeDateTime(since)})
        FILTER(?status IN (
          <http://lblod.data.gift/concepts/review-status/concept-gewijzigd>,
          <http://lblod.data.gift/concepts/review-status/concept-gearchiveerd>
        ))
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
    }
  `;

  const statusMap = {
    "http://lblod.data.gift/concepts/review-status/concept-gewijzigd": "gewijzigd",
    "http://lblod.data.gift/concepts/review-status/concept-gearchiveerd": "gearchiveerd",
  };

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
      productID: binding.productID.value,
      creator: creatorFullName || "Onbekend",
      lastModifier: modifierFullName || "Onbekend",
      status: statusMap[binding.status?.value],
      versionedSource: binding.versionedSource?.value || "Onbekend",
      hasLatestFunctionalChange: binding.hasLatestFunctionalChange?.value || "Onbekend",
      reviewStatusModifiedDate: new Date(binding.reviewStatusModifiedDate.value),
    };
  });
}

export async function updateLastNotifiedAt(subscriptionUri, date) {
  const queryString = `
    ${PREFIXES}
    DELETE {
      GRAPH ?g {
        ${sparqlEscapeUri(subscriptionUri)} lpdcExt:lastNotifiedAt ?oldTime .
      }
    }
    INSERT {
      GRAPH ?g {
        ${sparqlEscapeUri(subscriptionUri)} lpdcExt:lastNotifiedAt ${sparqlEscapeDateTime(date)} .
      }
    }
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(subscriptionUri)} a ext:NotificationPreference .
        OPTIONAL { ${sparqlEscapeUri(subscriptionUri)} lpdcExt:lastNotifiedAt ?oldTime . }
      }
      FILTER STRSTARTS(STR(?g), "http://mu.semte.ch/graphs/organizations/")
      FILTER STRENDS(STR(?g), "/LoketLB-LPDCGebruiker")
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
