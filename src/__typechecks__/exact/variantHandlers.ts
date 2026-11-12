/**
 * The per-variant typecheck of the definitions in `src` stated per variant
 * (`byVariant`; no-assertions plan, S2a): each variant's schema output is an
 * argument its handler takes, so a later `byVariant` with a schema type per
 * variant cannot pass unnoticed. Run by `npm run test:check:exact` with
 * `exactOptionalPropertyTypes`, and by `test:check` without it; never emitted.
 */
import type * as z from 'zod';
import type {
  handleRunATC,
  TOOL_DEFINITION as RunATC,
} from '../../handlers/atc/high/handleRunATC';
import type {
  TOOL_DEFINITION as GetObjectDraft,
  handleGetObjectDraft,
} from '../../handlers/common/readonly/handleGetObjectDraft';
import type {
  TOOL_DEFINITION as GetObjectVersionDiff,
  handleGetObjectVersionDiff,
} from '../../handlers/common/readonly/handleGetObjectVersionDiff';
import type {
  TOOL_DEFINITION as GetObjectVersionSource,
  handleGetObjectVersionSource,
} from '../../handlers/common/readonly/handleGetObjectVersionSource';
import type {
  TOOL_DEFINITION as GetObjectVersions,
  handleGetObjectVersions,
} from '../../handlers/common/readonly/handleGetObjectVersions';
import type { HandlerContext } from '../../lib/handlers/interfaces';

/** The arguments `H` takes. */
type ArgsOf<H> = H extends (context: HandlerContext, args: infer A) => unknown
  ? A
  : never;

/** `true` when every output of `S` is an argument `H` takes. */
type Accepts<S extends z.ZodType, H> = [z.output<S>] extends [ArgsOf<H>]
  ? true
  : false;

export const runAtcOnprem: Accepts<
  (typeof RunATC.variants)['onprem']['inputSchema'],
  typeof handleRunATC
> = true;
export const runAtcCloud: Accepts<
  (typeof RunATC.variants)['cloud']['inputSchema'],
  typeof handleRunATC
> = true;
export const objectDraftOnprem: Accepts<
  (typeof GetObjectDraft.variants)['onprem']['inputSchema'],
  typeof handleGetObjectDraft
> = true;
export const objectDraftCloud: Accepts<
  (typeof GetObjectDraft.variants)['cloud']['inputSchema'],
  typeof handleGetObjectDraft
> = true;
export const versionsOnprem: Accepts<
  (typeof GetObjectVersions.variants)['onprem']['inputSchema'],
  typeof handleGetObjectVersions
> = true;
export const versionsCloud: Accepts<
  (typeof GetObjectVersions.variants)['cloud']['inputSchema'],
  typeof handleGetObjectVersions
> = true;
export const versionSourceOnprem: Accepts<
  (typeof GetObjectVersionSource.variants)['onprem']['inputSchema'],
  typeof handleGetObjectVersionSource
> = true;
export const versionSourceCloud: Accepts<
  (typeof GetObjectVersionSource.variants)['cloud']['inputSchema'],
  typeof handleGetObjectVersionSource
> = true;
export const versionDiffOnprem: Accepts<
  (typeof GetObjectVersionDiff.variants)['onprem']['inputSchema'],
  typeof handleGetObjectVersionDiff
> = true;
export const versionDiffCloud: Accepts<
  (typeof GetObjectVersionDiff.variants)['cloud']['inputSchema'],
  typeof handleGetObjectVersionDiff
> = true;
