import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `@mcp-abap-adt/core`'s own version, read from its own manifest.
 *
 * One step up from this file is `server/` in a checkout (`src/` under test,
 * `dist/` when built) and the package root when installed — in every layout it is
 * core's `package.json`. See `showVersion` in `launcher.ts` for what two steps cost.
 *
 * It replaces `process.env.npm_package_version`, which npm sets only for a process
 * it started itself (`npm run`, `npx`). Started any other way — a client's config,
 * `node bin/…`, `mcp-proxy` — the variable was unset and every transport answered
 * `serverInfo.version: "1.0.0"`, whatever was installed.
 */
const manifest: { name: string; version: string } = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
);

export const CORE_VERSION: string = manifest.version;

/** `@mcp-abap-adt/core`'s own package name, from the same manifest: what a second copy of lib asks to reinstall. */
export const CORE_PACKAGE: string = manifest.name;
