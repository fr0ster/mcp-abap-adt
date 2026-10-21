/**
 * `@mcp-abap-adt/sse/launcher` takes 19.1.0's options, checked by the
 * compiler: `npm --prefix sse run test:check` compiles this file, and it
 * stops compiling the moment `packageName` is required on this path again.
 * The runtime's own path keeps `packageName` required: the
 * `@ts-expect-error` below fails the check the moment it is not.
 *
 * Nothing runs here: it is not a test file, and Jest never loads it.
 */
import type { LauncherEdges } from '@mcp-abap-adt/lib/config';
import type { ToolSet } from '@mcp-abap-adt/lib/tool-set';
import { main as runtimeMain } from '@mcp-abap-adt/server-runtime/sse';
import { launch, main, type SseLauncherOptions } from '../launcher';

declare const toolSet: ToolSet;
declare const edges: LauncherEdges;
declare const config: Parameters<typeof launch>[0];
declare const deps: Parameters<typeof launch>[2];

/** 19.1.0's call, as an importer wrote it: no `packageName`. */
export const asIn1910 = (): Promise<unknown> =>
  main({ toolSet, program: 'mcp-abap-adt-x', version: '1.0.0' }, edges);

/** 19.1.0's options type: its three members fill it. */
export const options1910: SseLauncherOptions = {
  toolSet,
  program: 'mcp-abap-adt-x',
  version: '1.0.0',
};

/** 19.1.0's `launch`, the same options. */
export const launch1910 = (): Promise<unknown> =>
  launch(config, options1910, deps);

/** A `packageName` given still passes. */
export const named = (): Promise<unknown> =>
  main({ ...options1910, packageName: '@scope/own' }, edges);

/** The runtime's own path: `packageName` required. */
export const runtimeRequires = (): Promise<unknown> =>
  // @ts-expect-error packageName is required on @mcp-abap-adt/server-runtime/sse
  runtimeMain({ toolSet, program: 'mcp-abap-adt-x', version: '1.0.0' }, edges);
