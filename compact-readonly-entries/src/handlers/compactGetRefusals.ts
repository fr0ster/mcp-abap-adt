/**
 * What each `HandlerGet` route refuses of the arguments it is handed,
 * without the call: its target tool's schema, then the rules its handler
 * checks before it reads (`argumentsRefusalOf`). One table per route
 * table of `compactReadRoutes` / `compactPartRoutes`, member for member —
 * `compactGetRefusals.test.ts` keeps their keys equal — so `HandlerGet`
 * refuses a call before it takes a connection in exactly the words its
 * route would answer.
 */

import {
  COMPACT_MAIN_PROGRAMS,
  type CompactObjectType,
  HANDLER_GET_DRAFT_TYPES,
} from '@mcp-abap-adt/lib/compact-shared';
import { argumentsRefusalOf, type ToolArgs } from '@mcp-abap-adt/lib/handlers';
import {
  packageContentsArgumentsRefusal,
  READ_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/read';
import { draftArgsOf } from './compactPartRoutes';

/** A route's refusal of the arguments it is handed (`undefined`: none). */
export type RouteRefusal = (args: ToolArgs) => Error | undefined;

const D = READ_DEFINITIONS;
const of = argumentsRefusalOf;

/** An include's read of `part`: GetInclude's, with the part fixed. */
const includePart =
  (part: 'source' | 'metadata'): RouteRefusal =>
  (args) =>
    of(D.GetInclude)({ ...args, part });

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
};

/** `part: 'urls'` (`compactUrlRoutes`). */
export const URL_REFUSALS: Partial<Record<CompactObjectType, RouteRefusal>> = {
  SERVICE_BINDING: of(D.GetServiceBindingPreviewUrl),
};

/** `part: 'contents'` (`compactContentsRoutes`): GetPackageContents' rules too. */
export const CONTENTS_REFUSALS: Partial<
  Record<CompactObjectType, RouteRefusal>
> = {
  PACKAGE: of(D.GetPackageContents, packageContentsArgumentsRefusal),
};

type Variant = keyof typeof COMPACT_MAIN_PROGRAMS;

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
    refusals[member] = (args) => of(D.GetObjectDraft)(draftArgsOf(args));
  }
  return refusals;
}
