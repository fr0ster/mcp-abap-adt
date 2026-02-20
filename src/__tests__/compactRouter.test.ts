import { COMPACT_OBJECT_TYPES } from '../handlers/compact/high/compactObjectTypes';
import {
  compactActionRouterMap,
  compactRouterMap,
} from '../handlers/compact/high/compactRouter';

describe('Compact Router Coverage', () => {
  const expectedCrudMatrix: Record<string, string[]> = {
    PACKAGE: ['create', 'get'],
    DOMAIN: ['create', 'get', 'update', 'delete'],
    DATA_ELEMENT: ['create', 'get', 'update', 'delete'],
    TRANSPORT: ['create'],
    TABLE: ['create', 'get', 'update', 'delete'],
    STRUCTURE: ['create', 'get', 'update', 'delete'],
    VIEW: ['create', 'get', 'update', 'delete'],
    SERVICE_DEFINITION: ['create', 'get', 'update', 'delete'],
    SERVICE_BINDING: ['create', 'get', 'update', 'delete'],
    CLASS: ['create', 'get', 'update', 'delete'],
    UNIT_TEST: ['create', 'get', 'update', 'delete'],
    CDS_UNIT_TEST: ['create', 'get', 'update', 'delete'],
    LOCAL_TEST_CLASS: ['create', 'get', 'update', 'delete'],
    LOCAL_TYPES: ['create', 'get', 'update', 'delete'],
    LOCAL_DEFINITIONS: ['create', 'get', 'update', 'delete'],
    LOCAL_MACROS: ['create', 'get', 'update', 'delete'],
    PROGRAM: ['create', 'get', 'update', 'delete'],
    INTERFACE: ['create', 'get', 'update', 'delete'],
    FUNCTION_GROUP: ['create', 'get', 'update', 'delete'],
    FUNCTION_MODULE: ['create', 'get', 'update', 'delete'],
    BEHAVIOR_DEFINITION: ['create', 'get', 'update', 'delete'],
    BEHAVIOR_IMPLEMENTATION: ['create', 'get', 'update', 'delete'],
    METADATA_EXTENSION: ['create', 'get', 'update', 'delete'],
  };

  const expectedActionMatrix: Record<string, string[]> = {
    PACKAGE: [],
    DOMAIN: [],
    DATA_ELEMENT: [],
    TRANSPORT: ['create_transport'],
    TABLE: [],
    STRUCTURE: [],
    VIEW: [],
    SERVICE_DEFINITION: [],
    SERVICE_BINDING: ['list_types', 'validate'],
    CLASS: [],
    UNIT_TEST: ['run', 'status', 'result'],
    CDS_UNIT_TEST: ['status', 'result'],
    LOCAL_TEST_CLASS: [],
    LOCAL_TYPES: [],
    LOCAL_DEFINITIONS: [],
    LOCAL_MACROS: [],
    PROGRAM: [],
    INTERFACE: [],
    FUNCTION_GROUP: [],
    FUNCTION_MODULE: [],
    BEHAVIOR_DEFINITION: [],
    BEHAVIOR_IMPLEMENTATION: [],
    METADATA_EXTENSION: [],
  };

  it('should have a router entry for every compact object type', () => {
    for (const objectType of COMPACT_OBJECT_TYPES) {
      expect(compactRouterMap[objectType]).toBeDefined();
      expect(compactActionRouterMap[objectType]).toBeDefined();
    }
  });

  it('should expose expected CRUD routes per object type', () => {
    for (const objectType of COMPACT_OBJECT_TYPES) {
      const operations = Object.keys(compactRouterMap[objectType] || {});
      expect(operations.sort()).toEqual(
        (expectedCrudMatrix[objectType] || []).sort(),
      );
    }
  });

  it('should expose expected action routes per object type', () => {
    for (const objectType of COMPACT_OBJECT_TYPES) {
      const actions = Object.keys(compactActionRouterMap[objectType] || {});
      expect(actions.sort()).toEqual(
        (expectedActionMatrix[objectType] || []).sort(),
      );
    }
  });
});
