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

import { TOOL_DEFINITION as C_BEHAVIOR_DEFINITION } from '../../handlers/behavior_definition/high/handleCreateBehaviorDefinition';
import { TOOL_DEFINITION as D_BEHAVIOR_DEFINITION } from '../../handlers/behavior_definition/high/handleDeleteBehaviorDefinition';
import { TOOL_DEFINITION as U_BEHAVIOR_DEFINITION } from '../../handlers/behavior_definition/high/handleUpdateBehaviorDefinition';
import { TOOL_DEFINITION as C_BEHAVIOR_IMPLEMENTATION } from '../../handlers/behavior_implementation/high/handleCreateBehaviorImplementation';
import { TOOL_DEFINITION as D_BEHAVIOR_IMPLEMENTATION } from '../../handlers/behavior_implementation/high/handleDeleteBehaviorImplementation';
import { TOOL_DEFINITION as U_BEHAVIOR_IMPLEMENTATION } from '../../handlers/behavior_implementation/high/handleUpdateBehaviorImplementation';
import { TOOL_DEFINITION as C_CLASS } from '../../handlers/class/high/handleCreateClass';
import { TOOL_DEFINITION as D_CLASS } from '../../handlers/class/high/handleDeleteClass';
import { TOOL_DEFINITION as D_LOCAL_DEFINITIONS } from '../../handlers/class/high/handleDeleteLocalDefinitions';
import { TOOL_DEFINITION as D_LOCAL_MACROS } from '../../handlers/class/high/handleDeleteLocalMacros';
import { TOOL_DEFINITION as D_LOCAL_TEST_CLASS } from '../../handlers/class/high/handleDeleteLocalTestClass';
import { TOOL_DEFINITION as D_LOCAL_TYPES } from '../../handlers/class/high/handleDeleteLocalTypes';
import { TOOL_DEFINITION as U_CLASS } from '../../handlers/class/high/handleUpdateClass';
import { TOOL_DEFINITION as U_LOCAL_DEFINITIONS } from '../../handlers/class/high/handleUpdateLocalDefinitions';
import { TOOL_DEFINITION as U_LOCAL_MACROS } from '../../handlers/class/high/handleUpdateLocalMacros';
import { TOOL_DEFINITION as U_LOCAL_TEST_CLASS } from '../../handlers/class/high/handleUpdateLocalTestClass';
import { TOOL_DEFINITION as U_LOCAL_TYPES } from '../../handlers/class/high/handleUpdateLocalTypes';
import {
  compactCreateSchema,
  compactDeleteSchema,
  compactUpdateSchema,
} from '../../handlers/compact/high/compactSchemas';
import { TOOL_DEFINITION as C_DATA_ELEMENT } from '../../handlers/data_element/high/handleCreateDataElement';
import { TOOL_DEFINITION as D_DATA_ELEMENT } from '../../handlers/data_element/high/handleDeleteDataElement';
import { TOOL_DEFINITION as U_DATA_ELEMENT } from '../../handlers/data_element/high/handleUpdateDataElement';
import { TOOL_DEFINITION as C_DDL } from '../../handlers/ddl/high/handleCreateDdl';
import { TOOL_DEFINITION as D_DDL } from '../../handlers/ddl/high/handleDeleteDdl';
import { TOOL_DEFINITION as U_DDL } from '../../handlers/ddl/high/handleUpdateDdl';
import { TOOL_DEFINITION as C_METADATA_EXTENSION } from '../../handlers/ddlx/high/handleCreateMetadataExtension';
import { TOOL_DEFINITION as U_METADATA_EXTENSION } from '../../handlers/ddlx/high/handleUpdateMetadataExtension';
import { TOOL_DEFINITION as C_DOMAIN } from '../../handlers/domain/high/handleCreateDomain';
// --- delete (mirror compactRouterMap delete entries) ---
import { TOOL_DEFINITION as D_DOMAIN } from '../../handlers/domain/high/handleDeleteDomain';
// --- update (mirror compactRouterMap update entries) ---
import { TOOL_DEFINITION as U_DOMAIN } from '../../handlers/domain/high/handleUpdateDomain';
import { TOOL_DEFINITION as C_FUNCTION_GROUP } from '../../handlers/function/high/handleCreateFunctionGroup';
import { TOOL_DEFINITION as C_FUNCTION_MODULE } from '../../handlers/function/high/handleCreateFunctionModule';
import { TOOL_DEFINITION as U_FUNCTION_GROUP } from '../../handlers/function/high/handleUpdateFunctionGroup';
import { TOOL_DEFINITION as U_FUNCTION_MODULE } from '../../handlers/function/high/handleUpdateFunctionModule';
import { TOOL_DEFINITION as D_FUNCTION_GROUP } from '../../handlers/function_group/high/handleDeleteFunctionGroup';
import { TOOL_DEFINITION as D_FUNCTION_MODULE } from '../../handlers/function_module/high/handleDeleteFunctionModule';
import { TOOL_DEFINITION as C_INTERFACE } from '../../handlers/interface/high/handleCreateInterface';
import { TOOL_DEFINITION as D_INTERFACE } from '../../handlers/interface/high/handleDeleteInterface';
import { TOOL_DEFINITION as U_INTERFACE } from '../../handlers/interface/high/handleUpdateInterface';
import { TOOL_DEFINITION as D_METADATA_EXTENSION } from '../../handlers/metadata_extension/high/handleDeleteMetadataExtension';
// --- create (mirror compactRouterMap create entries) ---
import { TOOL_DEFINITION as C_PACKAGE } from '../../handlers/package/high/handleCreatePackage';
import { TOOL_DEFINITION as C_PROGRAM } from '../../handlers/program/high/handleCreateProgram';
import { TOOL_DEFINITION as D_PROGRAM } from '../../handlers/program/high/handleDeleteProgram';
import { TOOL_DEFINITION as U_PROGRAM } from '../../handlers/program/high/handleUpdateProgram';
import { TOOL_DEFINITION as C_SERVICE_BINDING } from '../../handlers/service_binding/high/handleCreateServiceBinding';
import { TOOL_DEFINITION as D_SERVICE_BINDING } from '../../handlers/service_binding/high/handleDeleteServiceBinding';
import { TOOL_DEFINITION as U_SERVICE_BINDING } from '../../handlers/service_binding/high/handleUpdateServiceBinding';
import { TOOL_DEFINITION as C_SERVICE_DEFINITION } from '../../handlers/service_definition/high/handleCreateServiceDefinition';
import { TOOL_DEFINITION as D_SERVICE_DEFINITION } from '../../handlers/service_definition/high/handleDeleteServiceDefinition';
import { TOOL_DEFINITION as U_SERVICE_DEFINITION } from '../../handlers/service_definition/high/handleUpdateServiceDefinition';
import { TOOL_DEFINITION as C_STRUCTURE } from '../../handlers/structure/high/handleCreateStructure';
import { TOOL_DEFINITION as D_STRUCTURE } from '../../handlers/structure/high/handleDeleteStructure';
import { TOOL_DEFINITION as U_STRUCTURE } from '../../handlers/structure/high/handleUpdateStructure';
import { TOOL_DEFINITION as C_TABLE } from '../../handlers/table/high/handleCreateTable';
import { TOOL_DEFINITION as D_TABLE } from '../../handlers/table/high/handleDeleteTable';
import { TOOL_DEFINITION as U_TABLE } from '../../handlers/table/high/handleUpdateTable';
import { TOOL_DEFINITION as C_TRANSPORT } from '../../handlers/transport/high/handleCreateTransport';
import { TOOL_DEFINITION as C_CDS_UNIT_TEST } from '../../handlers/unit_test/high/handleCreateCdsUnitTest';
import { TOOL_DEFINITION as C_UNIT_TEST } from '../../handlers/unit_test/high/handleCreateUnitTest';
import { TOOL_DEFINITION as D_CDS_UNIT_TEST } from '../../handlers/unit_test/high/handleDeleteCdsUnitTest';
import { TOOL_DEFINITION as D_UNIT_TEST } from '../../handlers/unit_test/high/handleDeleteUnitTest';
import { TOOL_DEFINITION as U_CDS_UNIT_TEST } from '../../handlers/unit_test/high/handleUpdateCdsUnitTest';
import { TOOL_DEFINITION as U_UNIT_TEST } from '../../handlers/unit_test/high/handleUpdateUnitTest';

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

const ROUTED: Record<
  'create' | 'update' | 'delete',
  Record<string, ToolDef>
> = {
  create: {
    PACKAGE: C_PACKAGE,
    DOMAIN: C_DOMAIN,
    DATA_ELEMENT: C_DATA_ELEMENT,
    TRANSPORT: C_TRANSPORT,
    TABLE: C_TABLE,
    STRUCTURE: C_STRUCTURE,
    DDL: C_DDL,
    SERVICE_DEFINITION: C_SERVICE_DEFINITION,
    SERVICE_BINDING: C_SERVICE_BINDING,
    CLASS: C_CLASS,
    UNIT_TEST: C_UNIT_TEST,
    CDS_UNIT_TEST: C_CDS_UNIT_TEST,
    PROGRAM: C_PROGRAM,
    INTERFACE: C_INTERFACE,
    FUNCTION_GROUP: C_FUNCTION_GROUP,
    FUNCTION_MODULE: C_FUNCTION_MODULE,
    BEHAVIOR_DEFINITION: C_BEHAVIOR_DEFINITION,
    BEHAVIOR_IMPLEMENTATION: C_BEHAVIOR_IMPLEMENTATION,
    METADATA_EXTENSION: C_METADATA_EXTENSION,
  },
  update: {
    DOMAIN: U_DOMAIN,
    DATA_ELEMENT: U_DATA_ELEMENT,
    TABLE: U_TABLE,
    STRUCTURE: U_STRUCTURE,
    DDL: U_DDL,
    SERVICE_DEFINITION: U_SERVICE_DEFINITION,
    SERVICE_BINDING: U_SERVICE_BINDING,
    CLASS: U_CLASS,
    UNIT_TEST: U_UNIT_TEST,
    CDS_UNIT_TEST: U_CDS_UNIT_TEST,
    LOCAL_TEST_CLASS: U_LOCAL_TEST_CLASS,
    LOCAL_TYPES: U_LOCAL_TYPES,
    LOCAL_DEFINITIONS: U_LOCAL_DEFINITIONS,
    LOCAL_MACROS: U_LOCAL_MACROS,
    PROGRAM: U_PROGRAM,
    INTERFACE: U_INTERFACE,
    FUNCTION_GROUP: U_FUNCTION_GROUP,
    FUNCTION_MODULE: U_FUNCTION_MODULE,
    BEHAVIOR_DEFINITION: U_BEHAVIOR_DEFINITION,
    BEHAVIOR_IMPLEMENTATION: U_BEHAVIOR_IMPLEMENTATION,
    METADATA_EXTENSION: U_METADATA_EXTENSION,
  },
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

for (const op of ['create', 'update', 'delete'] as const) {
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
