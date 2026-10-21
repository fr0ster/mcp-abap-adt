import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { basename } from 'node:path';
import { gunzipSync } from 'node:zlib';

/**
 * A registry on loopback that serves this checkout's tarballs under their own
 * names and versions, and passes every other `@mcp-abap-adt/*` request on to
 * the public registry.
 *
 * **Why a registry and not the tarballs on the command line.** Naming a
 * tarball makes it a top-level package of the install: `npm install -g
 * compact.tgz core.tgz lib.tgz …` puts `lib` at the global root, where every
 * package finds it, and a tree that has two copies once installed from the
 * registry (19.1.0: `npm install -g @mcp-abap-adt/compact @mcp-abap-adt/core`)
 * has one. Only an install that names the binaries alone, as a user does,
 * builds the user's tree — and its dependencies must then come from a
 * registry. This one answers for the release's own packages from the tarballs
 * packed here (the versions being released are not published yet), so the
 * tree is the one the published release will give.
 *
 * Point the scope at it with `npmArgs` (the scope's registry, and no rewriting
 * of the public registry's tarball URLs to it); unscoped packages go to the
 * public registry as npm is configured.
 */
export interface TarballRegistry {
  /** `http://127.0.0.1:<port>` */
  readonly url: string;
  /** The npm options that route the `@mcp-abap-adt` scope here. */
  readonly npmArgs: readonly string[];
  /** Every name served from a tarball, with its versions, oldest first. */
  readonly served: ReadonlyMap<string, readonly string[]>;
  /** The package names passed on to the public registry, as requested. */
  readonly proxied: readonly string[];
  /** Whether a lockfile's `resolved` URL is one of this registry's tarballs. */
  isOwnTarball(resolved: string | undefined): boolean;
  close(): Promise<void>;
}

const UPSTREAM = 'https://registry.npmjs.org';
const TARBALLS = '/-/matrix/';

/** `package/package.json` out of an npm tarball (gzip of a ustar archive). */
export function tarballManifest(tarball: string): Record<string, unknown> {
  const tar = gunzipSync(readFileSync(tarball));
  for (let at = 0; at + 512 <= tar.length; ) {
    const header = tar.subarray(at, at + 512);
    const name = header.subarray(0, 100).toString('utf8').split('\0')[0];
    if (name === '') break;
    const size = Number.parseInt(
      header.subarray(124, 136).toString('utf8').split('\0')[0]?.trim() || '0',
      8,
    );
    const body = at + 512;
    if (name === 'package/package.json')
      return JSON.parse(tar.subarray(body, body + size).toString('utf8'));
    at = body + Math.ceil(size / 512) * 512;
  }
  throw new Error(`no package/package.json in ${tarball}`);
}

const byVersion = (a: string, b: string): number => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) {
    const d = (x?.[i] ?? 0) - (y?.[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};

export async function startTarballRegistry(
  tarballs: readonly string[],
): Promise<TarballRegistry> {
  const files = new Map<string, string>();
  const versions = new Map<string, Map<string, Record<string, unknown>>>();
  for (const tarball of tarballs) {
    const manifest = tarballManifest(tarball);
    const name = manifest.name as string;
    const version = manifest.version as string;
    const bytes = readFileSync(tarball);
    const file = basename(tarball);
    files.set(file, tarball);
    const { scripts: _scripts, devDependencies: _dev, ...published } = manifest;
    const entry = {
      ...published,
      dist: {
        // Filled with the port once the server listens.
        tarball: file,
        integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
        shasum: createHash('sha1').update(bytes).digest('hex'),
      },
    };
    const known = versions.get(name) ?? new Map();
    known.set(version, entry);
    versions.set(name, known);
  }

  const proxied: string[] = [];
  let url = '';

  const packument = (name: string): unknown => {
    const known = versions.get(name) as Map<string, Record<string, unknown>>;
    const all = [...known.keys()].sort(byVersion);
    return {
      name,
      'dist-tags': { latest: all.at(-1) },
      versions: Object.fromEntries(
        all.map((version) => {
          const entry = known.get(version) as Record<string, unknown>;
          const dist = entry.dist as Record<string, string>;
          return [
            version,
            {
              ...entry,
              dist: { ...dist, tarball: `${url}${TARBALLS}${dist.tarball}` },
            },
          ];
        }),
      ),
    };
  };

  const answer = async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> => {
    const path = (req.url ?? '/').split('?')[0] as string;
    if (path.startsWith(TARBALLS)) {
      const tarball = files.get(path.slice(TARBALLS.length));
      if (tarball === undefined) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(readFileSync(tarball));
      return;
    }
    const name = decodeURIComponent(path.slice(1)).split('/-/')[0] as string;
    if (versions.has(name)) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(packument(name)));
      return;
    }
    proxied.push(name);
    const upstream = await fetch(`${UPSTREAM}${path}`, {
      headers: { accept: req.headers.accept ?? 'application/json' },
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      'content-type':
        upstream.headers.get('content-type') ?? 'application/octet-stream',
    });
    res.end(body);
  };

  const server = createServer((req, res) => {
    answer(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    url,
    npmArgs: [
      `--@mcp-abap-adt:registry=${url}/`,
      '--replace-registry-host=never',
    ],
    served: new Map(
      [...versions].map(([name, known]) => [
        name,
        [...known.keys()].sort(byVersion),
      ]),
    ),
    proxied,
    isOwnTarball: (resolved) =>
      resolved?.startsWith(`${url}${TARBALLS}`) === true,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
