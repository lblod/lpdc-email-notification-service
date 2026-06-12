export const PREFIXES = `
  PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
  PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX cpsv: <http://purl.org/vocab/cpsv#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX xkos: <http://rdf-vocabulary.ddialliance.org/xkos#>
  PREFIX m8g: <http://data.europa.eu/m8g/>
  PREFIX lblodLpdc: <http://data.lblod.info/id/public-services/>
  PREFIX lblodIpdcLpdc: <http://lblod.data.gift/vocabularies/lpdc-ipdc/>
  PREFIX lpdc: <http://data.lblod.info/vocabularies/lpdc/>
  PREFIX dcat: <http://www.w3.org/ns/dcat#>
  PREFIX lblodOrg: <http://data.lblod.info/id/concept/organisatie/>
  PREFIX lblodIpdcThema: <http://data.lblod.info/id/concept/ipdc-thema/>
  PREFIX belgif: <http://vocab.belgif.be/ns/publicservice#>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>
  PREFIX schema: <http://schema.org/>
  PREFIX schema2: <https://schema.org/>
  PREFIX adms: <http://www.w3.org/ns/adms#>
  PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
  PREFIX ps: <http://vocab.belgif.be/ns/publicservice#>
  PREFIX lpdcExt: <https://productencatalogus.data.vlaanderen.be/ns/ipdc-lpdc#>
  PREFIX locn: <http://www.w3.org/ns/locn>
  PREFIX adres: <https://data.vlaanderen.be/ns/adres#>
  PREFIX as:  <https://www.w3.org/ns/activitystreams#>
  PREFIX sh: <http://www.w3.org/ns/shacl#>
  PREFIX http: <http://www.w3.org/2011/http#>
  PREFIX eli: <http://data.europa.eu/eli/ontology#>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX oslc: <http://open-services.net/ns/core#>
  PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>
`;

export const FEEDBACK_STATUS = {
  OPEN: "http://lblod.data.gift/concepts/1b3c5e7f-2a4d-4c6e-9f1b-3d5a7c9e2f4b",
  BEZIG: "http://lblod.data.gift/concepts/7c9e1a3f-5d8b-4e2c-9a1e-3f5b7d9c2e4a",
  VERWERKT:
    "http://lblod.data.gift/concepts/2e4a6c8d-9f1b-4d3e-5a7c-9e1f3b5d7a9c",
  VERZONDEN:
    "http://lblod.data.gift/concepts/a0575bbd-17b6-4f04-b1b2-e554e29cd428",
};

export const SERVICE_URI =
  "http://lblod.data.gift/services/lpdc-email-notification-service";

export const FREQUENCIES = {
  WEEKLY: "weekly",
  MONTHLY: "monthly",
};
