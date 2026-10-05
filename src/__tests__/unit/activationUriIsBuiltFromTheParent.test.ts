import { dirname, join } from 'node:path';

/**
 * What address the activation request actually carries.
 *
 * This test exists because three rounds of review were spent recommending
 * routes that read correctly one layer up and produced the wrong URI one
 * layer down. The argument reaching `handleActivateObject` was asserted, then
 * the argument reaching the client — and the question was only ever
 * answerable here, in the builder `activateObjectsGroup` calls:
 *
 *     const uri = buildObjectUri(obj.name, obj.type, obj.parentName);
 *
 * **There are two functions called `buildObjectUri` in that package**, and
 * they differ. `core/shared/whereUsed.js` splits a `GROUP|MODULE` name on the
 * pipe; `utils/activationUtils.js`, the one activation uses, does not — it
 * percent-encodes the pipe into the group segment and repeats the whole
 * string. Reading the first while the second runs is how a recommendation
 * survived two reviews.
 *
 * So this calls the real one, from the installed package, and asserts the
 * strings. It is deliberately not mocked: a mock here would assert this
 * repository's belief about the dependency, which is the thing that was
 * wrong.
 */
const activationUtils = join(
  dirname(require.resolve('@mcp-abap-adt/adt-clients')),
  'utils/activationUtils.js',
);
const { buildObjectUri } = require(activationUtils) as {
  buildObjectUri: (name: string, type: string, parentName?: string) => string;
};

describe('the URI an activation carries for a function module', () => {
  it('is built from the parent group, which is why parentName is offered', () => {
    expect(buildObjectUri('Z_AC_FM01', 'FUGR/FF', 'ZAC_FGR01')).toBe(
      '/sap/bc/adt/functions/groups/zac_fgr01/fmodules/z_ac_fm01',
    );
  });

  /**
   * The failure the refusal exists to prevent. Up to adt-clients 24 the
   * builder did not throw: it named a group after the module, a request SAP
   * answers about an object nobody meant. From 25.0.0 it throws, before any
   * request.
   */
  it('throws when nothing names the group', () => {
    expect(() => buildObjectUri('Z_AC_FM01', 'FUGR/FF')).toThrow(
      /addressed under its function group; pass the group as parentName/,
    );
  });

  /** The recommendation this file replaced, kept so it cannot come back. */
  it('does not read a GROUP|MODULE name as the group — that convention is another builder’s', () => {
    expect(() => buildObjectUri('ZAC_FGR01|Z_AC_FM01', 'FUGR/FF')).toThrow(
      /pass the group as parentName/,
    );
  });

  /** An object addressable from its name is unaffected by any of this. */
  it('needs no parent for a class', () => {
    expect(buildObjectUri('ZCL_X', 'CLAS/OC')).toBe(
      '/sap/bc/adt/oo/classes/zcl_x',
    );
  });
});
