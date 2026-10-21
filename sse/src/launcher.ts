/**
 * `@mcp-abap-adt/sse/launcher` — the HTTP+SSE launcher. Its code lives in
 * `@mcp-abap-adt/server-runtime` (19.2.0); this path re-exports
 * `@mcp-abap-adt/server-runtime/sse`, so an importer sees the names it saw
 * before.
 *
 * And it takes 19.1.0's options: `SseLauncherOptions`, `main` and `launch` here
 * accept `{ toolSet, program, version }` as before. `packageName` — required
 * on the runtime's own path — is optional here and defaults to
 * `@mcp-abap-adt/sse`, the package a second copy of lib then asks to
 * reinstall; a value given passes through.
 */
import type { LauncherEdges } from '@mcp-abap-adt/lib/config';
import {
  type SseLauncherOptions as RuntimeSseLauncherOptions,
  launch as runtimeLaunch,
  main as runtimeMain,
  type SseLauncherDeps,
} from '@mcp-abap-adt/server-runtime/sse';
import { SSE_PACKAGE } from './sseVersion.js';

export * from '@mcp-abap-adt/server-runtime/sse';

/** 19.1.0's options; `packageName` optional, `@mcp-abap-adt/sse` when not given. */
export interface SseLauncherOptions
  extends Omit<RuntimeSseLauncherOptions, 'packageName'> {
  /** The command's own npm package: the one a second copy of lib asks to reinstall. Default `@mcp-abap-adt/sse`. */
  packageName?: string | undefined;
}

function withPackage(options: SseLauncherOptions): RuntimeSseLauncherOptions {
  return { ...options, packageName: options.packageName ?? SSE_PACKAGE };
}

export async function main(
  options: SseLauncherOptions,
  edges?: LauncherEdges,
): ReturnType<typeof runtimeMain> {
  return runtimeMain(withPackage(options), edges);
}

export async function launch(
  config: Parameters<typeof runtimeLaunch>[0],
  options: SseLauncherOptions,
  deps: SseLauncherDeps,
): ReturnType<typeof runtimeLaunch> {
  return runtimeLaunch(config, withPackage(options), deps);
}
