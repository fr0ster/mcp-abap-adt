/**
 * The answers of the tools whose own XML walk was replaced by a typed
 * reading adt-strategies ships (terse answers, step 2): at every `detail`,
 * on recorded documents, each answer is the one the tool gave before the
 * swap — but where a later step gave a level its own shape (step 4:
 * GetAdtTypes' terse rows, its medium the former terse), rewritten then. The expectation, `tests/fixtures/tools/shipped-readings.json`, was
 * written by the code before the swap
 * (`npm test -- --env WRITE_SHIPPED_READINGS=1 <this file>`, refused under
 * CI) and reviewed in its diff; every later change must leave it equal.
 *
 * Each case runs the handler over a recording connection — real adt-clients
 * code and the reading the handler passes it, no SAP.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { enhancementTypeOf } from '../../../handlers/enhancement/readonly/enhancementAvailability';
import { handleGetPackageContents } from '../../../handlers/package/readonly/handleGetPackageContents';
import { handleSearchObject } from '../../../handlers/search/readonly/handleSearchObject';
import { handleGetPackageTree } from '../../../handlers/system/high/handleGetPackageTree';
import { handleGetAdtTypes } from '../../../handlers/system/readonly/handleGetAllTypes';
import { handleGetInactiveObjects } from '../../../handlers/system/readonly/handleGetInactiveObjects';
import { handleGetWhereUsed } from '../../../handlers/system/readonly/handleGetWhereUsed';
import { handleCreateTransport } from '../../../handlers/transport/high/handleCreateTransport';
import { handleCreateTransportTask } from '../../../handlers/transport/high/handleCreateTransportTask';
import { handleGetTransport } from '../../../handlers/transport/readonly/handleGetTransport';
import { handleListTransports } from '../../../handlers/transport/readonly/handleListTransports';
import { handleReadTransportObjects } from '../../../handlers/transport/readonly/handleReadTransportObjects';
import {
  createBatchAvailability,
  NO_BATCH_ENDPOINT_STATUS,
} from '../../../lib/batch/availability';
import type { DetailLevel } from '../../../lib/detail';
import { resetSystemContextCache } from '../../../lib/systemContext';
import { declareSystemKind } from '../../../lib/systemKind';
import { corpusBody } from '../../helpers/adtCorpus';
import { setSystemContext } from '../../helpers/processSystemContext';
import {
  type RecordingConnection,
  recordingConnection,
} from '../../helpers/recordingConnection';
import { repositoryRoot } from '../../helpers/repoRoot';
import { PARENT, REQUEST } from '../../helpers/transportTaskDocuments';

const FIXTURE_SOURCE = path.join(
  repositoryRoot(__dirname),
  'tests',
  'fixtures',
  'tools',
  'shipped-readings.json',
);

const DETAILS: readonly DetailLevel[] = ['terse', 'medium', 'full', 'raw'];

/** What a handler answered: its error flag and its text. */
interface Answered {
  isError: boolean;
  text: string;
}

/** What a case answered, and the requests it sent. */
interface Recorded extends Answered {
  requests: string[];
}

type Answers = Record<string, Recorded>;

function answeredOf(result: {
  isError?: boolean | undefined;
  content: Array<{ type: string; text?: string }>;
}): Answered {
  return {
    isError: result.isError === true,
    text: result.content.map((part) => part.text ?? '').join('\n'),
  };
}

/** The connection of the case running now: its requests are recorded. */
const last: { connection?: RecordingConnection | undefined } = {};

/** The bodies the running case's connection answered, in order. */
const servedBodies = (): string[] => [...(last.connection?.served ?? [])];

/** The requests the running case sent, as method and url. */
const sentRequests = (): string[] =>
  (last.connection?.requests ?? []).map(
    (request) => `${request.method} ${request.url}`,
  );

const ctx = (
  answers: Array<{ data: string; status?: number }>,
  kind: 'onprem' | 'cloud' = 'onprem',
) => {
  const connection = recordingConnection(answers);
  last.connection = connection;
  declareSystemKind(connection, kind);
  return { connection, logger: undefined };
};

const xmlHead = '<?xml version="1.0" encoding="utf-8"?>';

/** A quickSearch answer: two hits, one with an empty description. */
const SEARCH_HITS = `${xmlHead}<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/zcl_one" adtcore:type="CLAS/OC" adtcore:name="ZCL_ONE" adtcore:packageName="ZPKG" adtcore:description="one &amp; only"/><adtcore:objectReference adtcore:uri="/sap/bc/adt/enhancements/enhoxhh/zenh_two" adtcore:type="ENHO/XHH" adtcore:name="ZENH_TWO" adtcore:description=""/></adtcore:objectReferences>`;

/** A created request, as `POST /cts/transportrequests` answers it. */
const TRANSPORT_CREATED = `${xmlHead}<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="newrequest"><tm:request tm:number="${PARENT}" tm:desc="x" tm:type="K" tm:target="LOCAL" tm:cts_project=""><tm:task tm:owner="SAPUSER01"/></tm:request></tm:root>`;

/** A request read back without a task. */
const REQUEST_WITHOUT_TASK = `${xmlHead}<tm:root tm:object_type="R" adtcore:name="${PARENT}" xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:adtcore="http://www.sap.com/adt/core"><tm:request tm:number="${PARENT}" tm:owner="SAPUSER01" tm:desc="A request" tm:type="K" tm:status="D"/></tm:root>`;

/** A created task, as `newtask` answers it: the number on the root. */
const TASK_CREATED = `${xmlHead}<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="tasks" tm:number="SIDK907073" tm:uri="/sap/bc/adt/cts/transportrequests/SIDK907073"/>`;

/** A quickSearch hit whose description carries a numeric character reference. */
const SEARCH_ENTITY = `${xmlHead}<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/zcl_amp" adtcore:type="CLAS/OC" adtcore:name="ZCL_AMP" adtcore:packageName="ZPKG" adtcore:description="this &#x26; that"/></adtcore:objectReferences>`;

/** A type list whose names read as numbers, one item without a description. */
const NAMED_ITEMS = `${xmlHead}<nameditem:namedItemList xmlns:nameditem="http://www.sap.com/adt/nameditem"><nameditem:totalItemCount>2</nameditem:totalItemCount><nameditem:namedItem><nameditem:name>007</nameditem:name><nameditem:description>leading zeros</nameditem:description></nameditem:namedItem><nameditem:namedItem><nameditem:name>NODESC</nameditem:name></nameditem:namedItem></nameditem:namedItemList>`;

/** A created task whose root names the task and a `tm:request` child its parent. */
const TASK_UNDER_PARENT = `${xmlHead}<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="tasks" tm:number="SIDK907073"><tm:request tm:number="SIDK907071"/></tm:root>`;

/** An answer that is no transport document, its body something no error may repeat. */
const NOT_TRANSPORT = `${xmlHead}<html><body>BODY_MARKER_NEVER_IN_AN_ERROR</body></html>`;

/** Every case: its name, and how to run it at one detail. */
const CASES: Record<string, (detail: DetailLevel) => Promise<Answered>> = {};

for (const name of [
  'read-transport-list-structure--01-cts-transportrequests',
  'read-transport-list-with-targets--01-cts-transportrequests',
]) {
  CASES[`ListTransports ${name}`] = async (detail) =>
    answeredOf(
      await handleListTransports(ctx([{ data: corpusBody(name) }]), {
        user: 'SAPUSER01',
        detail,
      }),
    );
}
CASES['ListTransports an empty list'] = async (detail) =>
  answeredOf(
    await handleListTransports(
      ctx([
        {
          data: `${xmlHead}<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm"/>`,
        },
      ]),
      { user: 'SAPUSER01', detail },
    ),
  );

for (const [label, data] of [
  [
    'read-package-quick-search-mask',
    corpusBody('read-package-quick-search-mask--01-quick-search'),
  ],
  ['two hits', SEARCH_HITS],
  ['no hit', ''],
] as const) {
  CASES[`SearchObject ${label}`] = async (detail) =>
    answeredOf(
      await handleSearchObject(ctx([{ data }]), {
        object_name: 'Z*',
        detail,
      }),
    );
}

for (const [label, data] of [
  [
    'read-package-quick-search-mask',
    corpusBody('read-package-quick-search-mask--01-quick-search'),
  ],
  ['two hits', SEARCH_HITS],
  ['no hit', ''],
  ['a numeric character reference', SEARCH_ENTITY],
] as const) {
  CASES[`SearchObject cloud ${label}`] = async (detail) =>
    answeredOf(
      await handleSearchObject(ctx([{ data }], 'cloud'), {
        object_name: 'Z*',
        detail,
      }),
    );
}
CASES['SearchObject a numeric character reference'] = async (detail) =>
  answeredOf(
    await handleSearchObject(ctx([{ data: SEARCH_ENTITY }]), {
      object_name: 'Z*',
      detail,
    }),
  );

CASES['GetAdtTypes numeric names, a description absent'] = async (detail) =>
  answeredOf(await handleGetAdtTypes(ctx([{ data: NAMED_ITEMS }]), { detail }));

for (const name of [
  'system-description-s4-2025--05-objecttypes',
  'system-description-abap-cloud--05-objecttypes',
]) {
  CASES[`GetAdtTypes ${name}`] = async (detail) =>
    answeredOf(
      await handleGetAdtTypes(ctx([{ data: corpusBody(name) }]), { detail }),
    );
}

for (const [label, answers, taskType] of [
  ['with a task, typed S', [TRANSPORT_CREATED, REQUEST, ''], 'S'],
  ['with a task, left X', [TRANSPORT_CREATED, REQUEST], 'X'],
  ['without a task', [TRANSPORT_CREATED, REQUEST_WITHOUT_TASK], 'S'],
  [
    'read back as a bare root',
    [
      TRANSPORT_CREATED,
      `${xmlHead}<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm"/>`,
    ],
    'S',
  ],
  [
    'read back as no transport document',
    [TRANSPORT_CREATED, NOT_TRANSPORT],
    'S',
  ],
  [
    'read back as an empty root element',
    [TRANSPORT_CREATED, '<tm:root/>'],
    'S',
  ],
] as const) {
  CASES[`CreateTransport ${label}`] = async (detail) =>
    answeredOf(
      await handleCreateTransport(ctx(answers.map((data) => ({ data }))), {
        description: 'x',
        task_type: taskType,
        detail,
      }),
    );
}

for (const [label, answers] of [
  ['typed S', [TASK_CREATED, '']],
  ['a parent named beside the task, typed S', [TASK_UNDER_PARENT, '']],
  [
    'no number answered',
    [`${xmlHead}<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm"/>`],
  ],
] as const) {
  CASES[`CreateTransportTask ${label}`] = async (detail) =>
    answeredOf(
      await handleCreateTransportTask(ctx(answers.map((data) => ({ data }))), {
        transport_number: PARENT,
        target_user: 'developer',
        detail,
      }),
    );
}

for (const [label, data] of [
  [
    'a bare root',
    `${xmlHead}<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm"/>`,
  ],
  ['no transport document', NOT_TRANSPORT],
  ['an empty root element', '<tm:root/>'],
] as const) {
  CASES[`GetTransport ${label}`] = async (detail) =>
    answeredOf(
      await handleGetTransport(ctx([{ data }]), {
        transport_number: PARENT,
        detail,
      }),
    );
}

/** Not a tool: the subtype a search names, the same at every detail. */
for (const [label, name] of [
  ['a hit', 'ZENH_TWO'],
  ['no hit', 'ZENH_NONE'],
] as const) {
  CASES[`enhancementTypeOf ${label}`] = async () => ({
    isError: false,
    text: String(
      await enhancementTypeOf(
        ctx([{ data: SEARCH_HITS }]).connection,
        name,
        'ENHO/XHH',
      ),
    ),
  });
}

// Codex 7: GetWhereUsed, GetInactiveObjects and ReadTransportObjects, pinned
// from the code before each switched to its shipped reading.
CASES['GetWhereUsed read-where-used-list-structure--01'] = async (detail) =>
  answeredOf(
    await handleGetWhereUsed(
      ctx([
        {
          data: corpusBody(
            'read-where-used-list-structure--01-informationsystem-usagereferences',
          ),
        },
      ]),
      { object_name: 'ZMCP_SHR_STRU', object_type: 'TABL/DS', detail },
    ),
  );

const INACTIVE_IOC = `${xmlHead}<ioc:inactiveObjects xmlns:ioc="http://www.sap.com/abapxml/inactiveCtsObjects"><ioc:entry><ioc:object ioc:user="SAPUSER01" ioc:deleted="false"><ioc:ref adtcore:uri="/sap/bc/adt/bo/behaviordefinitions/zi_root" adtcore:type="BDEF/BDO" adtcore:name="ZI_ROOT" xmlns:adtcore="http://www.sap.com/adt/core"/></ioc:object><ioc:transport/></ioc:entry><ioc:entry><ioc:object ioc:user="SAPUSER01" ioc:deleted="false"><ioc:ref adtcore:uri="/sap/bc/adt/functions/groups/zfg/fmodules/z_fm" adtcore:parentUri="/sap/bc/adt/functions/groups/zfg" adtcore:type="FUGR/FF" adtcore:name="Z_FM" xmlns:adtcore="http://www.sap.com/adt/core"/></ioc:object></ioc:entry></ioc:inactiveObjects>`;
const INACTIVE_740 = `${xmlHead}<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/zobj_fgrp" adtcore:type="FUGR/F" adtcore:name="ZOBJ_FGRP"/></adtcore:objectReferences>`;
const INACTIVE_NONE = `${xmlHead}<ioc:inactiveObjects xmlns:ioc="http://www.sap.com/abapxml/inactiveCtsObjects"/>`;
for (const [label, data] of [
  ['two entries', INACTIVE_IOC],
  ['the 7.40 form', INACTIVE_740],
  ['none inactive', INACTIVE_NONE],
] as const) {
  CASES[`GetInactiveObjects ${label}`] = async (detail) =>
    answeredOf(await handleGetInactiveObjects(ctx([{ data }]), { detail }));
}

const ENTRIES_REQUEST = `${xmlHead}<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:object_type="R"><tm:request tm:number="SIDK900100"><tm:all_objects><tm:abap_object tm:pgmid="R3TR" tm:type="PROG" tm:name="ZP_ONE" tm:position="000001"/><tm:abap_object tm:pgmid="R3TR" tm:type="CLAS" tm:name="ZCL_TWO" tm:position="000002"/></tm:all_objects><tm:task tm:number="SIDK900101"><tm:abap_object tm:pgmid="R3TR" tm:type="PROG" tm:name="ZP_ONE" tm:position="000001"/></tm:task><tm:task tm:number="SIDK900102"><tm:abap_object tm:pgmid="LIMU" tm:type="METH" tm:name="ZCL_TWO              DO" tm:position="000001"/><tm:abap_object tm:pgmid="R3TR" tm:type="CLAS" tm:name="ZCL_TWO" tm:position="000002"/></tm:task></tm:request></tm:root>`;
const ENTRIES_TASK = `${xmlHead}<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:object_type="T"><tm:request tm:number="SIDK900100"/><tm:task tm:number="SIDK900101"><tm:abap_object tm:pgmid="R3TR" tm:type="PROG" tm:name="ZP_ONE" tm:position="000001"/><tm:abap_object tm:pgmid="R3TR" tm:type="TABL" tm:name="ZT_NOPOS"/></tm:task></tm:root>`;
for (const [label, data, number] of [
  ['a request with its aggregate list', ENTRIES_REQUEST, 'SIDK900100'],
  ['a task, an entry without a position', ENTRIES_TASK, 'SIDK900101'],
] as const) {
  CASES[`ReadTransportObjects ${label}`] = async (detail) =>
    answeredOf(
      await handleReadTransportObjects(ctx([{ data }]), {
        transport_number: number,
        detail,
      }),
    );
}

// Codex P1: a package root SAP could not load, and a subpackage node it could
// not load, at every level of the package reads (no communication batch).
const NOT_LOADED_LEVEL = `${xmlHead}<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TREE_CONTENT><SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE/><OBJECT_NAME>Error loading node:</OBJECT_NAME><TECH_NAME>SAP_TEXT</TECH_NAME></SEU_ADT_REPOSITORY_OBJ_NODE></TREE_CONTENT></DATA></asx:values></asx:abap>`;
const SUBPACKAGES_ROOT = `${xmlHead}<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TREE_CONTENT/><OBJECT_TYPES><SEU_ADT_OBJECT_TYPE_INFO><OBJECT_TYPE>DEVC/K</OBJECT_TYPE><NODE_ID>000001</NODE_ID></SEU_ADT_OBJECT_TYPE_INFO></OBJECT_TYPES></DATA></asx:values></asx:abap>`;
const PACKAGE_METADATA = `${xmlHead}<pak:package xmlns:pak="http://www.sap.com/adt/packages" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZPKG" adtcore:type="DEVC/K" adtcore:description="A package"/>`;
const sequential = (answers: string[]) => {
  const context = ctx(answers.map((data) => ({ data })));
  const batchAvailability = createBatchAvailability();
  batchAvailability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
  return { ...context, batchAvailability };
};
for (const [label, levels] of [
  ['a root SAP could not load', [NOT_LOADED_LEVEL]],
  [
    'a subpackage node SAP could not load',
    [SUBPACKAGES_ROOT, NOT_LOADED_LEVEL],
  ],
] as const) {
  CASES[`GetPackageContents ${label}`] = async (detail) =>
    answeredOf(
      await handleGetPackageContents(sequential([...levels]), {
        package_name: 'ZPKG',
        include_subpackages: true,
        detail,
      }),
    );
  CASES[`GetPackageTree ${label}`] = async (detail) =>
    answeredOf(
      await handleGetPackageTree(sequential([PACKAGE_METADATA, ...levels]), {
        package_name: 'ZPKG',
        detail,
      }),
    );
}

// Codex P1: objects SAP lists without a name, told apart by their URI.
const NAMELESS_LEVEL = `${xmlHead}<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TREE_CONTENT><SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>TABL/DT</OBJECT_TYPE><OBJECT_URI>/sap/bc/adt/ddic/tables/a</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE><SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>TABL/DT</OBJECT_TYPE><OBJECT_URI>/sap/bc/adt/ddic/tables/b</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE></TREE_CONTENT></DATA></asx:values></asx:abap>`;
CASES['GetPackageContents two objects SAP listed without a name'] = async (
  detail,
) =>
  answeredOf(
    await handleGetPackageContents(sequential([NAMELESS_LEVEL]), {
      package_name: 'ZPKG',
      detail,
    }),
  );

// Codex P1: a subpackage SAP lists without a name is listed, never read (a
// package without a name answers a 500), and its named sibling is walked.
const NAMELESS_SUBPACKAGE_ROOT = `${xmlHead}<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TREE_CONTENT><SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>DEVC/K</OBJECT_TYPE><OBJECT_URI>/sap/bc/adt/packages/nameless</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE><SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>DEVC/K</OBJECT_TYPE><OBJECT_NAME>ZSUB</OBJECT_NAME><TECH_NAME>ZSUB</TECH_NAME><OBJECT_URI>/sap/bc/adt/packages/zsub</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE></TREE_CONTENT></DATA></asx:values></asx:abap>`;
const SUBPACKAGE_LEVEL = `${xmlHead}<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TREE_CONTENT><SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>PROG/P</OBJECT_TYPE><OBJECT_NAME>ZP_IN_SUB</OBJECT_NAME><TECH_NAME>ZP_IN_SUB</TECH_NAME><OBJECT_URI>/sap/bc/adt/programs/programs/zp_in_sub</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE></TREE_CONTENT></DATA></asx:values></asx:abap>`;
const sequentialThen500 = (answers: string[]) => {
  const context = ctx([
    ...answers.map((data) => ({ data })),
    { data: 'a package without a name', status: 500 },
  ]);
  const batchAvailability = createBatchAvailability();
  batchAvailability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
  return { ...context, batchAvailability };
};
CASES['GetPackageContents a subpackage SAP listed without a name'] = async (
  detail,
) =>
  answeredOf(
    await handleGetPackageContents(
      sequentialThen500([NAMELESS_SUBPACKAGE_ROOT, SUBPACKAGE_LEVEL]),
      { package_name: 'ZPKG', include_subpackages: true, detail },
    ),
  );
CASES['GetPackageTree a subpackage SAP listed without a name'] = async (
  detail,
) =>
  answeredOf(
    await handleGetPackageTree(
      sequentialThen500([
        PACKAGE_METADATA,
        NAMELESS_SUBPACKAGE_ROOT,
        SUBPACKAGE_LEVEL,
      ]),
      { package_name: 'ZPKG', detail },
    ),
  );

describe('the tools a shipped reading reads answer as before (WRITE_SHIPPED_READINGS=1 rewrites the fixture)', () => {
  const answered: Answers = {};
  /** What each case's connection answered, in order: the wire. */
  const wire: Record<string, string[]> = {};
  const expected: Answers =
    process.env.WRITE_SHIPPED_READINGS === '1'
      ? {}
      : JSON.parse(fs.readFileSync(FIXTURE_SOURCE, 'utf8'));

  // A change is refused without a responsible and a master system
  // (systemContextGuard.ts); the creates here state both.
  beforeEach(() => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });
  afterEach(() => resetSystemContextCache());

  for (const [name, run] of Object.entries(CASES)) {
    for (const detail of DETAILS) {
      const key = `${name} @${detail}`;
      it(key, async () => {
        last.connection = undefined;
        const answer = await run(detail);
        answered[key] = {
          ...answer,
          requests: sentRequests(),
        };
        wire[key] = servedBodies();
        if (process.env.WRITE_SHIPPED_READINGS !== '1') {
          assert.deepStrictEqual(answered[key], expected[key]);
        }
      });
    }
  }

  // `raw` is what ADT sent (the owner's ruling): one document as it came,
  // or the array of the documents read, in order — never the parse.
  it('raw is wire text: a document served, or the array of every one', () => {
    let checked = 0;
    for (const [key, recorded] of Object.entries(answered)) {
      if (!key.endsWith('@raw') || recorded.isError) continue;
      // A tool's case (its name, upper case first); a helper's case takes
      // no `detail`.
      const first = key[0] ?? '';
      if (first !== first.toUpperCase()) continue;
      const served = wire[key] ?? [];
      checked += 1;
      // One document as it came, or the array of every response — each body
      // served, in the order served, nothing left out.
      let responses: unknown;
      try {
        responses = JSON.parse(recorded.text);
      } catch {
        responses = undefined;
      }
      // A failed read-back (CreateTransport): the responses beside the note.
      const list =
        typeof responses === 'object' &&
        responses !== null &&
        !Array.isArray(responses) &&
        Array.isArray(Reflect.get(responses, 'responses')) &&
        typeof Reflect.get(responses, 'read_back') === 'string'
          ? Reflect.get(responses, 'responses')
          : responses;
      const bodies = Array.isArray(list)
        ? list.map((r) =>
            typeof r === 'object' && r !== null ? Reflect.get(r, 'body') : r,
          )
        : undefined;
      assert.ok(
        served.includes(recorded.text) ||
          (bodies !== undefined &&
            JSON.stringify(bodies) === JSON.stringify(served)),
        `${key}: ${recorded.text.slice(0, 120)}`,
      );
    }
    assert.ok(checked > 0);
  });

  it('no error repeats the document it was answered', () => {
    for (const [key, recorded] of Object.entries(answered)) {
      if (!recorded.isError) continue;
      assert.equal(
        recorded.text.includes('BODY_MARKER_NEVER_IN_AN_ERROR'),
        false,
        key,
      );
    }
  });

  after(() => {
    if (process.env.WRITE_SHIPPED_READINGS !== '1') return;
    if (process.env.CI) throw new Error('the fixture is not written under CI');
    fs.writeFileSync(FIXTURE_SOURCE, `${JSON.stringify(answered, null, 2)}\n`);
  });
});
