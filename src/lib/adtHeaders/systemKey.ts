import type { SapConfig } from '@mcp-abap-adt/connection';

/**
 * The key of the system a connection's settings point at, by its wire:
 * HTTP `["http", <URL without trailing slashes, trimmed>, <client>]`, RFC
 * `["rfc", ashost, sysnr, mshost, msserv, sysid, group, saprouter, client]`
 * (an absent field `''`). The server keys the corrected header pairs
 * (`AdtHeaderPairs.forSystem`), the system information and the
 * background-run identity by it; two destinations to the same system share
 * it, whatever their credentials.
 */
export function adtSystemKey(settings: SapConfig): string {
  const client = (settings.client ?? '').trim();
  if (settings.connectionType === 'rfc') {
    return JSON.stringify([
      'rfc',
      settings.ashost ?? '',
      settings.sysnr ?? '',
      settings.mshost ?? '',
      settings.msserv ?? '',
      settings.sysid ?? '',
      settings.group ?? '',
      settings.saprouter ?? '',
      client,
    ]);
  }
  return JSON.stringify([
    'http',
    withoutTrailingSlashes(settings.url.trim()),
    client,
  ]);
}

/** `url` without its trailing slashes. */
export function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end -= 1;
  return url.slice(0, end);
}
