import {
  sparqlEscapeUri,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  uuid,
} from "mu";
import { querySudo as query, updateSudo as update } from "@lblod/mu-auth-sudo";
import {
  OUTBOX_FOLDER_URI,
  FROM_EMAIL_ADDRESS,
} from "../env";
import {
  PREFIXES,
  FEEDBACK_STATUS,
  SERVICE_URI,
  JOB_STATUS,
  JOB_OPERATION,
  JOB_TYPE,
  JOB_GRAPH,
  TASK_TYPE,
  JOB_URI_PREFIX,
  TASK_URI_PREFIX,
  ERROR_URI_PREFIX,
  SYSTEM_EMAIL_GRAPH,
} from "./constants";
import { userGraph, orgGraph, getUUIDFromUri } from "./utils";

// TODO: Gebruikersinfo (bestuurseenheid, wil mail ontvangen en linked notification preference)
export async function getActiveNotificationPreferences() {
  const queryString = `
   ${PREFIXES}
    SELECT DISTINCT ?notificationPreference ?instanceUri ?emailAddress ?frequency
          ?lastNotifiedAt ?rule ?bestuurseenheid ?gebruikerFirstName ?gebruikerFamilyName
    WHERE {
      GRAPH ?orgGraph {
        ?gebruiker a foaf:Person ;
                  foaf:member ?bestuurseenheid ;
                  foaf:firstName ?gebruikerFirstName ;
                  foaf:familyName ?gebruikerFamilyName .
      }
      GRAPH ?userGraph {
        ?notificationPreference a lpdcExt:NotificationPreference ;
                                dct:creator ?gebruiker ;
                                schema:email ?emailAddress ;
                                lpdcExt:notificationsEnabled ?notificationsEnabled ;
                                lpdcExt:hasNotificationRuleConfig ?ruleConfig .

        FILTER(?notificationsEnabled = true)

        ?ruleConfig lpdcExt:notificationFrequency ?frequency ;
                    lpdcExt:hasEnabledRule ?rule .

        OPTIONAL {
          ?notificationPreference lpdcExt:notificationInstance ?instanceUri .
        }

        OPTIONAL {
          ?notificationPreference lpdcExt:lastNotifiedAt ?lastNotifiedAt .
        }
      }
      FILTER STRSTARTS(STR(?userGraph), "http://mu.semte.ch/graphs/organizations/")
      FILTER STRENDS(STR(?userGraph), "/LoketLB-LPDCGebruiker")
      FILTER STRSTARTS(STR(?orgGraph), "http://mu.semte.ch/graphs/organizations/")
    }
   `;

  const queryResult = await query(queryString);
  const bindings = queryResult.results?.bindings || [];

  // Group by notification preferences URI, as there can be multiple instanceUris per notification preference
  const map = new Map();
  for (const binding of bindings) {
    const uri = binding.notificationPreference.value;
    if (!map.has(uri)) {
      const gebruikerFirstName = binding.gebruikerFirstName?.value || "";
      const gebruikerFamilyName = binding.gebruikerFamilyName?.value || "";
      const gebruikerFullName = `${gebruikerFirstName} ${gebruikerFamilyName}`.trim();
      map.set(uri, {
        uri,
        emailAddress: binding.emailAddress.value,
        frequency: binding.frequency.value,
        enabledRules: [],
        lastNotifiedAt: binding.lastNotifiedAt?.value
          ? new Date(binding.lastNotifiedAt.value)
          : null,
        orgUuid: getUUIDFromUri(binding.bestuurseenheid.value),
        targetLabel: gebruikerFullName,
        instanceUris: [],
      });
    }

    if (binding.rule?.value) {
      const rules = map.get(uri).enabledRules;
      if (!rules.includes(binding.rule.value)) {
        rules.push(binding.rule.value);
      }
    }

    if (binding.instanceUri?.value) {
      const instanceUris = map.get(uri).instanceUris;
      if (!instanceUris.includes(binding.instanceUri.value)) {
        instanceUris.push(binding.instanceUri.value);
      }
    }
  }

  console.log(
    "Finished grouping the notification preferences by URI, result:",
    Array.from(map.values()),
  );
  return Array.from(map.values());
}

export async function getFeedbackChanges(instanceUris, since, orgUuid) {
  if (!instanceUris || instanceUris.length === 0) return [];

  const escapedUris = instanceUris.map((uri) => sparqlEscapeUri(uri)).join("\n");
  const queryString = `
    ${PREFIXES}
    SELECT DISTINCT ?instanceUri ?title ?feedbackModifiedDate ?creator ?creatorFirstName ?creatorFamilyName ?lastModifier ?lastModifierFirstName ?lastModifierFamilyName ?feedbackText ?feedbackOrganizationLabel ?feedbackDate WHERE {
          GRAPH ${userGraph(orgUuid)} {
            VALUES ?instanceUri { ${escapedUris} }

            ?instanceUri lpdcExt:feedbackAvailable true ;
                         lpdcExt:feedbackModifiedDate ?feedbackModifiedDate .
            OPTIONAL {
              ?instanceUri dct:title ?title .
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
            GRAPH ${userGraph(orgUuid)} {
              ?instanceUri dct:creator ?creator .
            }
            GRAPH ${orgGraph(orgUuid)} {
              OPTIONAL {
                ?creator foaf:firstName ?creatorFirstName ;
                        foaf:familyName ?creatorFamilyName .
              }
            }
          }

          OPTIONAL {
            GRAPH ${userGraph(orgUuid)} {
              ?instanceUri ext:lastModifiedBy ?lastModifier .
            }
            GRAPH ${orgGraph(orgUuid)} {
              OPTIONAL {
                ?lastModifier foaf:firstName ?lastModifierFirstName ;
                              foaf:familyName ?lastModifierFamilyName .
              }
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
      feedbackModifiedDate: new Date(binding.feedbackModifiedDate.value),
      feedbackDate: new Date(binding.feedbackDate?.value),
    };
  });
}

export async function getFormalInformalChanges(instanceUris, since, orgUuid) {
  if (!instanceUris || instanceUris.length === 0) return [];

  const escapedUris = instanceUris.map((uri) => sparqlEscapeUri(uri)).join("\n");
  const queryString = `
    ${PREFIXES}
    SELECT DISTINCT ?instanceUri ?title ?creator ?formalInformalModifiedDate ?dutchLanguageVariant ?creatorFirstName ?creatorFamilyName ?lastModifier ?lastModifierFirstName ?lastModifierFamilyName
    WHERE {
      GRAPH ${userGraph(orgUuid)} {
        VALUES ?instanceUri { ${escapedUris} }

        ?instanceUri lpdcExt:needsConversionFromFormalToInformal true ;
                    lpdcExt:dutchLanguageVariant ?dutchLanguageVariant ;
                    lpdcExt:formalInformalModifiedDate ?formalInformalModifiedDate .

        OPTIONAL { ?instanceUri dct:title ?title . }

        FILTER(?formalInformalModifiedDate >= ${sparqlEscapeDateTime(since)})
      }

      OPTIONAL {
        GRAPH ${userGraph(orgUuid)} {
          ?instanceUri dct:creator ?creator .
        }
        GRAPH ${orgGraph(orgUuid)} {
          OPTIONAL {
            ?creator foaf:firstName ?creatorFirstName ;
                    foaf:familyName ?creatorFamilyName .
          }
        }
      }

      OPTIONAL {
        GRAPH ${userGraph(orgUuid)} {
          ?instanceUri ext:lastModifiedBy ?lastModifier .
        }
        GRAPH ${orgGraph(orgUuid)} {
          OPTIONAL {
            ?lastModifier foaf:firstName ?lastModifierFirstName ;
                          foaf:familyName ?lastModifierFamilyName .
          }
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
        binding.formalInformalModifiedDate.value,
      ),
    };
  });
}

export async function getReviewStatusChanges(instanceUris, since, orgUuid) {
  if (!instanceUris || instanceUris.length === 0) return [];

  const escapedUris = instanceUris.map((uri) => sparqlEscapeUri(uri)).join("\n");
  const queryString = `
    ${PREFIXES}
    SELECT DISTINCT ?instanceUri ?title ?creator ?status ?productID ?dutchLanguageVariant ?reviewStatusModifiedDate ?creatorFirstName ?creatorFamilyName ?lastModifier ?lastModifierFirstName ?lastModifierFamilyName ?versionedSource ?hasLatestFunctionalChange
    WHERE {
      GRAPH ${userGraph(orgUuid)} {
        VALUES ?instanceUri { ${escapedUris} }

        ?instanceUri ext:reviewStatus ?status ;
                    schema:productID ?productID ;
                    lpdcExt:reviewStatusModifiedDate ?reviewStatusModifiedDate .

        OPTIONAL { ?instanceUri dct:title ?title . }
        OPTIONAL { ?instanceUri ext:hasVersionedSource ?versionedSource . }
        OPTIONAL { ?instanceUri lpdcExt:dutchLanguageVariant ?dutchLanguageVariant . }
        OPTIONAL { ?instanceUri dct:source ?source . }

        FILTER(?reviewStatusModifiedDate >= ${sparqlEscapeDateTime(since)})
        FILTER(?status IN (
          <http://lblod.data.gift/concepts/review-status/concept-gewijzigd>,
          <http://lblod.data.gift/concepts/review-status/concept-gearchiveerd>
        ))
      }

      OPTIONAL {
        GRAPH <http://mu.semte.ch/graphs/public> {
          ?source lpdc:hasLatestFunctionalChange ?hasLatestFunctionalChange .
        }
      }

      OPTIONAL {
        GRAPH ${userGraph(orgUuid)} {
          ?instanceUri dct:creator ?creator .
        }
        GRAPH ${orgGraph(orgUuid)} {
          OPTIONAL {
            ?creator foaf:firstName ?creatorFirstName ;
                    foaf:familyName ?creatorFamilyName .
          }
        }
      }

      OPTIONAL {
        GRAPH ${userGraph(orgUuid)} {
          ?instanceUri ext:lastModifiedBy ?lastModifier .
        }
        GRAPH ${orgGraph(orgUuid)} {
          OPTIONAL {
            ?lastModifier foaf:firstName ?lastModifierFirstName ;
                          foaf:familyName ?lastModifierFamilyName .
          }
        }
      }
    }
  `;

  const statusMap = {
    "http://lblod.data.gift/concepts/review-status/concept-gewijzigd":
      "gewijzigd",
    "http://lblod.data.gift/concepts/review-status/concept-gearchiveerd":
      "gearchiveerd",
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
      dutchLanguageVariant: binding.dutchLanguageVariant?.value || "",
      status: statusMap[binding.status?.value],
      versionedSource: binding.versionedSource?.value || "Onbekend",
      hasLatestFunctionalChange:
        binding.hasLatestFunctionalChange?.value || "Onbekend",
      reviewStatusModifiedDate: new Date(
        binding.reviewStatusModifiedDate.value,
      ),
    };
  });
}

export async function updateLastNotifiedAt(notificationpreferencesUri, date) {
  const queryString = `
    ${PREFIXES}
    DELETE {
      GRAPH ?g {
        ${sparqlEscapeUri(notificationpreferencesUri)} lpdcExt:lastNotifiedAt ?oldTime .
      }
    }
    INSERT {
      GRAPH ?g {
        ${sparqlEscapeUri(notificationpreferencesUri)} lpdcExt:lastNotifiedAt ${sparqlEscapeDateTime(date)} .
      }
    }
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(notificationpreferencesUri)} a lpdcExt:NotificationPreference .
        OPTIONAL { ${sparqlEscapeUri(notificationpreferencesUri)} lpdcExt:lastNotifiedAt ?oldTime . }
      }
      FILTER STRSTARTS(STR(?g), "http://mu.semte.ch/graphs/organizations/")
      FILTER STRENDS(STR(?g), "/LoketLB-LPDCGebruiker")
    }
  `;
  await update(queryString);
}

/**
 * Puts email in the right mail folder graph for sending
 * @param {object} notificationpreferences
 * @param {Object} email
 */
export async function insertEmail(notificationpreferences, email) {
  try {
    // Temporary debug log
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
                                      dct:references ${sparqlEscapeUri(notificationpreferences.uri)} ;
                                      dct:created ${sparqlEscapeDateTime(now)} .
      }
    }`;
    await update(emailQuery);
  } catch (err) {
    console.log("error", err);
    throw new Error(err);
  }
}

// JOBS
export async function createJob() {
  const jobUuid = uuid();
  const jobUri = `${JOB_URI_PREFIX}${jobUuid}`;
  const now = new Date().toISOString();

  const q = `
    ${PREFIXES}
    INSERT DATA {
      GRAPH ${sparqlEscapeUri(JOB_GRAPH)} {
        ${sparqlEscapeUri(jobUri)} a ${sparqlEscapeUri(JOB_TYPE)} ;
          mu:uuid ${sparqlEscapeString(jobUuid)} ;
          dct:creator ${sparqlEscapeUri(SERVICE_URI)} ;
          dct:created ${sparqlEscapeDateTime(now)} ;
          dct:modified ${sparqlEscapeDateTime(now)} ;
          task:operation ${sparqlEscapeUri(JOB_OPERATION)} ;
          adms:status ${sparqlEscapeUri(JOB_STATUS.SCHEDULED)} .
      }
    }
  `;
  await update(q);
  return jobUri;
}

/**
 * Creates a new task linked to a job in the store
 */
export async function createTask(jobUri) {
  const taskUuid = uuid();
  const taskUri = `${TASK_URI_PREFIX}${taskUuid}`;
  const now = new Date().toISOString();

  const q = `
    ${PREFIXES}
    INSERT DATA {
      GRAPH ${sparqlEscapeUri(JOB_GRAPH)} {
        ${sparqlEscapeUri(taskUri)} a ${sparqlEscapeUri(TASK_TYPE)} ;
          mu:uuid ${sparqlEscapeString(taskUuid)} ;
          dct:created ${sparqlEscapeDateTime(now)} ;
          dct:modified ${sparqlEscapeDateTime(now)} ;
          task:operation ${sparqlEscapeUri(JOB_OPERATION)} ;
          task:index ${sparqlEscapeString("0")} ;
          dct:isPartOf ${sparqlEscapeUri(jobUri)} ;
          adms:status ${sparqlEscapeUri(JOB_STATUS.SCHEDULED)} .
      }
    }
  `;
  await update(q);
  return taskUri;
}

export async function updateStatus(uri, status) {
  const q = `
    ${PREFIXES}
    DELETE {
      GRAPH ?g {
        ${sparqlEscapeUri(uri)} adms:status ?status .
      }
    }
    INSERT {
      GRAPH ?g {
        ${sparqlEscapeUri(uri)} adms:status ${sparqlEscapeUri(status)} .
      }
    }
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(uri)} adms:status ?status .
      }
    }
  `;
  await update(q);
}

/**
 * Adds an error resource to the given job
 */
export async function addError(jobUri, error) {
  const errorUuid = uuid();
  const errorUri = `${ERROR_URI_PREFIX}${errorUuid}`;

  const q = `
    ${PREFIXES}
    INSERT DATA {
      GRAPH ${sparqlEscapeUri(JOB_GRAPH)} {
        ${sparqlEscapeUri(jobUri)} task:error ${sparqlEscapeUri(errorUri)} .
        ${sparqlEscapeUri(errorUri)} a oslc:Error ;
          mu:uuid ${sparqlEscapeString(errorUuid)} ;
          oslc:message ${sparqlEscapeString(error.message)} .
      }
    }
  `;
  await update(q);
}
