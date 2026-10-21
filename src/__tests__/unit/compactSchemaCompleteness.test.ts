/**
 * Runtime guard (issue #123): every argument the compact create, update and
 * delete descriptions advertise as `TYPE(arg*)` is a property of the matching
 * compact schema — a description never names an argument the SDK would strip.
 */

import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import {
  compactCreateSchema,
  compactDeleteSchema,
  compactUpdateSchema,
} from '../../lib/compact/compactSchemas';

/**
 * The create, update and delete routes are compact's own one-request handlers
 * (`handleCreateOnly`, `handleUpdateUnderLock`, `handleDeleteOnly`), not the
 * full `Create<Type>` / `Update<Type>` / `Delete<Type>`, so their required
 * arguments are not those tools' — `createSingleCall.test.ts`,
 * `updateSingleCall.test.ts` and `deleteSingleCall.test.ts`
 * (`compact-modify/src/__tests__/`) pin what their schemas and descriptions
 * name. What stays here: every argument a description advertises is in the
 * schema.
 */
const SCHEMA = {
  create: compactCreateSchema,
  update: compactUpdateSchema,
  delete: compactDeleteSchema,
} as const;

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
