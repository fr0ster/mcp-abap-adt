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

import { afterBlanksAt, isBlank, isWordCharacter, wordAt } from '../plainText';
import {
  attributeOf,
  firstAttribute,
  membersNamed,
  parseStructure,
} from './reading';

export interface ServiceBindingFacts {
  /** `srvb:services/@srvb:name` — the published service. */
  service?: string | undefined;
  /** `srvb:serviceDefinition/@adtcore:name` — the SRVD behind it. */
  serviceDefinition?: string | undefined;
  /** `srvb:content/@srvb:version`, e.g. `0001`. */
  version?: string | undefined;
  /** From `srvb:binding/@srvb:version`: `V2` → `odatav2`, `V4` → `odatav4`. */
  protocol?: 'odatav2' | 'odatav4' | undefined;
  /** `srvb:binding/@srvb:type`, normally `ODATA`. */
  bindingType?: string | undefined;
  /**
   * `srvb:binding/@srvb:category`: `'ui'` from `0`, `'web_api'` from `1`.
   * `undefined` when the document does not say, which is not the same as UI.
   */
  category?: 'ui' | 'web_api' | undefined;
  /** `srvb:published` — false means nothing below will open. */
  published: boolean;
}

/**
 * The attribute `name` of the first `element` of a parsed document, in
 * the grouped parse's order (`walkStructure`); `undefined` when that element does not carry it.
 */
const attribute = (
  document: unknown,
  element: string,
  name: string,
): string | undefined =>
  attributeOf(membersNamed(document, element)[0]?.node, name);

/** Read the facts the preview URL needs out of a binding document. */
export function serviceBindingFactsOf(xml: string): ServiceBindingFacts {
  const document = parseStructure(xml);
  const bindingVersion = attribute(document, 'srvb:binding', 'srvb:version');
  const bindingCategory = attribute(document, 'srvb:binding', 'srvb:category');
  return {
    service: attribute(document, 'srvb:services', 'srvb:name'),
    serviceDefinition: attribute(
      document,
      'srvb:serviceDefinition',
      'adtcore:name',
    ),
    version: attribute(document, 'srvb:content', 'srvb:version'),
    protocol:
      bindingVersion === 'V2'
        ? 'odatav2'
        : bindingVersion === 'V4'
          ? 'odatav4'
          : undefined,
    bindingType: attribute(document, 'srvb:binding', 'srvb:type'),
    category:
      bindingCategory === '0'
        ? 'ui'
        : bindingCategory === '1'
          ? 'web_api'
          : undefined,
    published:
      attribute(document, 'srvb:serviceBinding', 'srvb:published') === 'true',
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
  let at = 0;
  while (at < source.length) {
    const read = exposeAt(source, at);
    if (read === undefined) {
      at++;
      continue;
    }
    found.push(read.exposed);
    at = read.end;
  }
  return found;
}

/** A CDS name: letters, digits and `_`. */
const isCdsName = (character: string | undefined): boolean =>
  isWordCharacter(character);

/** A CDS entity name: a CDS name, or a namespaced one (`/NS/NAME`). */
const isEntityName = (character: string | undefined): boolean =>
  isWordCharacter(character) || character === '/';

/** The end of the run of characters `accepts` takes, from `at`. */
function runEnd(
  text: string,
  at: number,
  accepts: (character: string | undefined) => boolean,
): number {
  let end = at;
  while (end < text.length && accepts(text[end])) end++;
  return end;
}

/** The index after one or more blanks at `at`; `undefined` when there is none. */
function afterSomeBlanks(text: string, at: number): number | undefined {
  const end = afterBlanksAt(text, at);
  return end > at ? end : undefined;
}

/** `expose <entity> [as <alias>] ;` at `at`, and where it ends. */
function exposeAt(
  source: string,
  at: number,
): { exposed: ExposedEntity; end: number } | undefined {
  if (!wordAt(source, at, 'expose')) return undefined;
  const entityAt = afterSomeBlanks(source, at + 'expose'.length);
  if (entityAt === undefined) return undefined;
  const entityEnd = runEnd(source, entityAt, isEntityName);
  if (entityEnd === entityAt) return undefined;
  const entity = source.slice(entityAt, entityEnd);
  const alias = aliasAfter(source, entityEnd);
  if (alias !== undefined) {
    const semicolon = afterBlanksAt(source, alias.end);
    if (source[semicolon] === ';') {
      return { exposed: { entity, entitySet: alias.name }, end: semicolon + 1 };
    }
  }
  const semicolon = afterBlanksAt(source, entityEnd);
  return source[semicolon] === ';'
    ? { exposed: { entity, entitySet: entity }, end: semicolon + 1 }
    : undefined;
}

/** ` as <alias>` at `at` — one or more blanks on each side of `as` — and where it ends. */
function aliasAfter(
  text: string,
  at: number,
): { name: string; end: number } | undefined {
  const asAt = afterSomeBlanks(text, at);
  if (asAt === undefined || !wordAt(text, asAt, 'as')) return undefined;
  const nameAt = afterSomeBlanks(text, asAt + 2);
  if (nameAt === undefined) return undefined;
  const end = runEnd(text, nameAt, isCdsName);
  return end > nameAt ? { name: text.slice(nameAt, end), end } : undefined;
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
  let at = 0;
  while (at < source.length) {
    const read = definedAssociationAt(source, at);
    if (read === undefined) {
      at++;
      continue;
    }
    found.add(read.name);
    at = read.end;
  }
  // Redirected in a projection: `name : redirected to [composition child|parent] X`.
  for (const name of redirectedNames(source)) found.add(name);
  return [...found];
}

/**
 * `association|composition [<cardinality>] to|of [parent] <target> as <name>`
 * at `at` — keywords in any case — its name and where it ends.
 */
function definedAssociationAt(
  source: string,
  at: number,
): { name: string; end: number } | undefined {
  const keyword = ['association', 'composition'].find((word) =>
    wordAt(source, at, word),
  );
  if (keyword === undefined) return undefined;
  let next = at + keyword.length;
  const bracket = afterBlanksAt(source, next);
  if (source[bracket] === '[') {
    const closing = source.indexOf(']', bracket + 1);
    if (closing === -1) return undefined;
    next = closing + 1;
  }
  const relationAt = afterSomeBlanks(source, next);
  if (relationAt === undefined) return undefined;
  if (!wordAt(source, relationAt, 'to') && !wordAt(source, relationAt, 'of')) {
    return undefined;
  }
  const targetAt = afterSomeBlanks(source, relationAt + 2);
  if (targetAt === undefined) return undefined;
  // `parent` may be a keyword before the target, or the target itself.
  if (wordAt(source, targetAt, 'parent')) {
    const afterParent = afterSomeBlanks(source, targetAt + 'parent'.length);
    const named =
      afterParent === undefined
        ? undefined
        : targetAliasAt(source, afterParent);
    if (named !== undefined) return named;
  }
  return targetAliasAt(source, targetAt);
}

/** `<target> as <name>` at `at`: the name and where it ends. */
function targetAliasAt(
  source: string,
  at: number,
): { name: string; end: number } | undefined {
  const targetEnd = runEnd(source, at, isEntityName);
  return targetEnd === at ? undefined : aliasAfter(source, targetEnd);
}

/** The names of `name : redirected to <target>`, keywords in any case. */
function redirectedNames(source: string): string[] {
  const names: string[] = [];
  for (
    let colon = source.indexOf(':');
    colon !== -1;
    colon = source.indexOf(':', colon + 1)
  ) {
    let nameEnd = colon;
    while (nameEnd > 0 && isBlank(source[nameEnd - 1])) nameEnd--;
    let nameAt = nameEnd;
    while (nameAt > 0 && isCdsName(source[nameAt - 1])) nameAt--;
    if (nameAt === nameEnd) continue;
    const redirectedAt = afterBlanksAt(source, colon + 1);
    if (!wordAt(source, redirectedAt, 'redirected')) continue;
    const toAt = afterSomeBlanks(source, redirectedAt + 'redirected'.length);
    if (toAt === undefined || !wordAt(source, toAt, 'to')) continue;
    const targetAt = afterSomeBlanks(source, toAt + 2);
    if (targetAt === undefined || !isEntityName(source[targetAt])) continue;
    names.push(source.slice(nameAt, nameEnd));
  }
  return names;
}

/** What the protocol-category resource says about a published service. */
export interface CategoryServiceUrls {
  /** `…:services/@…:serviceUrl` — the URL the SYSTEM names, often empty. */
  serviceUrl?: string | undefined;
  /** `…:services/@…:annotationUrl`. */
  annotationUrl?: string | undefined;
  /** `odatav4:serviceGroup/@odatav4:serviceUrlPrefix` — V4 only. */
  serviceUrlPrefix?: string | undefined;
  /** `@…:published` on the list (V2) or the group (V4). */
  published?: boolean | undefined;
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
  const document = parseStructure(xml);
  // The first element (in `walkStructure`'s order) that states it: the V2 spelling,
  // else the V4 one — a document is of one protocol.
  const value = (name: string): string | undefined =>
    firstAttribute(document, `odatav2:${name}`) ??
    firstAttribute(document, `odatav4:${name}`);
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
