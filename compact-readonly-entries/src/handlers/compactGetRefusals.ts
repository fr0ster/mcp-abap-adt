/**
 * The target tool of each `HandlerGet` route, as `HandlerGet`'s schema
 * checks a call: the arguments the route hands its target are checked by
 * that target's own schema on the variant (`schemaOn`), and a refusal
 * names the target and says its words, at the argument. One table per
 * route table of `compactReadRoutes` / `compactPartRoutes`, member for
 * member — `compactGetRefusals.test.ts` keeps their keys equal.
 */

import {
  COMPACT_MAIN_PROGRAMS,
  type CompactObjectType,
  HANDLER_GET_DRAFT_TYPES,
} from '@mcp-abap-adt/lib/compact-shared';
import {
  schemaOn,
  type ToolArgs,
  type ToolDefinition,
} from '@mcp-abap-adt/lib/handlers';
import { READ_DEFINITIONS } from '@mcp-abap-adt/lib/handlers/read';
import type * as z from 'zod';
import { draftArgsOf } from './compactPartRoutes';
import { textElementsArgsOf } from './compactReadRoutes';

type Variant = keyof typeof COMPACT_MAIN_PROGRAMS;

/** A route's check of the arguments it is handed, on `variant`: issues into `ctx`. */
export type RouteRefusal = (
  args: ToolArgs,
  variant: Variant,
  ctx: z.RefinementCtx,
) => void;

const D = READ_DEFINITIONS;

/** The target `definition`'s schema on the arguments: each issue named by the target. */
function of(definition: ToolDefinition): RouteRefusal {
  return (args, variant, ctx) => {
    const parsed = schemaOn(definition, variant).safeParse(args);
    if (parsed.success) return;
    for (const issue of parsed.error.issues) {
      ctx.addIssue({
        code: 'custom',
        message: `${definition.name}: ${issue.message}`,
        path: issue.path,
      });
    }
  };
}

/** An include's read of `part`: GetInclude's, with the part fixed. */
const includePart =
  (part: 'source' | 'metadata'): RouteRefusal =>
  (args, variant, ctx) =>
    of(D.GetInclude)({ ...args, part }, variant, ctx);

/** The source read of each object type (`compactReadRouterMap`'s `get`). */
export const SOURCE_REFUSALS: Partial<Record<CompactObjectType, RouteRefusal>> =
  {
    PACKAGE: of(D.GetPackage),
    DOMAIN: of(D.GetDomain),
    DATA_ELEMENT: of(D.GetDataElement),
    TRANSPORT: of(D.ReadTransportObjects),
    TABLE: of(D.GetTable),
    STRUCTURE: of(D.GetStructure),
    TABLE_TYPE: of(D.GetTableType),
    DDL: of(D.GetDdl),
    SERVICE_DEFINITION: of(D.GetServiceDefinition),
    SERVICE_BINDING: of(D.GetServiceBinding),
    CLASS: of(D.GetClass),
    UNIT_TEST: of(D.GetUnitTestResult),
    CDS_UNIT_TEST: of({
      ...D.GetCdsUnitTestResult,
      inputSchema: D.GetUnitTestResult.inputSchema,
    }),
    LOCAL_TEST_CLASS: of(D.GetLocalTestClass),
    LOCAL_TYPES: of(D.GetLocalTypes),
    LOCAL_DEFINITIONS: of(D.GetLocalDefinitions),
    LOCAL_MACROS: of(D.GetLocalMacros),
    PROGRAM: of(D.GetProgram),
    INCLUDE: includePart('source'),
    INTERFACE: of(D.GetInterface),
    FUNCTION_GROUP: of(D.GetFunctionGroup),
    FUNCTION_MODULE: of(D.GetFunctionModule),
    BEHAVIOR_DEFINITION: of(D.GetBehaviorDefinition),
    BEHAVIOR_IMPLEMENTATION: of(D.GetBehaviorImplementation),
    METADATA_EXTENSION: of(D.GetMetadataExtension),
    TABLE_SETTINGS: of(D.GetTableSettings),
    PROGRAM_TEXT_ELEMENTS: (args, variant, ctx) =>
      of(D.GetTextElements)(
        textElementsArgsOf('program', args.program_name, args),
        variant,
        ctx,
      ),
    FUNCTION_GROUP_TEXT_ELEMENTS: (args, variant, ctx) =>
      of(D.GetTextElements)(
        textElementsArgsOf('function_group', args.function_group_name, args),
        variant,
        ctx,
      ),
    CLASS_TEXT_ELEMENTS: (args, variant, ctx) =>
      of(D.GetTextElements)(
        textElementsArgsOf('class', args.class_name, args),
        variant,
        ctx,
      ),
  };

/** `part: 'metadata'` (`compactMetadataRoutes`). */
export const METADATA_REFUSALS: Partial<
  Record<CompactObjectType, RouteRefusal>
> = {
  PACKAGE: of(D.GetPackage),
  DOMAIN: of(D.GetDomain),
  DATA_ELEMENT: of(D.GetDataElement),
  TABLE: of(D.GetTable),
  STRUCTURE: of(D.GetStructure),
  TABLE_TYPE: of(D.GetTableType),
  DDL: of(D.GetDdl),
  SERVICE_DEFINITION: of(D.GetServiceDefinition),
  SERVICE_BINDING: of(D.GetServiceBinding),
  CLASS: of(D.GetClass),
  PROGRAM: of(D.GetProgram),
  INCLUDE: includePart('metadata'),
  INTERFACE: of(D.GetInterface),
  FUNCTION_GROUP: of(D.GetFunctionGroup),
  FUNCTION_MODULE: of(D.GetFunctionModule),
  BEHAVIOR_DEFINITION: of(D.GetBehaviorDefinition),
  BEHAVIOR_IMPLEMENTATION: of(D.GetBehaviorImplementation),
  METADATA_EXTENSION: of(D.GetMetadataExtension),
  TRANSPORT: of(D.GetTransport),
};

/** `part: 'urls'` (`compactUrlRoutes`). */
export const URL_REFUSALS: Partial<Record<CompactObjectType, RouteRefusal>> = {
  SERVICE_BINDING: of(D.GetServiceBindingPreviewUrl),
};

/** `part: 'contents'` (`compactContentsRoutes`): GetPackageContents' rules too. */
export const CONTENTS_REFUSALS: Partial<
  Record<CompactObjectType, RouteRefusal>
> = {
  PACKAGE: of(D.GetPackageContents),
};

/** `part: 'main_programs'` on `variant` (`compactMainProgramsRoutes`). */
export function mainProgramsRefusals(
  variant: Variant,
): Partial<Record<CompactObjectType, RouteRefusal>> {
  const refusals: Partial<Record<CompactObjectType, RouteRefusal>> = {};
  for (const member of COMPACT_MAIN_PROGRAMS[variant]) {
    refusals[member] = of(D.GetMainPrograms);
  }
  return refusals;
}

/** `part: 'draft'` on `variant` (`compactDraftRoutes`): GetObjectDraft's, on the arguments the draft read hands it. */
export function draftRefusals(
  variant: Variant,
): Partial<Record<CompactObjectType, RouteRefusal>> {
  const refusals: Partial<Record<CompactObjectType, RouteRefusal>> = {};
  for (const member of HANDLER_GET_DRAFT_TYPES[variant]) {
    refusals[member] = (args, variant, ctx) =>
      of(D.GetObjectDraft)(draftArgsOf(args), variant, ctx);
  }
  return refusals;
}
