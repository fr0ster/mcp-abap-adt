/**
 * The answers of the tools whose own XML walk was replaced by a typed
 * reading adt-strategies ships (terse answers, step 2): at every `detail`,
 * on recorded documents, each answer is the one the tool gave before the
 * swap. The expectation, `tests/fixtures/tools/shipped-readings.json`, was
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
import { handleSearchObject } from '../../../handlers/search/readonly/handleSearchObject';
import { handleGetAdtTypes } from '../../../handlers/system/readonly/handleGetAllTypes';
import { handleCreateTransport } from '../../../handlers/transport/high/handleCreateTransport';
import { handleCreateTransportTask } from '../../../handlers/transport/high/handleCreateTransportTask';
import { handleListTransports } from '../../../handlers/transport/readonly/handleListTransports';
import type { AnswerDetail } from '../../../lib/strategies/projections';
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

const DETAILS: readonly AnswerDetail[] = ['terse', 'full', 'raw'];

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

/** The requests the running case sent, as method and url. */
const sentRequests = (): string[] =>
  (last.connection?.requests ?? []).map(
    (request) => `${request.method} ${request.url}`,
  );

const ctx = (answers: Array<{ data: string; status?: number }>) => {
  const connection = recordingConnection(answers);
  last.connection = connection;
  declareSystemKind(connection, 'onprem');
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

/** Every case: its name, and how to run it at one detail. */
const CASES: Record<string, (detail: AnswerDetail) => Promise<Answered>> = {};

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

describe('the tools a shipped reading reads answer as before (WRITE_SHIPPED_READINGS=1 rewrites the fixture)', () => {
  const answered: Answers = {};
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
        if (process.env.WRITE_SHIPPED_READINGS !== '1') {
          assert.deepStrictEqual(answered[key], expected[key]);
        }
      });
    }
  }

  after(() => {
    if (process.env.WRITE_SHIPPED_READINGS !== '1') return;
    if (process.env.CI) throw new Error('the fixture is not written under CI');
    fs.writeFileSync(FIXTURE_SOURCE, `${JSON.stringify(answered, null, 2)}\n`);
  });
});
