/**
 * `@mcp-abap-adt/http/launcher` — the Streamable HTTP launcher. Its code lives in
 * `@mcp-abap-adt/server-runtime` (19.2.0); this path re-exports
 * `@mcp-abap-adt/server-runtime/http`, so an importer sees the names it saw
 * before.
 *
 * And it takes 19.1.0's options: `HttpLauncherOptions`, `main` and `launch` here
 * accept `{ toolSet, program, version }` as before. `packageName` — required
 * on the runtime's own path — is optional here and defaults to
 * `@mcp-abap-adt/http`, the package a second copy of lib then asks to
 * reinstall; a value given passes through.
 */
import type { LauncherEdges } from '@mcp-abap-adt/lib/config';
import {
  type HttpLauncherDeps,
  type HttpLauncherOptions as RuntimeHttpLauncherOptions,
  launch as runtimeLaunch,
  main as runtimeMain,
} from '@mcp-abap-adt/server-runtime/http';
import { HTTP_PACKAGE } from './httpVersion.js';

export * from '@mcp-abap-adt/server-runtime/http';

/** 19.1.0's options; `packageName` optional, `@mcp-abap-adt/http` when not given. */
export interface HttpLauncherOptions
  extends Omit<RuntimeHttpLauncherOptions, 'packageName'> {
  /** The command's own npm package: the one a second copy of lib asks to reinstall. Default `@mcp-abap-adt/http`. */
  packageName?: string | undefined;
}

function withPackage(options: HttpLauncherOptions): RuntimeHttpLauncherOptions {
  return { ...options, packageName: options.packageName ?? HTTP_PACKAGE };
}

export async function main(
  options: HttpLauncherOptions,
  edges?: LauncherEdges,
): ReturnType<typeof runtimeMain> {
  return runtimeMain(withPackage(options), edges);
}

export async function launch(
  config: Parameters<typeof runtimeLaunch>[0],
  options: HttpLauncherOptions,
  deps: HttpLauncherDeps,
): ReturnType<typeof runtimeLaunch> {
  return runtimeLaunch(config, withPackage(options), deps);
}
