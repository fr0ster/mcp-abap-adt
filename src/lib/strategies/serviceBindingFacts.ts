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
 */
export function associationsOf(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(
    /(?:association|composition)(?:\s*\[[^\]]*\])?\s+(?:to|of)\s+(?:parent\s+)?[A-Za-z0-9_/]+\s+as\s+([A-Za-z0-9_]+)/gi,
  )) {
    found.add(match[1]);
  }
  return [...found];
}
