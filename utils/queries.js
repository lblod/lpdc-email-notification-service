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
  TASK_OPERATION,
  JOB_URI_PREFIX,
  TASK_URI_PREFIX,
  ERROR_URI_PREFIX,
  SYSTEM_EMAIL_GRAPH,
} from "./constants";
import { userGraph, orgGraph, getUUIDFromUri } from "./utils";

export async function getActiveNotificationPreferences() {
  const queryString = `
   ${PREFIXES}
    SELECT DISTINCT ?notificationPreference ?instanceUri ?emailAddress ?frequency
          ?lastNotifiedAt ?rule ?bestuurseenheid ?bestuurseenheidDisplayLabel ?gebruikerFirstName ?gebruikerFamilyName
    WHERE {
      GRAPH ?orgGraph {
        ?gebruiker a foaf:Person ;
                  foaf:member ?bestuurseenheid ;
                  foaf:firstName ?gebruikerFirstName ;
                  foaf:familyName ?gebruikerFamilyName .
      }
      OPTIONAL {
        GRAPH ?labelGraph {
          ?bestuurseenheid skos:prefLabel ?bestuurseenheidLabel ;
                          org:classification ?classification .

          ?classification skos:prefLabel ?classificationLabel .
        }

        BIND(
          CONCAT(?classificationLabel, " ", ?bestuurseenheidLabel)
          AS ?bestuurseenheidDisplayLabel
        )
      }
      GRAPH ?userGraph {
        ?notificationPreference a lpdcExt:NotificationPreference ;
                                dct:creator ?gebruiker ;
                                schema:email ?emailAddress ;
                                lpdcExt:notificationsEnabled ?notificationsEnabled ;
                                lpdcExt:hasNotificationRuleConfig ?ruleConfig .

        FILTER(STR(?notificationsEnabled) = "true"|| STR(?notificationsEnabled) = "1")

        ?ruleConfig lpdcExt:notificationFrequency ?frequency ;
                    lpdcExt:hasEnabledRule ?rule .

        OPTIONAL {
          ?notificationPreference lpdcExt:notificationInstance ?instanceUri .
        }

        OPTIONAL {
        SELECT ?notificationPreference (MAX(?taskModified) AS ?lastNotifiedAt)
        WHERE {
          GRAPH ${sparqlEscapeUri(JOB_GRAPH)} {
            ?task dct:references ?notificationPreference ;
                  task:operation ${sparqlEscapeUri(TASK_OPERATION.DIGEST)} ;
                  adms:status ${sparqlEscapeUri(JOB_STATUS.SUCCESS)} ;
                  dct:modified ?taskModified .
          }
        }
        GROUP BY ?notificationPreference
      }
      }
      FILTER STRSTARTS(STR(?userGraph), "http://mu.semte.ch/graphs/organizations/")
      FILTER STRENDS(STR(?userGraph), "/LoketLB-LPDCGebruiker")
      FILTER STRSTARTS(STR(?orgGraph), "http://mu.semte.ch/graphs/organizations/")
    }
   `;

  const queryResult = await query(queryString);
  const bindings = queryResult.results?.bindings || [];

  // Group by (notificationPreference URI, frequency) as a single preference
  // can have rules with different frequencies (e.g. weekly digest + bi-annual status report)
  const map = new Map();
  for (const binding of bindings) {
    const uri = binding.notificationPreference.value;
    const frequency = binding.frequency.value;
    const key = `${uri}::${frequency}`;

    if (!map.has(key)) {
      const gebruikerFirstName = binding.gebruikerFirstName?.value || "";
      const gebruikerFamilyName = binding.gebruikerFamilyName?.value || "";
      const gebruikerFullName = `${gebruikerFirstName} ${gebruikerFamilyName}`.trim();
      map.set(key, {
        uri,
        emailAddress: binding.emailAddress.value,
        frequency,
        enabledRules: [],
        lastNotifiedAt: binding.lastNotifiedAt?.value
          ? new Date(binding.lastNotifiedAt.value)
          : null,
        orgUuid: getUUIDFromUri(binding.bestuurseenheid.value),
        bestuurseenheid: binding.bestuurseenheidDisplayLabel.value,
        targetLabel: gebruikerFullName,
        instanceUris: [],
      });
    }

    if (binding.rule?.value) {
      const rules = map.get(key).enabledRules;
      if (!rules.includes(binding.rule.value)) {
        rules.push(binding.rule.value);
      }
    }

    if (binding.instanceUri?.value) {
      const instanceUris = map.get(key).instanceUris;
      if (!instanceUris.includes(binding.instanceUri.value)) {
        instanceUris.push(binding.instanceUri.value);
      }
    }
  }

  console.log(
    "Finished grouping the notification preferences by (URI, frequency), result:",
    Array.from(map.values()),
  );
  return Array.from(map.values());
}

export async function getAllActiveBestuurseenheden() {
  const queryString = `
    ${PREFIXES}
    SELECT DISTINCT ?bestuurseenheid ?orgUuid ?emailAddress ?bestuurseenheidDisplayLabel
    WHERE {
      GRAPH ?orgGraph {
        ?bestuurseenheid a besluit:Bestuurseenheid ;
                        mu:uuid ?orgUuid ;
                        ext:mailAdresVoorNotificaties ?emailAddress .
      }
      OPTIONAL {
        GRAPH ?labelGraph {
          ?bestuurseenheid skos:prefLabel ?bestuurseenheidLabel ;
                           org:classification ?classification .
          ?classification skos:prefLabel ?classificationLabel .
        }
        BIND(CONCAT(?classificationLabel, " ", ?bestuurseenheidLabel) AS ?bestuurseenheidDisplayLabel)
      }
      FILTER STRSTARTS(STR(?orgGraph), "http://mu.semte.ch/graphs/public")
      FILTER EXISTS {
        GRAPH ?instanceGraph {
          ?instance a lpdcExt:InstancePublicService .
        }
        FILTER(CONCAT("http://mu.semte.ch/graphs/organizations/", ?orgUuid, "/LoketLB-LPDCGebruiker") = STR(?instanceGraph))
      }
    }
  `;
  const queryResult = await query(queryString);
  const bindings = queryResult.results?.bindings || [];

  return bindings.map((binding) => ({
    uri: binding.bestuurseenheid.value,
    orgUuid: binding.orgUuid.value,
    emailAddress: binding.emailAddress.value,
    bestuurseenheid: binding.bestuurseenheidDisplayLabel?.value || "",
  }));
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

export async function getStatusReportData(orgUuid) {
  const statusQuery = `
    ${PREFIXES}
    SELECT ?totalInstances ?totalHerziening ?totalFeedback ?totalFormalInformal ?totalDuplicateProductIds
      WHERE {
        # 1. Total Instances
        {
          SELECT (COUNT(DISTINCT ?instance) AS ?totalInstances) WHERE {
            GRAPH ${userGraph(orgUuid)} {
              ?instance a lpdcExt:InstancePublicService .
            }
          }
        }

        # 2. Total Herziening
        {
          SELECT (COUNT(DISTINCT ?herzieningInstance) AS ?totalHerziening) WHERE {
            GRAPH ${userGraph(orgUuid)} {
              ?herzieningInstance a lpdcExt:InstancePublicService ;
                                  ext:reviewStatus ?reviewStatus .
              FILTER(?reviewStatus IN (
                <http://lblod.data.gift/concepts/review-status/concept-gewijzigd>,
                <http://lblod.data.gift/concepts/review-status/concept-gearchiveerd>
              ))
            }
          }
        }

        # 3. Total Feedback
        {
          SELECT (COUNT(DISTINCT ?feedbackInstance) AS ?totalFeedback) WHERE {
            GRAPH ${userGraph(orgUuid)} {
              ?feedbackInstance a lpdcExt:InstancePublicService ;
                                lpdcExt:feedbackAvailable true .
            }
          }
        }

        # 4. Total formal/informal conversions needed
        {
          SELECT (COUNT(DISTINCT ?formalInformalInstance) AS ?totalFormalInformal) WHERE {
            GRAPH ${userGraph(orgUuid)} {
              ?formalInformalInstance a lpdcExt:InstancePublicService ;
                                      lpdcExt:needsConversionFromFormalToInformal true .
            }
          }
        }

        # 5. Total Unique Duplicate Product IDs
        {
          SELECT (COUNT(DISTINCT ?duplicateProductId) AS ?totalDuplicateProductIds) WHERE {
            GRAPH ${userGraph(orgUuid)} {
              ?inst a lpdcExt:InstancePublicService ;
                    schema:productID ?duplicateProductId .

              ?sibling a lpdcExt:InstancePublicService ;
                      schema:productID ?duplicateProductId .

              FILTER(?inst != ?sibling)
            }
          }
        }
      }
  `;

  const duplicateTitlesQuery = `
    ${PREFIXES}
    SELECT DISTINCT (STR(?title) AS ?title)
      WHERE {
        GRAPH ${userGraph(orgUuid)} {
          ?instance a lpdcExt:InstancePublicService ;
                    schema:productID ?productId ;
                    dct:source ?source .

          ?duplicateInstance a lpdcExt:InstancePublicService ;
                            schema:productID ?productId .

          FILTER (?instance < ?duplicateInstance)
        }

        ?source dct:title ?title .
      }
      ORDER BY ?title
  `;

  const [statusResult, duplicateTitlesResult] = await Promise.all([
    query(statusQuery),
    query(duplicateTitlesQuery),
  ]);

  const binding = statusResult.results?.bindings?.[0];

  return {
    totalInstances: parseInt(binding?.totalInstances?.value ?? "0"),
    totalHerziening: parseInt(binding?.totalHerziening?.value ?? "0"),
    totalFeedback: parseInt(binding?.totalFeedback?.value ?? "0"),
    totalFormalInformal: parseInt(binding?.totalFormalInformal?.value ?? "0"),
    totalDuplicateProductIds: parseInt(binding?.totalDuplicateProductIds?.value ?? "0"),

    duplicateProductTitles:
      duplicateTitlesResult.results?.bindings?.map(
        (binding) => binding.title.value
      ) ?? [],
  };
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

export async function linkTaskToPreference(taskUri, notificationPreferenceUri) {
  const q = `
    ${PREFIXES}
    INSERT DATA {
      GRAPH ${sparqlEscapeUri(JOB_GRAPH)} {
        ${sparqlEscapeUri(taskUri)} dct:references ${sparqlEscapeUri(notificationPreferenceUri)} .
      }
    }
  `;
  await update(q);
}

/**
 * Puts email in the right mail folder graph for sending
 * @param {object} notificationPreference
 * @param {Object} email
 */
export async function insertEmail(notificationPreference, email, task) {
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
                                      dct:references ${sparqlEscapeUri(notificationPreference.uri)} ;
                                      dct:created ${sparqlEscapeDateTime(now)} .
      }
      GRAPH ${sparqlEscapeUri(JOB_GRAPH)} {
        ${sparqlEscapeUri(task)} dct:references ${sparqlEscapeUri(email.uri)} .
      }
    }`;
    await update(emailQuery);
  } catch (err) {
    console.log("error", err);
    throw err;
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
export async function createTask(jobUri, operation) {
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
          task:operation ${sparqlEscapeUri(operation)} ;
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
  const message = error?.message ?? String(error);
  const q = `
    ${PREFIXES}
    INSERT DATA {
      GRAPH ${sparqlEscapeUri(JOB_GRAPH)} {
        ${sparqlEscapeUri(jobUri)} task:error ${sparqlEscapeUri(errorUri)} .
        ${sparqlEscapeUri(errorUri)} a oslc:Error ;
          mu:uuid ${sparqlEscapeString(errorUuid)} ;
          oslc:message ${sparqlEscapeString(message)} .
      }
    }
  `;
  await update(q);
}
