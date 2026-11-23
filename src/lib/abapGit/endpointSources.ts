/**
 * Where a call's approved git endpoints come from (spec §5.2):
 *
 * - **stdio:** the destination's endpoints file, beside its session `.env`
 *   (`<name>.abapgit.yaml` for `<name>.env`), read once at the start and
 *   handed to the server (`abapGitEndpoints`);
 * - **Streamable HTTP:** the request's `x-abapgit-remote`, `x-abapgit-user`
 *   and `x-abapgit-token` headers — one approved endpoint, for that call
 *   only;
 * - **SSE:** the same headers on the stream's opening GET, held by that
 *   stream's instance and dropped with it.
 *
 * The headers reach here through the request context
 * (`requestContextFromHeaders`), entered around each dispatch.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { isJsonObject, type JsonValue, jsonOf } from '../json';
import { getRequestContext } from '../requestContext';
import {
  type ApprovedEndpoint,
  type ApprovedEndpointConfig,
  ApprovedEndpointError,
  approvedEndpointOf,
  parseApprovedEndpoints,
} from './approvedEndpoints';

/** The approved endpoints of one call, or why the request's own are refused. */
export type CallEndpoints =
  | { readonly endpoints: readonly ApprovedEndpoint[] }
  | { readonly refused: string };

/**
 * The call's approved endpoints: the request's headers, when it states any
 * (one endpoint, for this request or stream only); else `configured`, the
 * server's (stdio's file; none on HTTP and SSE). A header endpoint that
 * cannot be one is refused in fixed words naming the headers, never a value.
 */
export function endpointsOfCall(
  configured: readonly ApprovedEndpoint[],
): CallEndpoints {
  const remote = getRequestContext()?.abapGitRemote;
  if (remote === undefined) return { endpoints: configured };
  const read = approvedEndpointOf(remote, 'the x-abapgit-* headers:');
  return 'fault' in read
    ? { refused: read.fault }
    : { endpoints: [read.endpoint] };
}

/** The endpoints file beside a destination's `.env`: `<name>.abapgit.yaml` for `<name>.env`. */
export function abapGitEndpointsFileOf(envFile: string): string {
  const base = path.basename(envFile);
  const name = base.endsWith('.env') ? base.slice(0, -'.env'.length) : base;
  return path.join(path.dirname(envFile), `${name}.abapgit.yaml`);
}

/**
 * The approved endpoints of an endpoints file, checked: none when the file
 * does not exist; an `ApprovedEndpointError` naming the file's entry (never
 * a value) when it cannot be read or an entry cannot be served. The file:
 *
 * ```yaml
 * endpoints:
 *   - url: https://<host>/<path>
 *     user: <user>
 *     token: <password or token>
 *     aliases: [https://<host>/<other path>]
 * ```
 */
export function readApprovedEndpointsFile(
  file: string,
): readonly ApprovedEndpoint[] {
  if (!fs.existsSync(file)) return [];
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    throw new ApprovedEndpointError(`${file} could not be read`);
  }
  let parsed: JsonValue | undefined;
  try {
    parsed = jsonOf(parseYaml(text));
  } catch {
    throw new ApprovedEndpointError(`${file} is not YAML`);
  }
  return parseApprovedEndpoints(endpointConfigsOf(parsed, file), file);
}

/** The entries of a parsed endpoints file, each field a string; an error names its place. */
function endpointConfigsOf(
  parsed: JsonValue | undefined,
  file: string,
): ApprovedEndpointConfig[] {
  if (parsed === undefined || parsed === null) return [];
  const endpoints = isJsonObject(parsed) ? parsed.endpoints : undefined;
  if (endpoints === undefined) return [];
  if (!Array.isArray(endpoints)) {
    throw new ApprovedEndpointError(`${file}: endpoints is not a list`);
  }
  return endpoints.map((entry, index) => {
    const place = `${file}: endpoint ${index + 1}`;
    if (!isJsonObject(entry)) {
      throw new ApprovedEndpointError(`${place} is not a mapping`);
    }
    const url = stringField(entry.url, `${place} url`);
    const user = stringField(entry.user, `${place} user`);
    const token = stringField(entry.token, `${place} token`);
    const aliases = entry.aliases;
    if (aliases === undefined) return { url, user, token };
    if (!Array.isArray(aliases)) {
      throw new ApprovedEndpointError(`${place} aliases is not a list`);
    }
    return {
      url,
      user,
      token,
      aliases: aliases.map((alias, at) =>
        stringField(alias, `${place} alias ${at + 1}`),
      ),
    };
  });
}

function stringField(value: JsonValue | undefined, place: string): string {
  if (typeof value !== 'string') {
    throw new ApprovedEndpointError(`${place} is not a string`);
  }
  return value;
}
