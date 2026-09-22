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
   * The failure the refusal exists to prevent — and note it does not throw.
   * A group named after the module is a request SAP answers, about an object
   * nobody meant.
   */
  it('names a group after the module when nothing says otherwise', () => {
    expect(buildObjectUri('Z_AC_FM01', 'FUGR/FF')).toBe(
      '/sap/bc/adt/functions/groups/z_ac_fm01/fmodules/z_ac_fm01',
    );
  });

  /** The recommendation this file replaced, kept so it cannot come back. */
  it('does not split a GROUP|MODULE name — that convention is another builder’s', () => {
    expect(buildObjectUri('ZAC_FGR01|Z_AC_FM01', 'FUGR/FF')).toBe(
      '/sap/bc/adt/functions/groups/zac_fgr01%7cz_ac_fm01/fmodules/zac_fgr01%7cz_ac_fm01',
    );
  });

  /** An object addressable from its name is unaffected by any of this. */
  it('needs no parent for a class', () => {
    expect(buildObjectUri('ZCL_X', 'CLAS/OC')).toBe(
      '/sap/bc/adt/oo/classes/zcl_x',
    );
  });
});
