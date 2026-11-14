/**
 * `SearchSource` reads every source at the call's `version` (each of the
 * three ADT takes), through its reader — the function group's includes and
 * modules included. Real adt-clients code over the counting connection; the
 * address each read sends is asserted, and it is the source's identity
 * (`sourceUriOf`) with the version.
 */

import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { ReadVersion } from '../../../lib/handlers/readVersion';
import {
  createSourceReaderDeps,
  type SourceRead,
  sourceUriOf,
} from '../../../lib/search-source/sourceReader';
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

/** One read of every reader, at `version`. */
const everyReader = (version: ReadVersion): SourceRead[] => [
  { reader: 'program', name: 'ZPROG', version },
  { reader: 'include', name: 'ZINCL', version },
  { reader: 'class', name: 'ZCL_X', version },
  { reader: 'classInclude', name: 'ZCL_X', include: 'definitions', version },
  {
    reader: 'classInclude',
    name: 'ZCL_X',
    include: 'implementations',
    version,
  },
  { reader: 'classInclude', name: 'ZCL_X', include: 'macros', version },
  { reader: 'classInclude', name: 'ZCL_X', include: 'testclasses', version },
  { reader: 'interface', name: 'ZIF_X', version },
  { reader: 'ddl', name: 'ZDDL', version },
  { reader: 'behaviorDefinition', name: 'ZBDEF', version },
  { reader: 'metadataExtension', name: 'ZDDLX', version },
  { reader: 'serviceDefinition', name: 'ZSRVD', version },
  { reader: 'functionModule', group: 'ZFG', name: 'Z_FM', version },
  { reader: 'functionInclude', group: 'ZFG', name: 'LZFGU01', version },
];

describe('SearchSource: every source read states its version', () => {
  it.each(VERSIONS)(
    'every reader sends its source URI at the version given (%s)',
    async (version) => {
      const { deps, sent } = reader();
      const reads = everyReader(version);
      for (const read of reads) await deps.readSource(read);
      expect(sent).toEqual(
        reads.map((read) => `GET ${sourceUriOf(read)}?version=${version}`),
      );
    },
  );

  it('the source URIs, written out', () => {
    expect(everyReader('inactive').map(sourceUriOf)).toEqual([
      '/sap/bc/adt/programs/programs/zprog/source/main',
      '/sap/bc/adt/programs/includes/zincl/source/main',
      '/sap/bc/adt/oo/classes/zcl_x/source/main',
      '/sap/bc/adt/oo/classes/zcl_x/includes/definitions',
      '/sap/bc/adt/oo/classes/zcl_x/includes/implementations',
      '/sap/bc/adt/oo/classes/zcl_x/includes/macros',
      '/sap/bc/adt/oo/classes/zcl_x/includes/testclasses',
      '/sap/bc/adt/oo/interfaces/zif_x/source/main',
      '/sap/bc/adt/ddic/ddl/sources/zddl/source/main',
      '/sap/bc/adt/bo/behaviordefinitions/zbdef/source/main',
      '/sap/bc/adt/ddic/ddlx/sources/zddlx/source/main',
      '/sap/bc/adt/ddic/srvd/sources/zsrvd/source/main',
      '/sap/bc/adt/functions/groups/zfg/fmodules/z_fm/source/main',
      '/sap/bc/adt/functions/groups/zfg/includes/lzfgu01/source/main',
    ]);
  });
});
