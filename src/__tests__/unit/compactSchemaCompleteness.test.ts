/**
 * Runtime guard (issue #123): the compact facade routes `object_type` -> a
 * per-type handler via `compactRouterMap`, passing the client args straight
 * through. Therefore every routed handler's top-level `inputSchema.required`
 * arg (except the compact-only `object_type`) MUST be exposed as a property of
 * the matching compact schema (create/update/delete). This test reads each
 * routed handler's TRUE `TOOL_DEFINITION.inputSchema.required` at RUNTIME and
 * fails if any required arg is missing from its compact schema.
 *
 * Source of truth is the handler module's exported TOOL_DEFINITION, imported
 * from the SAME path `compactRouter.ts` imports the handler function from.
 */

import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { TOOL_DEFINITION as D_BEHAVIOR_DEFINITION } from '../../handlers/behavior_definition/high/handleDeleteBehaviorDefinition';
import { TOOL_DEFINITION as D_BEHAVIOR_IMPLEMENTATION } from '../../handlers/behavior_implementation/high/handleDeleteBehaviorImplementation';
import { TOOL_DEFINITION as D_CLASS } from '../../handlers/class/high/handleDeleteClass';
import { TOOL_DEFINITION as D_LOCAL_DEFINITIONS } from '../../handlers/class/high/handleDeleteLocalDefinitions';
import { TOOL_DEFINITION as D_LOCAL_MACROS } from '../../handlers/class/high/handleDeleteLocalMacros';
import { TOOL_DEFINITION as D_LOCAL_TEST_CLASS } from '../../handlers/class/high/handleDeleteLocalTestClass';
import { TOOL_DEFINITION as D_LOCAL_TYPES } from '../../handlers/class/high/handleDeleteLocalTypes';
import { TOOL_DEFINITION as D_DATA_ELEMENT } from '../../handlers/data_element/high/handleDeleteDataElement';
import { TOOL_DEFINITION as D_DDL } from '../../handlers/ddl/high/handleDeleteDdl';
// --- delete (mirror compactRouterMap delete entries) ---
import { TOOL_DEFINITION as D_DOMAIN } from '../../handlers/domain/high/handleDeleteDomain';
import { TOOL_DEFINITION as D_FUNCTION_GROUP } from '../../handlers/function_group/high/handleDeleteFunctionGroup';
import { TOOL_DEFINITION as D_FUNCTION_MODULE } from '../../handlers/function_module/high/handleDeleteFunctionModule';
import { TOOL_DEFINITION as D_INTERFACE } from '../../handlers/interface/high/handleDeleteInterface';
import { TOOL_DEFINITION as D_METADATA_EXTENSION } from '../../handlers/metadata_extension/high/handleDeleteMetadataExtension';
import { TOOL_DEFINITION as D_PROGRAM } from '../../handlers/program/high/handleDeleteProgram';
import { TOOL_DEFINITION as D_SERVICE_BINDING } from '../../handlers/service_binding/high/handleDeleteServiceBinding';
import { TOOL_DEFINITION as D_SERVICE_DEFINITION } from '../../handlers/service_definition/high/handleDeleteServiceDefinition';
import { TOOL_DEFINITION as D_STRUCTURE } from '../../handlers/structure/high/handleDeleteStructure';
import { TOOL_DEFINITION as D_TABLE } from '../../handlers/table/high/handleDeleteTable';
import { TOOL_DEFINITION as D_CDS_UNIT_TEST } from '../../handlers/unit_test/high/handleDeleteCdsUnitTest';
import { TOOL_DEFINITION as D_UNIT_TEST } from '../../handlers/unit_test/high/handleDeleteUnitTest';
import {
  compactCreateSchema,
  compactDeleteSchema,
  compactUpdateSchema,
} from '../../lib/compact/compactSchemas';

// inputSchema shape varies across handlers (JSON-schema-style objects with a
// top-level `required: string[]`, or Zod schemas with no `required`). We only
// read `inputSchema.required` at runtime, defaulting to [] when absent, so the
// type is intentionally permissive.
type ToolDef = {
  inputSchema?: { required?: readonly string[] } | Record<string, unknown>;
};

function requiredOf(def: ToolDef): readonly string[] {
  const req = (def.inputSchema as { required?: unknown } | undefined)?.required;
  return Array.isArray(req) ? (req as string[]) : [];
}

/**
 * The delete routes. The create and update routes are not here: compact
 * `HandlerCreate` is the create request alone (`handleCreateOnly`) and
 * `HandlerUpdate` the one write under `lock_handle` (`handleUpdateUnderLock`),
 * not the full `Create<Type>` / `Update<Type>`, so their required arguments are
 * not their own — `createSingleCall.test.ts` and `updateSingleCall.test.ts`
 * (`compact-modify/src/__tests__/`) pin what their schemas and descriptions
 * name.
 */
const ROUTED: Record<'delete', Record<string, ToolDef>> = {
  delete: {
    DOMAIN: D_DOMAIN,
    DATA_ELEMENT: D_DATA_ELEMENT,
    TABLE: D_TABLE,
    STRUCTURE: D_STRUCTURE,
    DDL: D_DDL,
    SERVICE_DEFINITION: D_SERVICE_DEFINITION,
    SERVICE_BINDING: D_SERVICE_BINDING,
    CLASS: D_CLASS,
    UNIT_TEST: D_UNIT_TEST,
    CDS_UNIT_TEST: D_CDS_UNIT_TEST,
    LOCAL_TEST_CLASS: D_LOCAL_TEST_CLASS,
    LOCAL_TYPES: D_LOCAL_TYPES,
    LOCAL_DEFINITIONS: D_LOCAL_DEFINITIONS,
    LOCAL_MACROS: D_LOCAL_MACROS,
    PROGRAM: D_PROGRAM,
    INTERFACE: D_INTERFACE,
    FUNCTION_GROUP: D_FUNCTION_GROUP,
    FUNCTION_MODULE: D_FUNCTION_MODULE,
    BEHAVIOR_DEFINITION: D_BEHAVIOR_DEFINITION,
    BEHAVIOR_IMPLEMENTATION: D_BEHAVIOR_IMPLEMENTATION,
    METADATA_EXTENSION: D_METADATA_EXTENSION,
  },
};

const SCHEMA = {
  create: compactCreateSchema,
  update: compactUpdateSchema,
  delete: compactDeleteSchema,
} as const;

for (const op of ['delete'] as const) {
  describe(`compact ${op} schema exposes every routed handler required arg`, () => {
    const props = Object.keys(SCHEMA[op].properties);
    for (const [type, def] of Object.entries(ROUTED[op])) {
      const required = requiredOf(def).filter(
        (r: string) => r !== 'object_type',
      );
      if (required.length === 0) {
        it(`${type}: (no required args)`, () => {
          expect(true).toBe(true);
        });
        continue;
      }
      it.each(required)(`${type}: %s`, (arg) => {
        expect(props).toContain(arg);
      });
    }
  });
}

/**
 * Guard (Task 2): every arg advertised in the facade TOOL_DEFINITION.description
 * as `TYPE(arg*)` must be a property of the matching compact schema.
 * Catches stale description text that references args the schema doesn't expose.
 */
function parseDescriptionArgs(
  description: string,
): Array<[type: string, arg: string]> {
  const pairs: Array<[string, string]> = [];
  const matches = [...description.matchAll(/([A-Z_]+)\(([^)]*)\)/g)];
  for (const m of matches) {
    const type = m[1];
    for (const part of m[2].split(',')) {
      const token = part.trim();
      if (/^[a-z_]+\*$/.test(token)) {
        pairs.push([type, token.slice(0, -1)]);
      }
    }
  }
  return pairs;
}

/**
 * The facade's own tool definitions, taken from the package that owns them.
 *
 * `HandlerCreate`, `HandlerUpdate` and `HandlerDelete` live in
 * `@mcp-abap-adt/compact-modify` now. The entries builder is their public shape, so
 * the definitions are looked up by name from it rather than imported file by file —
 * a test in this repository may reach a sibling package's source; the PUBLISHED
 * `lib` does not, and must not.
 */
const facadeDefinition = (name: string) => {
  const entry = compactModifyEntries(() => ({}) as never).find(
    (candidate) => candidate.toolDefinition.name === name,
  );
  if (!entry) throw new Error(`the compact facade has no ${name}`);
  return entry.toolDefinition;
};

const FACADE = {
  create: facadeDefinition('HandlerCreate'),
  update: facadeDefinition('HandlerUpdate'),
  delete: facadeDefinition('HandlerDelete'),
} as const;

for (const op of ['create', 'update', 'delete'] as const) {
  describe(`compact ${op} facade description only advertises schema-backed args`, () => {
    const props = Object.keys(SCHEMA[op].properties);
    const advertised = parseDescriptionArgs(FACADE[op].description);
    if (advertised.length === 0) {
      it('(no advertised required args)', () => expect(true).toBe(true));
    } else {
      it.each(advertised)('%s(%s*) is backed by schema', (_type, arg) => {
        expect(props).toContain(arg);
      });
    }
  });
}

/**
 * Guard (per-type): for each TYPE advertised in the facade description,
 * every advertised arg must be a member of that type's routed handler
 * top-level inputSchema.required. Catches wrong args listed for a specific
 * object type (e.g. run_id advertised for CDS_UNIT_TEST update/delete when
 * that handler actually requires class_name / test_class_source).
 * Advertised args are a SUBSET check — descriptions may legitimately omit
 * common args like package_name.
 */
function parseDescriptionArgsByType(
  description: string,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const matches = [...description.matchAll(/([A-Z_]+)\(([^)]*)\)/g)];
  for (const m of matches) {
    const type = m[1];
    const args: string[] = [];
    for (const part of m[2].split(',')) {
      const token = part.trim();
      if (/^[a-z_]+\*$/.test(token)) {
        args.push(token.slice(0, -1));
      }
    }
    if (args.length > 0) {
      map.set(type, args);
    }
  }
  return map;
}

for (const op of ['delete'] as const) {
  describe(`compact ${op} facade description per-type args match handler required`, () => {
    const typeArgsMap = parseDescriptionArgsByType(FACADE[op].description);
    if (typeArgsMap.size === 0) {
      it('(no per-type advertised args)', () => expect(true).toBe(true));
    } else {
      for (const [type, advertised] of typeArgsMap) {
        const handlerDef = ROUTED[op][type];
        if (!handlerDef) {
          // Type not in ROUTED map (e.g. PACKAGE in create has no separate handler def here)
          continue;
        }
        const handlerRequired = requiredOf(handlerDef).filter(
          (r: string) => r !== 'object_type',
        );
        // Zod-based handlers have no JSON-schema required[]; skip them.
        if (handlerRequired.length === 0) continue;
        for (const arg of advertised) {
          it(`${op} ${type}(${arg}*) is a required arg of the routed handler`, () => {
            expect(handlerRequired).toContain(arg);
          });
        }
      }
    }
  });
}
