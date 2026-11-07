/**
 * The readings whose regular expressions became plain code (D6): each site
 * with the inputs a pattern mishandled — a CR-only line end, a lower-case
 * keyword, a namespaced name `/NS/NAME`, an empty segment, a glob with `.` —
 * and the plain-code result.
 */
import { includeStatementsOf } from '../../handlers/include/readonly/handleGetIncludesList';
import {
  extendsBase,
  parseEmbeddedStructures,
} from '../../handlers/structure/readonly/handleGetStructuresList';
import {
  dumpIdFrom,
  dumpSummaryOf,
} from '../../handlers/system/readonly/handleRuntimeGetDumpById';
import {
  dumpIdOf,
  dumpQueryOf,
} from '../../handlers/system/readonly/handleRuntimeListFeeds';
import {
  functionGroupMainProgram,
  functionGroupTestInclude,
  pullsInclude,
} from '../../handlers/unit_test/shared/writeTests';
import { isRedactedHeader } from '../../lib/connectionFactory';
import { isMutatingToolName } from '../../lib/criticalSection';
import { locationId, readAmdpPreview } from '../../lib/debugger/amdpReadings';
import { addressOf } from '../../lib/debugger/objectUri';
import { runtimeDirectory } from '../../lib/leftoverSessions/runtimeDirectory';
import { scanLines } from '../../lib/search-source/lineScanner';
import { parseStateIdleMinutes } from '../../lib/state/idleBound';
import { includeNameOf } from '../../lib/strategies/abapIncludeStatement';
import { isRefusal } from '../../lib/strategies/activationRun';
import {
  browserHostOf,
  encodeFeapSegment,
} from '../../lib/strategies/feapDescriptor';
import {
  nextToOf,
  secondBefore,
  toBoundOf,
} from '../../lib/strategies/feedPages';
import { parseStructure } from '../../lib/strategies/reading';
import {
  associationsOf,
  exposedEntitiesOf,
} from '../../lib/strategies/serviceBindingFacts';

describe('the INCLUDE statements of ABAP source', () => {
  it('ends a line at a lone CR', () => {
    expect(includeStatementsOf('INCLUDE zinc_a.\rINCLUDE zinc_b.')).toEqual([
      'ZINC_A',
      'ZINC_B',
    ]);
  });
  it('reads a lower-case keyword and IF FOUND', () => {
    expect(includeStatementsOf('  include zinc_a if found.')).toEqual([
      'ZINC_A',
    ]);
  });
  it('reads a namespaced name', () => {
    expect(includeStatementsOf('INCLUDE /NS/INC01.')).toEqual(['/NS/INC01']);
  });
  it('skips comments, STRUCTURE / TYPE and a statement with no period', () => {
    expect(
      includeStatementsOf(
        [
          '* INCLUDE zc_full_line.',
          'INCLUDE zinc_a. " INCLUDE zc_trailing.',
          'INCLUDE zinc_b',
          'INCLUDE STRUCTURE.',
          'INCLUDE zinc_a.',
        ].join('\n'),
      ),
    ).toEqual(['ZINC_A']);
  });
  it('reads one line: the keyword, then blanks, then the name', () => {
    expect(includeNameOf('INCLUDEzinc.')).toBeUndefined();
    expect(includeNameOf('INCLUDE zinc IFFOUND.')).toBeUndefined();
    expect(includeNameOf('INCLUDE zinc IF FOUND .')).toBe('ZINC');
  });
});

describe('whether a report pulls its test include in', () => {
  it('finds the statement after a lone CR, in lower case, namespaced', () => {
    expect(
      pullsInclude('REPORT /ns/zr.\r  include /ns/zr_t99 .', '/NS/ZR_T99'),
    ).toBe(true);
  });
  it('does not take another include or a commented one', () => {
    expect(pullsInclude('INCLUDE zr_t990.', 'ZR_T99')).toBe(false);
    expect(pullsInclude('* INCLUDE zr_t99.', 'ZR_T99')).toBe(false);
  });
});

describe('a report pulls its test include in, statement by statement', () => {
  it('reads an INCLUDE statement over several lines', () => {
    expect(pullsInclude('REPORT zr.\nINCLUDE\n  ztest.', 'ZTEST')).toBe(true);
    expect(pullsInclude('REPORT zr.\nINCLUDE ztest\n.', 'ZTEST')).toBe(true);
    expect(
      pullsInclude('REPORT zr.\r\ninclude\r\n ztest\r\n if found .', 'ZTEST'),
    ).toBe(true);
  });
  it('reads two statements on one line, after a comment line', () => {
    expect(
      pullsInclude('* INCLUDE zx.\nINCLUDE zother. INCLUDE ztest.', 'ZTEST'),
    ).toBe(true);
  });
  it('does not read a string literal or a comment as a statement', () => {
    expect(pullsInclude("WRITE 'x. INCLUDE ztest.'.", 'ZTEST')).toBe(false);
    expect(pullsInclude('WRITE `x. INCLUDE ztest.`.', 'ZTEST')).toBe(false);
    expect(pullsInclude('WRITE |x. INCLUDE ztest.|.', 'ZTEST')).toBe(false);
    expect(pullsInclude('WRITE 1. " INCLUDE ztest.', 'ZTEST')).toBe(false);
    expect(pullsInclude('* INCLUDE ztest.', 'ZTEST')).toBe(false);
  });
  it('reads no Unicode case mapping as a keyword', () => {
    expect(pullsInclude('\u0131nclude ztest.', 'ZTEST')).toBe(false);
    expect(includeNameOf('\u0131nclude zfoo.')).toBeUndefined();
  });
});

describe('a function group name with an empty namespace segment', () => {
  it('is not read as namespaced', () => {
    expect(functionGroupTestInclude('//x')).toBe('L//XT99');
    expect(functionGroupMainProgram('/ns/')).toBe('SAPL/NS/');
    expect(functionGroupMainProgram('/ns/g')).toBe('/NS/SAPLG');
  });
});

describe('the embedded structures of a DDL source', () => {
  it('ends a line at a lone CR', () => {
    expect(
      parseEmbeddedStructures('include zs_a;\rinclude zs_b;').map(
        (ref) => ref.name,
      ),
    ).toEqual(['ZS_A', 'ZS_B']);
  });
  it('reads every form in any case, namespaced names included', () => {
    expect(
      parseEmbeddedStructures(
        [
          '.INCLUDE /NS/CLASSIC',
          '  Addr : INCLUDE /ns/addr;',
          'INCLUDE zs_plain; // a trailing comment',
          '// include zs_commented;',
          '@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE',
          'fld : abap.char(1);',
        ].join('\n'),
      ),
    ).toEqual([
      { name: '/NS/CLASSIC', attribute: null, kind: 'include' },
      { name: '/NS/ADDR', attribute: 'addr', kind: 'include' },
      { name: 'ZS_PLAIN', attribute: null, kind: 'include' },
    ]);
  });
  it('states an append by `extend type <base> with`, in any case, across lines', () => {
    expect(
      extendsBase('EXTEND TYPE /NS/BASE\r\n  WITH zappend {', '/NS/BASE'),
    ).toBe(true);
    expect(extendsBase('extend type zbasex with zappend', 'ZBASE')).toBe(false);
    expect(extendsBase('extend typezbase with', 'ZBASE')).toBe(false);
  });
});

describe('the CDS expose and association lines', () => {
  it('reads expose lines in any case, after a lone CR, namespaced', () => {
    expect(
      exposedEntitiesOf(
        'define service X {\r  EXPOSE /NS/I_Root AS Roots;\r  expose ZI_Child;\r  expose ZI_Broken as ;\r}',
      ),
    ).toEqual([
      { entity: '/NS/I_Root', entitySet: 'Roots' },
      { entity: 'ZI_Child', entitySet: 'ZI_Child' },
    ]);
  });
  it('reads associations, compositions and redirections in any case', () => {
    expect(
      associationsOf(
        [
          'ASSOCIATION [0..1] TO /NS/I_X AS _X',
          'composition of parent ZI_P as _Parent',
          'association to parent as _Named',
          '_child : REDIRECTED TO composition child ZC_C',
        ].join('\r'),
      ),
    ).toEqual(['_X', '_Parent', '_Named', '_child']);
  });
});

describe('header redaction in the wire log', () => {
  it('redacts by whole name and by word, in any case', () => {
    expect(isRedactedHeader('Set-Cookie')).toBe(true);
    expect(isRedactedHeader('X-CSRF-Token')).toBe(true);
    expect(isRedactedHeader('X-Api-Key')).toBe(true);
    expect(isRedactedHeader('cookie2')).toBe(false);
    expect(isRedactedHeader('Content-Type')).toBe(false);
    // The Kelvin sign is no `k`.
    expect(isRedactedHeader('X-Api\u212Aey')).toBe(false);
  });
});

describe('tool names that write', () => {
  it('starts with a writing verb, as spelled', () => {
    expect(isMutatingToolName('CreateClass')).toBe(true);
    expect(isMutatingToolName('RemoveObject')).toBe(true);
    expect(isMutatingToolName('createClass')).toBe(false);
    expect(isMutatingToolName('GetClass')).toBe(false);
  });
});

describe('dump ids and summaries', () => {
  it('takes what follows the last runtime/dumps/', () => {
    expect(
      dumpIdFrom(' /sap/bc/adt/vit/runtime/dumps/a/runtime/dumps/ID1 '),
    ).toBe('ID1');
    expect(dumpIdOf('ID2')).toBe('ID2');
  });
  it('drops the system of an adt:// termination link and reads its line', () => {
    const summary = dumpSummaryOf(
      '<dump:dump xmlns:dump="d" dump:error="E"><dump:links><dump:link dump:relation="http://www.sap.com/adt/relations/runtime/dump/termination" dump:uri="adt://SYS/sap/bc/adt/x/source/main#xstart=;start=12,3"/></dump:links></dump:dump>',
    );
    expect(summary?.termination).toEqual({
      uri: '/sap/bc/adt/x/source/main',
      line: 12,
    });
  });
  it('refuses an operand holding a blank of any kind', () => {
    expect(() => dumpQueryOf({ user: 'A\u00a0B' })).toThrow('user');
    expect(dumpQueryOf({ user: 'AB' })).toBe('and ( equals ( user , AB ) )');
  });
});

describe('debugger addresses', () => {
  it("takes Location's last segment before a query", () => {
    expect(locationId({ headers: { location: '/a/b/ID9/?x=/y' } })).toBe('ID9');
    expect(locationId({ headers: { location: '/a/b//' } })).toBe('');
    expect(locationId({ headers: { location: 'ID8?q' } })).toBe('ID8');
  });
  it('reads object URIs, refusing an empty segment', () => {
    expect(
      addressOf('/sap/bc/adt/oo/classes/zcl/includes/testclasses#start=5'),
    ).toEqual({
      object_type: 'CLAS',
      object_name: 'ZCL',
      include: 'testclasses',
      line: 5,
    });
    expect(addressOf('/sap/bc/adt/oo/classes//source/main')).toBeUndefined();
    expect(
      addressOf(
        '/sap/bc/adt/functions/groups/%2fns%2fg/fmodules/f/source/main#x=1;start=7',
      ),
    ).toEqual({
      object_type: 'FUNC',
      object_name: 'F',
      parent_name: '/NS/G',
      line: 7,
    });
    expect(
      addressOf('/sap/bc/adt/programs/includes/zi/source/main#xstart=3'),
    ).toEqual({
      object_type: 'INCL',
      object_name: 'ZI',
    });
  });
  it('decodes character references in an AMDP data preview', () => {
    const preview = readAmdpPreview(
      '<tableData><columns><metadata><name>N</name></metadata><dataSet><data>O&#39;B</data></dataSet></columns></tableData>',
    );
    expect(preview.rows).toEqual([{ N: "O'B" }]);
  });
});

describe('the runtime directory from AUTH_BROKER_PATH', () => {
  it('splits on ":" and ";" outside Windows, on ";" alone on it', () => {
    expect(
      runtimeDirectory(
        undefined,
        { AUTH_BROKER_PATH: ' ;/a:/b' },
        'linux',
        '/h',
      ),
    ).toBe('/a/runtime');
  });
  it("builds the path of the platform named, not the host's", () => {
    expect(
      runtimeDirectory(
        undefined,
        { AUTH_BROKER_PATH: 'C:\\a;D:\\b' },
        'win32',
        'C:\\h',
      ),
    ).toBe('C:\\a\\runtime');
  });
});

describe('source search', () => {
  it('reads a comment line after leading blanks of any kind', () => {
    expect(
      scanLines(['\u00a0 " find me', 'find me'], {
        query: 'find',
        exclude_comments: true,
        max_hits: 10,
      }).hits.map((hit) => hit.line),
    ).toEqual([2]);
  });
});

describe('the state idle bound', () => {
  it('takes a decimal written out, nothing else', () => {
    expect(parseStateIdleMinutes(' 45 ', 'x')).toBe(45);
    expect(parseStateIdleMinutes('60.0', 'x')).toBe(60);
    expect(() => parseStateIdleMinutes('3e2', 'x')).toThrow('x');
    expect(() => parseStateIdleMinutes('60.', 'x')).toThrow('x');
    expect(() => parseStateIdleMinutes('١٢٠', 'x')).toThrow('x');
  });
});

describe("activation messages by SAP's letters", () => {
  it('reads E, A, X and error in any case', () => {
    for (const type of ['E', 'a', 'X', 'Error']) {
      expect(isRefusal({ type, text: '' })).toBe(true);
    }
    for (const type of ['W', 'I', 'EE', '']) {
      expect(isRefusal({ type, text: '' })).toBe(false);
    }
  });
});

describe('the preview URL', () => {
  it('moves a BTP ABAP host to abap-web, any case in its scheme', () => {
    expect(browserHostOf('HTTPS://t1.abap.eu10.hana.ondemand.com:443')).toBe(
      'HTTPS://t1.abap-web.eu10.hana.ondemand.com:443',
    );
    expect(browserHostOf('https://t1.abap.x.y.hana.ondemand.com')).toBe(
      'https://t1.abap.x.y.hana.ondemand.com',
    );
    expect(browserHostOf('https://host.example:44300')).toBe(
      'https://host.example:44300',
    );
  });
  it('keeps URL-safe characters after the shift', () => {
    // `K` shifted by 20 is `_`, which stands as itself.
    expect(encodeFeapSegment('K')).toBe('_');
  });
});

describe('feed paging', () => {
  it("reads the next link's to= after ?, & or ;", () => {
    expect(
      nextToOf(
        '<feed><link rel="next" href="/x?auto=1&amp;to=20260101000000&amp;y=2"/></feed>',
      ),
    ).toBe('20260101000000');
  });
  it('takes the form YYYY-MM-DDTHH:MM:SS, digits ASCII only', () => {
    expect(toBoundOf('2026-10-01T12:34:56Z')).toBe('20261001123456');
    expect(toBoundOf('2026-10-01 12:34:56')).toBeUndefined();
    expect(toBoundOf('2026-10-0١T12:34:56')).toBeUndefined();
    expect(secondBefore('20261001000000')).toBe('20260930235959');
  });
});

describe('repeatable elements under a prefix', () => {
  it('reads a prefixed name by its local part', () => {
    expect(parseStructure('<a><m:msg>1</m:msg></a>')).toEqual({
      a: { 'm:msg': ['1'] },
    });
  });
});
