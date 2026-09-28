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
export function feapPreviewUrl(input: {
  baseUrl: string;
  protocol: 'odatav2' | 'odatav4';
  descriptor: FeapDescriptor;
  client?: string;
  language?: string;
}): string {
  const segment = encodeFeapSegment(feapDescriptor(input.descriptor));
  const query = [
    'sap-ui-xx-viewCache=false',
    `sap-ui-language=${input.language ?? 'EN'}`,
    ...(input.client ? [`sap-client=${input.client}`] : []),
  ].join('&');
  const base = input.baseUrl.replace(/\/+$/, '');
  return `${base}/sap/bc/adt/businessservices/${input.protocol}/feap/${segment}/flp.html?${query}`;
}
