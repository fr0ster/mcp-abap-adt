/**
 * `@mcp-abap-adt/core/launcher` — the stdio launcher. Its code lives in
 * `@mcp-abap-adt/server-runtime` (19.2.0); this path re-exports
 * `@mcp-abap-adt/server-runtime/stdio`, so an importer sees the names it saw
 * before.
 *
 * And it takes 19.1.0's options: `LauncherOptions`, `main` and `launch` here
 * accept `{ toolSet, program, version }` as before. `packageName` — required
 * on the runtime's own path — is optional here and defaults to
 * `@mcp-abap-adt/core`, the package a second copy of lib then asks to
 * reinstall; a value given passes through.
 */
import {
  type LauncherDeps,
  type LauncherOptions as RuntimeLauncherOptions,
  launch as runtimeLaunch,
  main as runtimeMain,
  type StdioLauncherEdges,
} from '@mcp-abap-adt/server-runtime/stdio';
import { CORE_PACKAGE } from './coreVersion.js';

export * from '@mcp-abap-adt/server-runtime/stdio';

/** 19.1.0's options; `packageName` optional, `@mcp-abap-adt/core` when not given. */
export interface LauncherOptions
  extends Omit<RuntimeLauncherOptions, 'packageName'> {
  /** The command's own npm package: the one a second copy of lib asks to reinstall. Default `@mcp-abap-adt/core`. */
  packageName?: string | undefined;
}

function withPackage(options: LauncherOptions): RuntimeLauncherOptions {
  return { ...options, packageName: options.packageName ?? CORE_PACKAGE };
}

export async function main(
  options: LauncherOptions,
  edges?: StdioLauncherEdges,
): Promise<void> {
  return runtimeMain(withPackage(options), edges);
}

export async function launch(
  config: Parameters<typeof runtimeLaunch>[0],
  options: LauncherOptions,
  deps: LauncherDeps,
): Promise<void> {
  return runtimeLaunch(config, withPackage(options), deps);
}
