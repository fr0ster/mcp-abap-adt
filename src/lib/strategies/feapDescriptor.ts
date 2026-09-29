/**
 * The Fiori-elements preview URL, and the obfuscation ADT puts in its path.
 *
 * **What it is.** For a service binding, ADT's "Preview" opens
 * `/sap/bc/adt/businessservices/<odatav2|odatav4>/feap/<segment>/flp.html?…`, and
 * `<segment>` is not a token the server issued: it is a descriptor of the service,
 * obfuscated by shifting every character up by 20 (0x14) and then percent-encoding
 * the result as UTF-8 — which is why bytes above 0x7F arrive as `%C2%XX`.
 *
 * **Measured, not remembered.** The rule was derived from a URL Eclipse produced for
 * an on-premise binding and verified by re-encoding it back to the byte-identical
 * string; `feapDescriptor.test.ts` keeps that pair as the fixture. Nothing here is
 * signed or system-specific, so the URL can be built from repository reads alone —
 * which is what `GetServiceBindingPreviewUrl` does.
 *
 * The descriptor's parts, `##`-separated, in the order the preview expects:
 *   service ## entity set ## navigation ## target entity set ## annotation service ## version
 *
 * The annotation service is the generated Gateway Vocabulary Annotation object
 * (type `IWVB`), named `<service>_VAN`. It exists only once the binding is
 * published, which is also when the preview can work at all.
 */

/** Characters that may stand for themselves in a URL path segment. */
const URL_SAFE = /[A-Za-z0-9_.~-]/;

/**
 * Shift by 20 and percent-encode, exactly as ADT does.
 *
 * Three ranges to keep apart: a shifted character that is still URL-safe stands as
 * itself, `0x7F` is percent-encoded on its own, and anything from `0x80` becomes the
 * two UTF-8 bytes `C2 XX`. Getting the last one wrong is what makes a hand-built
 * preview URL look right and open nothing.
 */
export function encodeFeapSegment(descriptor: string): string {
  let encoded = '';
  for (const character of descriptor) {
    const code = character.charCodeAt(0) + 0x14;
    if (code < 0x7f) {
      const shifted = String.fromCharCode(code);
      encoded += URL_SAFE.test(shifted)
        ? shifted
        : `%${code.toString(16).toUpperCase().padStart(2, '0')}`;
      continue;
    }
    if (code === 0x7f) {
      encoded += '%7F';
      continue;
    }
    encoded += `%C2%${code.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return encoded;
}

/** The reverse, for reading a URL somebody pasted. */
export function decodeFeapSegment(segment: string): string {
  return [...decodeURIComponent(segment)]
    .map((character) => String.fromCharCode(character.charCodeAt(0) - 0x14))
    .join('');
}

export interface FeapDescriptor {
  /** The OData service the binding publishes — `srvb:services/@srvb:name`. */
  service: string;
  /** The entity set to open, an `expose … as <alias>` from the service definition. */
  entitySet: string;
  /** The association to follow, named in the exposed root view. */
  navigation: string;
  /** The entity set the association leads to. */
  targetEntitySet: string;
  /** The Gateway Vocabulary Annotation service, `<service>_VAN`. */
  annotationService: string;
  /** `srvb:content/@srvb:version`, `0001` unless a second version was added. */
  version: string;
}

/** The `##`-joined descriptor, before obfuscation. */
export function feapDescriptor(parts: FeapDescriptor): string {
  return [
    parts.service,
    parts.entitySet,
    parts.navigation,
    parts.targetEntitySet,
    parts.annotationService,
    parts.version,
  ].join('##');
}

/**
 * The OData **V4** descriptor, which is a different document with seven parts.
 *
 * Two URLs Eclipse produced for one binding — the root entity set and the child —
 * decoded to:
 *
 * ```
 * /sap/opu/odata4/sap/<binding>/srvd/sap/<service>/<version>/##Root##_children##Child##<service>##<version>##<binding>
 * /sap/opu/odata4/sap/<binding>/srvd/sap/<service>/<version>/##Child##_parent##Root##<service>##<version>##<binding>
 * ```
 *
 * So the first part is the service's URL PATH, not a name, and the V2 form — the
 * service name first, `<service>_VAN` fifth, six parts — answers `404` here. A V4
 * binding has no `_VAN` object at all: publication creates a service group
 * (`SCO2`/`SIA6`) and no `IWVB`.
 *
 * **What each part is worth**, measured against the endpoint's own `manifest.json`
 * (trial, 2026-09-29) by varying one at a time:
 *
 * | part | content | read |
 * |------|---------|------|
 * | 1 | the service URL path | required — absent or six-part answers `404` |
 * | 2 | entity set | **required**: a bogus one answers a list report with no page under it |
 * | 3 | navigation | not read. Empty and bogus both answered `/Root/_children`, derived |
 * | 4 | target entity set | not read, same as V2 |
 * | 5 | the SERVICE name | the annotations: a wrong one answers `200` with the nested pages GONE |
 * | 6 | version | the same — `9999` loses the nested pages |
 * | 7 | the BINDING name | **authorisation**: the service name here answers `401`, a bogus one `400` |
 *
 * Parts 5 and 7 differ, and only a binding whose service has another name shows it:
 * `5=service 7=binding` answered the full manifest, down to a third level
 * (`/Travel/_Booking/_Customer`) the server derived by itself; `5=binding` answered
 * without annotations; `7=service` answered `401`.
 */
export interface FeapV4Descriptor {
  /** The service's URL path, e.g. `/sap/opu/odata4/sap/<binding>/srvd/sap/<service>/<version>/`. */
  servicePath: string;
  /** The entity set to open. */
  entitySet: string;
  /** The association to follow. Not read by the server; carried for the shape. */
  navigation: string;
  /** The entity set it leads to. Not read either. */
  targetEntitySet: string;
  /** `srvb:services/@srvb:name` — what the annotations are looked up under. */
  service: string;
  /** `srvb:content/@srvb:version`. */
  version: string;
  /** `adtcore:name` of the binding — what the authorisation check reads. */
  binding: string;
}

/** Join a V4 descriptor in the order the preview expects. */
export function feapV4Descriptor(parts: FeapV4Descriptor): string {
  return [
    parts.servicePath,
    parts.entitySet,
    parts.navigation,
    parts.targetEntitySet,
    parts.service,
    parts.version,
    parts.binding,
  ].join('##');
}

/** `<service>_VAN` — the annotation service's name follows the service's. */
export function annotationServiceOf(service: string): string {
  return `${service.toUpperCase()}_VAN`;
}

/**
 * The preview URL, absolute.
 *
 * `protocol` is `odatav2` or `odatav4`, taken from the binding's own
 * `srvb:binding/@srvb:version`, because the endpoint differs per protocol.
 */
/**
 * The host a PREVIEW URL must carry, which is not always the host ADT answers on.
 *
 * **Measured on a BTP trial, 2026-09-29.** An ABAP environment in BTP is reached
 * through two hosts: `<id>.abap.<region>.hana.ondemand.com` serves ADT and the
 * APIs, and `<id>.abap-web.<region>.hana.ondemand.com` serves the browser. The
 * same FEAP path on each behaves differently and decisively:
 *
 * - on `abap.` — `401` with `WWW-Authenticate: Basic`, on every variation tried
 *   (with and without `sap-client`, with and without browser `User-Agent` and
 *   `Accept`). A trial user has no ABAP password, because authentication is a
 *   propagated token, so that prompt can never be answered. Eclipse opens the URL
 *   only because it sends its own `Authorization` header.
 * - on `abap-web.` — `200` with the BTP logon bootstrap, which sets
 *   `fragmentAfterLogin` / `locationAfterLogin` and goes to the identity provider,
 *   then returns to the requested URL. That is the browser flow.
 *
 * So a preview URL built on the ADT host is correct and unopenable. The service and
 * `$metadata` URLs are the opposite case — they are addressed with a token — and
 * stay on the ADT host. On premise there is no such split and the host is returned
 * unchanged.
 */
export function browserHostOf(baseUrl: string): string {
  return baseUrl.replace(
    /^(https?:\/\/[^./]+)\.abap\.(?=[^./]+\.hana\.ondemand\.com)/i,
    '$1.abap-web.',
  );
}

export function feapPreviewUrl(input: {
  baseUrl: string;
  protocol: 'odatav2' | 'odatav4';
  descriptor: FeapDescriptor | FeapV4Descriptor;
  client?: string;
  language?: string;
}): string {
  const descriptor = input.descriptor;
  const segment = encodeFeapSegment(
    'servicePath' in descriptor
      ? feapV4Descriptor(descriptor)
      : feapDescriptor(descriptor),
  );
  const query = [
    'sap-ui-xx-viewCache=false',
    `sap-ui-language=${input.language ?? 'EN'}`,
    ...(input.client ? [`sap-client=${input.client}`] : []),
  ].join('&');
  const base = browserHostOf(input.baseUrl.replace(/\/+$/, ''));
  return `${base}/sap/bc/adt/businessservices/${input.protocol}/feap/${segment}/flp.html?${query}`;
}
