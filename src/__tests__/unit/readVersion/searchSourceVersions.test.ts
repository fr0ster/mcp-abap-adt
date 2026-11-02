/**
 * `SearchSource` reads each object's source at a stated version: a program's
 * and a class's main source at the call's `version` (each of the three ADT
 * takes), a function group's includes and modules active. Real adt-clients
 * code over the counting connection; the address each read sends is asserted.
 */

import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { ReadVersion } from '../../../lib/handlers/readVersion';
import { createSourceReaderDeps } from '../../../lib/search-source/sourceReader';
import { countingConnection } from '../../helpers/batchHarness';
import { silentLogger } from '../../helpers/lowToCompact';

// The process declares its system type, as every launcher requires.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const VERSIONS: ReadonlyArray<ReadVersion> = [
  'active',
  'inactive',
  'workingArea',
];

/** The source reads over a counting connection, and what they sent. */
function reader() {
  const counting = countingConnection('document', 'REPORT z.');
  const context: HandlerContext = {
    connection: counting.connection,
    logger: silentLogger,
  };
  return { deps: createSourceReaderDeps(context), sent: counting.sent };
}

describe('SearchSource: every source read states its version', () => {
  it.each(VERSIONS)(
    'a program and a class main source are read at the version given (%s)',
    async (version) => {
      const { deps, sent } = reader();
      await deps.readProgram('ZPROG', version);
      await deps.readClassMain('ZCL_X', version);
      expect(sent).toEqual([
        `GET /sap/bc/adt/programs/programs/zprog/source/main?version=${version}`,
        `GET /sap/bc/adt/oo/classes/zcl_x/source/main?version=${version}`,
      ]);
    },
  );

  it("a function group's include and module are read active", async () => {
    const { deps, sent } = reader();
    await deps.readInclude('LZFGU01');
    await deps.readFugrFm('ZFG', 'Z_FM');
    expect(sent).toEqual([
      'GET /sap/bc/adt/programs/includes/lzfgu01/source/main?version=active',
      'GET /sap/bc/adt/functions/groups/zfg/fmodules/z_fm/source/main?version=active',
    ]);
  });
});
