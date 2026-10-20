/**
 * The key of the system a connection's settings point at: its URL (without
 * trailing slashes, trimmed), its client and its connection type. The
 * server keys the corrected header pairs (`AdtHeaderPairs.forSystem`) and the
 * system information by it; two destinations to the same system share it,
 * whatever their credentials.
 */
export function adtSystemKey(settings: {
  url?: string;
  client?: string;
  connectionType?: string;
}): string {
  return JSON.stringify([
    withoutTrailingSlashes((settings.url ?? '').trim()),
    (settings.client ?? '').trim(),
    settings.connectionType ?? 'http',
  ]);
}

/** `url` without its trailing slashes. */
export function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end -= 1;
  return url.slice(0, end);
}
