/**
 * The readings whose regular expressions became plain code (D6): each site
 * with the inputs a pattern mishandled — a CR-only line end, a lower-case
 * keyword, a namespaced name `/NS/NAME`, an empty segment, a glob with `.` —
 * and the plain-code result.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
import {
  parseStateIdleMinutes,
  stateIdleMinutesOf,
} from '../../lib/state/idleBound';
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
import { assertThrows } from '../helpers/assertions';

describe('the INCLUDE statements of ABAP source', () => {
  it('ends a line at a lone CR', () => {
    assert.deepStrictEqual(
      includeStatementsOf('INCLUDE zinc_a.\rINCLUDE zinc_b.'),
      ['ZINC_A', 'ZINC_B'],
    );
  });
  it('reads a lower-case keyword and IF FOUND', () => {
    assert.deepStrictEqual(includeStatementsOf('  include zinc_a if found.'), [
      'ZINC_A',
    ]);
  });
  it('reads a namespaced name', () => {
    assert.deepStrictEqual(includeStatementsOf('INCLUDE /NS/INC01.'), [
      '/NS/INC01',
    ]);
  });
  it('skips comments, STRUCTURE / TYPE and a statement with no period', () => {
    assert.deepStrictEqual(
      includeStatementsOf(
        [
          '* INCLUDE zc_full_line.',
          'INCLUDE zinc_a. " INCLUDE zc_trailing.',
          'INCLUDE zinc_b',
          'INCLUDE STRUCTURE.',
          'INCLUDE zinc_a.',
        ].join('\n'),
      ),
      ['ZINC_A'],
    );
  });
  it('reads one line: the keyword, then blanks, then the name', () => {
    assert.equal(includeNameOf('INCLUDEzinc.'), undefined);
    assert.equal(includeNameOf('INCLUDE zinc IFFOUND.'), undefined);
    assert.equal(includeNameOf('INCLUDE zinc IF FOUND .'), 'ZINC');
  });
});

describe('whether a report pulls its test include in', () => {
  it('finds the statement after a lone CR, in lower case, namespaced', () => {
    assert.equal(
      pullsInclude('REPORT /ns/zr.\r  include /ns/zr_t99 .', '/NS/ZR_T99'),
      true,
    );
  });
  it('does not take another include or a commented one', () => {
    assert.equal(pullsInclude('INCLUDE zr_t990.', 'ZR_T99'), false);
    assert.equal(pullsInclude('* INCLUDE zr_t99.', 'ZR_T99'), false);
  });
});

describe('a report pulls its test include in, statement by statement', () => {
  it('reads an INCLUDE statement over several lines', () => {
    assert.equal(pullsInclude('REPORT zr.\nINCLUDE\n  ztest.', 'ZTEST'), true);
    assert.equal(pullsInclude('REPORT zr.\nINCLUDE ztest\n.', 'ZTEST'), true);
    assert.equal(
      pullsInclude('REPORT zr.\r\ninclude\r\n ztest\r\n if found .', 'ZTEST'),
      true,
    );
  });
  it('reads two statements on one line, after a comment line', () => {
    assert.equal(
      pullsInclude('* INCLUDE zx.\nINCLUDE zother. INCLUDE ztest.', 'ZTEST'),
      true,
    );
  });
  it('does not read a string literal or a comment as a statement', () => {
    assert.equal(pullsInclude("WRITE 'x. INCLUDE ztest.'.", 'ZTEST'), false);
    assert.equal(pullsInclude('WRITE `x. INCLUDE ztest.`.', 'ZTEST'), false);
    assert.equal(pullsInclude('WRITE |x. INCLUDE ztest.|.', 'ZTEST'), false);
    assert.equal(pullsInclude('WRITE 1. " INCLUDE ztest.', 'ZTEST'), false);
    assert.equal(pullsInclude('* INCLUDE ztest.', 'ZTEST'), false);
  });
  it('reads no Unicode case mapping as a keyword', () => {
    assert.equal(pullsInclude('\u0131nclude ztest.', 'ZTEST'), false);
    assert.equal(includeNameOf('\u0131nclude zfoo.'), undefined);
  });
});

describe('a function group name with an empty namespace segment', () => {
  it('is not read as namespaced', () => {
    assert.equal(functionGroupTestInclude('//x'), 'L//XT99');
    assert.equal(functionGroupMainProgram('/ns/'), 'SAPL/NS/');
    assert.equal(functionGroupMainProgram('/ns/g'), '/NS/SAPLG');
  });
});

describe('the embedded structures of a DDL source', () => {
  it('ends a line at a lone CR', () => {
    assert.deepStrictEqual(
      parseEmbeddedStructures('include zs_a;\rinclude zs_b;').map(
        (ref) => ref.name,
      ),
      ['ZS_A', 'ZS_B'],
    );
  });
  it('reads every form in any case, namespaced names included', () => {
    assert.deepStrictEqual(
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
      [
        { name: '/NS/CLASSIC', attribute: null, kind: 'include' },
        { name: '/NS/ADDR', attribute: 'addr', kind: 'include' },
        { name: 'ZS_PLAIN', attribute: null, kind: 'include' },
      ],
    );
  });
  it('states an append by `extend type <base> with`, in any case, across lines', () => {
    assert.equal(
      extendsBase('EXTEND TYPE /NS/BASE\r\n  WITH zappend {', '/NS/BASE'),
      true,
    );
    assert.equal(
      extendsBase('extend type zbasex with zappend', 'ZBASE'),
      false,
    );
    assert.equal(extendsBase('extend typezbase with', 'ZBASE'), false);
  });
});

describe('the CDS expose and association lines', () => {
  it('reads expose lines in any case, after a lone CR, namespaced', () => {
    assert.deepStrictEqual(
      exposedEntitiesOf(
        'define service X {\r  EXPOSE /NS/I_Root AS Roots;\r  expose ZI_Child;\r  expose ZI_Broken as ;\r}',
      ),
      [
        { entity: '/NS/I_Root', entitySet: 'Roots' },
        { entity: 'ZI_Child', entitySet: 'ZI_Child' },
      ],
    );
  });
  it('reads associations, compositions and redirections in any case', () => {
    assert.deepStrictEqual(
      associationsOf(
        [
          'ASSOCIATION [0..1] TO /NS/I_X AS _X',
          'composition of parent ZI_P as _Parent',
          'association to parent as _Named',
          '_child : REDIRECTED TO composition child ZC_C',
        ].join('\r'),
      ),
      ['_X', '_Parent', '_Named', '_child'],
    );
  });
});

describe('header redaction in the wire log', () => {
  it('redacts by whole name and by word, in any case', () => {
    assert.equal(isRedactedHeader('Set-Cookie'), true);
    assert.equal(isRedactedHeader('X-CSRF-Token'), true);
    assert.equal(isRedactedHeader('X-Api-Key'), true);
    assert.equal(isRedactedHeader('cookie2'), false);
    assert.equal(isRedactedHeader('Content-Type'), false);
    // The Kelvin sign is no `k`.
    assert.equal(isRedactedHeader('X-Api\u212Aey'), false);
  });
});

describe('tool names that write', () => {
  it('starts with a writing verb, as spelled', () => {
    assert.equal(isMutatingToolName('CreateClass'), true);
    assert.equal(isMutatingToolName('RemoveObject'), true);
    assert.equal(isMutatingToolName('createClass'), false);
    assert.equal(isMutatingToolName('GetClass'), false);
  });
});

describe('dump ids and summaries', () => {
  it('takes what follows the last runtime/dumps/', () => {
    assert.equal(
      dumpIdFrom(' /sap/bc/adt/vit/runtime/dumps/a/runtime/dumps/ID1 '),
      'ID1',
    );
    assert.equal(dumpIdOf('ID2'), 'ID2');
  });
  it('drops the system of an adt:// termination link and reads its line', () => {
    const summary = dumpSummaryOf(
      '<dump:dump xmlns:dump="d" dump:error="E"><dump:links><dump:link dump:relation="http://www.sap.com/adt/relations/runtime/dump/termination" dump:uri="adt://SYS/sap/bc/adt/x/source/main#xstart=;start=12,3"/></dump:links></dump:dump>',
    );
    assert.deepStrictEqual(summary?.termination, {
      uri: '/sap/bc/adt/x/source/main',
      line: 12,
    });
  });
  it('refuses an operand holding a blank of any kind', () => {
    assertThrows(() => dumpQueryOf({ user: 'A\u00a0B' }), 'user');
    assert.equal(dumpQueryOf({ user: 'AB' }), 'and ( equals ( user , AB ) )');
  });
});

describe('debugger addresses', () => {
  it("takes Location's last segment before a query", () => {
    assert.equal(
      locationId({ headers: { location: '/a/b/ID9/?x=/y' } }),
      'ID9',
    );
    assert.equal(locationId({ headers: { location: '/a/b//' } }), '');
    assert.equal(locationId({ headers: { location: 'ID8?q' } }), 'ID8');
  });
  it('reads object URIs, refusing an empty segment', () => {
    assert.deepStrictEqual(
      addressOf('/sap/bc/adt/oo/classes/zcl/includes/testclasses#start=5'),
      {
        object_type: 'CLAS',
        object_name: 'ZCL',
        include: 'testclasses',
        line: 5,
      },
    );
    assert.equal(addressOf('/sap/bc/adt/oo/classes//source/main'), undefined);
    assert.deepStrictEqual(
      addressOf(
        '/sap/bc/adt/functions/groups/%2fns%2fg/fmodules/f/source/main#x=1;start=7',
      ),
      {
        object_type: 'FUNC',
        object_name: 'F',
        parent_name: '/NS/G',
        line: 7,
      },
    );
    assert.deepStrictEqual(
      addressOf('/sap/bc/adt/programs/includes/zi/source/main#xstart=3'),
      {
        object_type: 'INCL',
        object_name: 'ZI',
      },
    );
  });
  it('decodes character references in an AMDP data preview', () => {
    const preview = readAmdpPreview(
      '<tableData><columns><metadata><name>N</name></metadata><dataSet><data>O&#39;B</data></dataSet></columns></tableData>',
    );
    assert.deepStrictEqual(preview.rows, [{ N: "O'B" }]);
  });
});

describe('the runtime directory from AUTH_BROKER_PATH', () => {
  it('splits on ":" and ";" outside Windows, on ";" alone on it', () => {
    assert.equal(
      runtimeDirectory(
        undefined,
        { AUTH_BROKER_PATH: ' ;/a:/b' },
        'linux',
        '/h',
      ),
      '/a/runtime',
    );
  });
  it("builds the path of the platform named, not the host's", () => {
    assert.equal(
      runtimeDirectory(
        undefined,
        { AUTH_BROKER_PATH: 'C:\\a;D:\\b' },
        'win32',
        'C:\\h',
      ),
      'C:\\a\\runtime',
    );
  });
});

describe('source search', () => {
  it('reads a comment line after leading blanks of any kind', () => {
    assert.deepStrictEqual(
      scanLines(['\u00a0 " find me', 'find me'], {
        query: 'find',
        exclude_comments: true,
        max_hits: 10,
      }).hits.map((hit) => hit.line),
      [2],
    );
  });
});

describe('the state idle bound', () => {
  it('takes a decimal written out, nothing else', () => {
    assert.equal(parseStateIdleMinutes(' 45 ', 'x'), 45);
    assert.equal(parseStateIdleMinutes('60.0', 'x'), 60);
    assertThrows(() => parseStateIdleMinutes('3e2', 'x'), 'x');
    assertThrows(() => parseStateIdleMinutes('60.', 'x'), 'x');
    assertThrows(() => parseStateIdleMinutes('١٢٠', 'x'), 'x');
  });

  it("a caller's number: a whole number of minutes in the same range", () => {
    assert.equal(stateIdleMinutesOf(45, 'x'), 45);
    assertThrows(
      () => stateIdleMinutesOf(45.5, 'x'),
      'Invalid x: "45.5". Must be a whole number of minutes',
    );
    assertThrows(() => stateIdleMinutesOf(1, 'x'), 'at least');
    assertThrows(
      () => stateIdleMinutesOf(Number.MAX_SAFE_INTEGER, 'x'),
      'Must be at most',
    );
  });
});

describe("activation messages by SAP's letters", () => {
  it('reads E, A, X and error in any case', () => {
    for (const type of ['E', 'a', 'X', 'Error']) {
      assert.equal(isRefusal({ type, text: '' }), true);
    }
    for (const type of ['W', 'I', 'EE', '']) {
      assert.equal(isRefusal({ type, text: '' }), false);
    }
  });
});

describe('the preview URL', () => {
  it('moves a BTP ABAP host to abap-web, any case in its scheme', () => {
    assert.equal(
      browserHostOf('HTTPS://t1.abap.eu10.hana.ondemand.com:443'),
      'HTTPS://t1.abap-web.eu10.hana.ondemand.com:443',
    );
    assert.equal(
      browserHostOf('https://t1.abap.x.y.hana.ondemand.com'),
      'https://t1.abap.x.y.hana.ondemand.com',
    );
    assert.equal(
      browserHostOf('https://host.example:44300'),
      'https://host.example:44300',
    );
  });
  it('keeps URL-safe characters after the shift', () => {
    // `K` shifted by 20 is `_`, which stands as itself.
    assert.equal(encodeFeapSegment('K'), '_');
  });
});

describe('feed paging', () => {
  it("reads the next link's to= after ?, & or ;", () => {
    assert.equal(
      nextToOf(
        '<feed><link rel="next" href="/x?auto=1&amp;to=20260101000000&amp;y=2"/></feed>',
      ),
      '20260101000000',
    );
  });
  it('takes the form YYYY-MM-DDTHH:MM:SS, digits ASCII only', () => {
    assert.equal(toBoundOf('2026-10-01T12:34:56Z'), '20261001123456');
    assert.equal(toBoundOf('2026-10-01 12:34:56'), undefined);
    assert.equal(toBoundOf('2026-10-0١T12:34:56'), undefined);
    assert.equal(secondBefore('20261001000000'), '20260930235959');
  });
});

describe('repeatable elements under a prefix', () => {
  it('reads a prefixed name by its local part', () => {
    assert.deepStrictEqual(parseStructure('<a><m:msg>1</m:msg></a>'), {
      a: { 'm:msg': ['1'] },
    });
  });
});
