import {
  compactCreateSchema,
  compactDeleteSchema,
  compactUpdateSchema,
} from '../../lib/compact/compactSchemas';
import { listedJson } from '../helpers/listedJson';

/**
 * Guard: the compact facade routes object_type 'DDL' create/update/delete into
 * the high-level DDL handlers, which require ddl_name (and ddl_source for update).
 * These schemas must expose those args, otherwise schema-driven MCP clients
 * cannot call compact DDL CRUD. (See issue #123 for the broader multi-type audit.)
 */
describe('compact DDL CRUD schemas expose routed handler args', () => {
  it('create schema exposes ddl_name', () => {
    expect(listedJson(compactCreateSchema).properties).toHaveProperty(
      'ddl_name',
    );
  });

  it('update schema exposes ddl_name and ddl_source', () => {
    expect(listedJson(compactUpdateSchema).properties).toHaveProperty(
      'ddl_name',
    );
    expect(listedJson(compactUpdateSchema).properties).toHaveProperty(
      'ddl_source',
    );
  });

  it('delete schema exposes ddl_name', () => {
    expect(listedJson(compactDeleteSchema).properties).toHaveProperty(
      'ddl_name',
    );
  });
});
