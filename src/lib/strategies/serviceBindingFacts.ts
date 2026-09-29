/**
 * What a service binding's own documents say, and what they do not.
 *
 * Measured against a trial system and an on-premise one, because the fields are not
 * where a reader expects them:
 *
 * - `srvb:services/@srvb:name` is the **service** name, and it is NOT the service
 *   definition: a V2 binding read on a trial answered `services="ZUI_TRAVEL"` while
 *   its definition was `ZTRAVEL_SD`. The URL needs the service, not the definition.
 * - `srvb:content/@srvb:version` is the service version that goes into the URL —
 *   `0001` unless a second version was added. `minorVersion`/`patchVersion` sit
 *   beside it and belong to neither URL.
 * - `srvb:binding/@srvb:version` is the PROTOCOL (`V2`, `V4`), which decides whether
 *   the ADT endpoint is `odatav2` or `odatav4`.
 * - `srvb:binding/@srvb:category` is UI against Web API — `0` and `1` in
 *   `SERVICE_BINDING_VARIANT_MAP`. It decides whether a PREVIEW exists at all: the
 *   FEAP page is the UI variant's, and a Web API binding is addressed by its service
 *   and `$metadata` instead. Read separately from the protocol because they answer
 *   different questions and only one of them picks the ADT endpoint.
 * - `srvb:published` says whether the service is in the registry at all. A binding
 *   can be `bindingCreated="true"` and still unpublished, and then no URL works.
 *
 * And what is absent: neither the binding nor its links carry the entity sets. Those
 * are the `expose … as <alias>` aliases in the service definition's source — the
 * alias is the entity set, not the exposed view's name.
 */

export interface ServiceBindingFacts {
  /** `srvb:services/@srvb:name` — the published service. */
  service?: string;
  /** `srvb:serviceDefinition/@adtcore:name` — the SRVD behind it. */
  serviceDefinition?: string;
  /** `srvb:content/@srvb:version`, e.g. `0001`. */
  version?: string;
  /** From `srvb:binding/@srvb:version`: `V2` → `odatav2`, `V4` → `odatav4`. */
  protocol?: 'odatav2' | 'odatav4';
  /** `srvb:binding/@srvb:type`, normally `ODATA`. */
  bindingType?: string;
  /**
   * `srvb:binding/@srvb:category`: `'ui'` from `0`, `'web_api'` from `1`.
   * `undefined` when the document does not say, which is not the same as UI.
   */
  category?: 'ui' | 'web_api';
  /** `srvb:published` — false means nothing below will open. */
  published: boolean;
}

const attribute = (
  xml: string,
  element: string,
  name: string,
): string | undefined => {
  const open = new RegExp(`<${element}\\b[^>]*>`).exec(xml)?.[0];
  if (!open) return undefined;
  const found = new RegExp(`${name}="([^"]*)"`).exec(open);
  return found?.[1];
};

/** Read the facts the preview URL needs out of a binding document. */
export function serviceBindingFactsOf(xml: string): ServiceBindingFacts {
  const bindingVersion = attribute(xml, 'srvb:binding', 'srvb:version');
  const bindingCategory = attribute(xml, 'srvb:binding', 'srvb:category');
  return {
    service: attribute(xml, 'srvb:services', 'srvb:name'),
    serviceDefinition: attribute(xml, 'srvb:serviceDefinition', 'adtcore:name'),
    version: attribute(xml, 'srvb:content', 'srvb:version'),
    protocol:
      bindingVersion === 'V2'
        ? 'odatav2'
        : bindingVersion === 'V4'
          ? 'odatav4'
          : undefined,
    bindingType: attribute(xml, 'srvb:binding', 'srvb:type'),
    category:
      bindingCategory === '0'
        ? 'ui'
        : bindingCategory === '1'
          ? 'web_api'
          : undefined,
    published:
      attribute(xml, 'srvb:serviceBinding', 'srvb:published') === 'true',
  };
}

export interface ExposedEntity {
  /** The CDS entity the definition exposes. */
  entity: string;
  /** The alias, which is the entity set name in the service. */
  entitySet: string;
}

/**
 * The `expose … as …` list of a service definition.
 *
 * `as` is optional in CDS; without it the entity set carries the entity's own name.
 * Both spellings appear in one file, so both are read.
 */
export function exposedEntitiesOf(source: string): ExposedEntity[] {
  const found: ExposedEntity[] = [];
  const pattern = /expose\s+([A-Za-z0-9_/]+)(?:\s+as\s+([A-Za-z0-9_]+))?\s*;/gi;
  for (const match of source.matchAll(pattern)) {
    found.push({ entity: match[1], entitySet: match[2] ?? match[1] });
  }
  return found;
}

/**
 * Association and composition names in a CDS view's source, for the navigation
 * segment.
 *
 * Both keywords matter and they are spelled differently — `association [0..1] to X
 * as to_CLASS` but `composition [0..*] of Y as _Address` — and a RAP root view
 * normally navigates through its compositions. A pattern that knows only
 * `association … to …` finds nothing on exactly the views this is for; that is how
 * the first version of this failed its own test.
 *
 * **And a PROJECTION spells it a third way.** It does not define the association, it
 * redirects one the underlying view already has:
 *
 * ```abap
 * _children : redirected to composition child ZMCP_PRV_C_CHLD
 * _parent   : redirected to parent ZMCP_PRV_C_ROOT
 * ```
 *
 * Measured on a trial, 2026-09-29: an OData V4 UI service exposes projections, not
 * interface views — a V4 binding over interface views answers `403` — so the view
 * this reads for a V4 preview is normally a projection, and the two patterns above
 * find nothing in it. The answer then carried `associations: []` for a view that has
 * one, which is not a missing field but a wrong one.
 */
export function associationsOf(source: string): string[] {
  const found = new Set<string>();
  // Defined here: `association [0..1] to X as name`, `composition [0..*] of Y as name`.
  for (const match of source.matchAll(
    /(?:association|composition)(?:\s*\[[^\]]*\])?\s+(?:to|of)\s+(?:parent\s+)?[A-Za-z0-9_/]+\s+as\s+([A-Za-z0-9_]+)/gi,
  )) {
    found.add(match[1]);
  }
  // Redirected in a projection: `name : redirected to [composition child|parent] X`.
  for (const match of source.matchAll(
    /([A-Za-z0-9_]+)\s*:\s*redirected\s+to\s+(?:composition\s+child|parent|)\s*[A-Za-z0-9_/]+/gi,
  )) {
    found.add(match[1]);
  }
  return [...found];
}

/** What the protocol-category resource says about a published service. */
export interface CategoryServiceUrls {
  /** `…:services/@…:serviceUrl` — the URL the SYSTEM names, often empty. */
  serviceUrl?: string;
  /** `…:services/@…:annotationUrl`. */
  annotationUrl?: string;
  /** `odatav4:serviceGroup/@odatav4:serviceUrlPrefix` — V4 only. */
  serviceUrlPrefix?: string;
  /** `@…:published` on the list (V2) or the group (V4). */
  published?: boolean;
}

/**
 * The service URLs as ADT itself reports them.
 *
 * `GET /sap/bc/adt/businessservices/<odatav2|odatav4>/<BINDING>` — with
 * `servicename` and `serviceversion` as query parameters, without which the V4
 * resource answers `400` — is what the Service Binding editor reads to fill its
 * "Service URL" and "Local Service Endpoint" fields. It answers
 * `odatav2:serviceList` or `odatav4:serviceGroup`, each carrying `serviceUrl` and
 * `annotationUrl`.
 *
 * **Read it, but do not depend on it.** Measured on a trial, 2026-09-29: for a
 * binding whose service demonstrably answers `200` on `$metadata`, this resource
 * answered `serviceUrl=""`, `annotationUrl=""` and `published="false"` — for our
 * own V2 binding and for a SAP-delivered V4 one alike. So an empty answer here is
 * not evidence that the service is absent, and the constructed URL stays as the
 * fallback. When the system DOES name a URL, its answer wins: it knows about
 * prefixes and rewrites that no string composition can.
 *
 * The V4 group carries two more things worth having: `atom:link`s to the publish
 * and unpublish jobs, and an `…/iam/sush` "SU22 Object Reference" — the IAM object
 * a V4 service is authorised through, which is the first thing to look at when a
 * published V4 service answers `404` to a caller that holds a valid token.
 */
export function categoryServiceUrlsOf(xml: string): CategoryServiceUrls {
  const value = (name: string): string | undefined => {
    const found = new RegExp(`(?:odatav2|odatav4):${name}="([^"]*)"`).exec(xml);
    return found?.[1];
  };
  const url = value('serviceUrl');
  const annotation = value('annotationUrl');
  const prefix = value('serviceUrlPrefix');
  const published = value('published');
  return {
    serviceUrl: url !== undefined && url !== '' ? url : undefined,
    annotationUrl:
      annotation !== undefined && annotation !== '' ? annotation : undefined,
    serviceUrlPrefix:
      prefix !== undefined && prefix !== '' ? prefix : undefined,
    published: published === undefined ? undefined : published === 'true',
  };
}
