/**
 * GetObjectDraft and HandlerGet `part: 'draft'` (plan Task 11): the requests
 * the reads send, the answer per part, the two tools answering alike, a
 * failed main read answered as the type's reads answer it, an include that
 * does not exist left out, and the part read in the call.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';
import { COMPACT_READ } from '../../../lib/adtProjections';
import {
  DRAFT_TYPES,
  draftPartsOf,
  HANDLER_GET_DRAFT_TYPES,
} from '../../../lib/draft/draftTypes';
import { isLongRead } from '../../../lib/longTools';
import { declareSystemKind } from '../../../lib/systemKind';
import { recordingConnection } from '../../helpers/recordingConnection';
import { servedEntries } from '../../helpers/servedEntries';
import type { SystemKind } from '../../helpers/servedTools';
import { toolAnswer } from '../../helpers/toolAnswer';

const ACTIVE = '202611041015000011';
const DRAFT = '202611041030000001';

/** The ETag each version answers: the caller's draft in every part. */
function etagFor(url: string): string {
  return url.includes('version=active') ? ACTIVE : DRAFT;
}

/**
 * A connection answering every read with the ETag of its version, or
 * `status` for the requests `failing` picks; its requests recorded.
 */
function draftConnection(
  variant: SystemKind,
  failing: (request: IAbapRequestOptions) => number | undefined = () =>
    undefined,
) {
  const connection = recordingConnection();
  const sent: IAbapRequestOptions[] = [];
  mock.method(
    connection,
    'makeAdtRequest',
    async (request: IAbapRequestOptions) => {
      sent.push(request);
      const status = failing(request);
      if (status !== undefined) {
        throw Object.assign(new Error(`HTTP ${status}`), {
          response: { status, statusText: 'Not Found', headers: {}, data: '' },
          isAxiosError: true,
        });
      }
      return {
        status: 200,
        statusText: 'OK',
        headers: { etag: etagFor(request.url) },
        data: '',
      };
    },
  );
  declareSystemKind(connection, variant);
  return { connection, sent };
}

function json(value: unknown): unknown {
  const answer = toolAnswer(value);
  return JSON.parse(answer.content.map((item) => item.text).join(''));
}

/** The name argument of each type on HandlerGet. */
const NAME_ARGUMENT: Record<string, string> = {
  PROGRAM: 'program_name',
  INCLUDE: 'include_name',
  INTERFACE: 'interface_name',
  CLASS: 'class_name',
  BEHAVIOR_IMPLEMENTATION: 'behavior_implementation_name',
  FUNCTION_MODULE: 'function_module_name',
  FUNCTION_GROUP: 'function_group_name',
  DDL: 'ddl_name',
  BEHAVIOR_DEFINITION: 'behavior_definition_name',
  METADATA_EXTENSION: 'metadata_extension_name',
  SERVICE_DEFINITION: 'service_definition_name',
  TABLE: 'table_name',
  STRUCTURE: 'structure_name',
  DOMAIN: 'domain_name',
  DATA_ELEMENT: 'data_element_name',
  TABLE_TYPE: 'table_type_name',
};

beforeEach(() => {
  mock.timers.enable({
    apis: ['Date'],
    now: new Date('2026-11-04T10:31:00.900Z'),
  });
});
afterEach(() => {
  mock.timers.reset();
  mock.restoreAll();
});

for (const variant of ['onprem', 'cloud'] as const) {
  describe(`the draft reads, ${variant}`, () => {
    const entries = servedEntries(variant);
    const draftTool = entries.get('GetObjectDraft');
    const handlerGet = entries.get('HandlerGet');

    it('HandlerGet reads the draft of exactly the draft types its object_type lists', () => {
      const members: readonly string[] = COMPACT_READ[variant];
      assert.deepEqual(
        HANDLER_GET_DRAFT_TYPES[variant],
        DRAFT_TYPES[variant].filter((type) => members.includes(type)),
      );
    });

    for (const type of HANDLER_GET_DRAFT_TYPES[variant]) {
      it(`${type}: three reads per part, the answer per part, the same on both tools`, async () => {
        assert.ok(draftTool !== undefined && handlerGet !== undefined);
        const group =
          type === 'FUNCTION_MODULE' ? { function_group_name: 'ZFG' } : {};
        const viaTool = draftConnection(variant);
        const answered = json(
          await draftTool.call(
            { connection: viaTool.connection },
            { object_type: type, object_name: 'zobj', ...group },
          ),
        );
        const viaGet = draftConnection(variant);
        const nameArgument = NAME_ARGUMENT[type];
        assert.ok(nameArgument !== undefined);
        const viaPart = json(
          await handlerGet.call(
            { connection: viaGet.connection },
            {
              object_type: type,
              part: 'draft',
              [nameArgument]: 'zobj',
              ...group,
            },
          ),
        );
        assert.deepEqual(viaPart, answered);
        const parts = draftPartsOf(type, variant);
        assert.equal(viaTool.sent.length, parts.length * 3);
        assert.deepEqual(
          viaTool.sent.map((request) => request.method),
          viaTool.sent.map(() => 'GET'),
        );
        for (const version of ['active', 'inactive', 'workingArea']) {
          assert.equal(
            viaTool.sent.filter((request) =>
              request.url.includes(`version=${version}`),
            ).length,
            parts.length,
          );
        }
        assert.deepEqual(
          viaGet.sent.map((r) => r.url),
          viaTool.sent.map((r) => r.url),
        );
        const timeKnown =
          type !== 'METADATA_EXTENSION' && type !== 'SERVICE_DEFINITION';
        assert.deepEqual(answered, {
          object_type: type,
          object_name: 'ZOBJ',
          has_draft: true,
          parts: parts.map((part) => ({
            part,
            draft: 'own',
            changed_at: timeKnown ? '2026-11-04T10:30:00Z' : null,
            age_seconds: timeKnown ? 60 : null,
            etags: { active: ACTIVE, inactive: DRAFT, workspace: DRAFT },
          })),
        });
      });
    }

    it('a failed main read is the answer, SAP status included, as the type read answers it', async () => {
      assert.ok(draftTool !== undefined);
      const { connection } = draftConnection(variant, (request) =>
        request.url.includes('version=active') ? 404 : undefined,
      );
      const answer = toolAnswer(
        await draftTool.call(
          { connection },
          { object_type: 'INTERFACE', object_name: 'ZIF_NONE' },
        ),
      );
      assert.equal(answer.isError, true);
      const parsed: unknown = JSON.parse(
        answer.content.map((i) => i.text).join(''),
      );
      assert.equal(
        typeof parsed === 'object' && parsed !== null
          ? Reflect.get(parsed, 'status')
          : undefined,
        404,
      );
    });

    it('a class none of whose parts exists answers its 404 on both tools, never an empty draft', async () => {
      assert.ok(draftTool !== undefined && handlerGet !== undefined);
      for (const [tool, args] of [
        [draftTool, { object_type: 'CLASS', object_name: 'ZCL_NONE' }],
        [
          handlerGet,
          { object_type: 'CLASS', part: 'draft', class_name: 'ZCL_NONE' },
        ],
      ] as const) {
        const { connection } = draftConnection(variant, () => 404);
        const answer = toolAnswer(await tool.call({ connection }, args));
        assert.equal(answer.isError, true);
        const parsed: unknown = JSON.parse(
          answer.content.map((i) => i.text).join(''),
        );
        assert.equal(
          typeof parsed === 'object' && parsed !== null
            ? Reflect.get(parsed, 'status')
            : undefined,
          404,
        );
      }
    });

    it('an include whose three reads answer 404 has no entry', async () => {
      assert.ok(draftTool !== undefined);
      const { connection } = draftConnection(variant, (request) =>
        request.url.includes('/includes/testclasses') ? 404 : undefined,
      );
      const answered = json(
        await draftTool.call(
          { connection },
          { object_type: 'CLASS', object_name: 'ZCL_A' },
        ),
      );
      const parts =
        typeof answered === 'object' && answered !== null
          ? Reflect.get(answered, 'parts')
          : undefined;
      assert.ok(Array.isArray(parts));
      assert.deepEqual(
        parts.map((part: unknown) =>
          typeof part === 'object' && part !== null
            ? Reflect.get(part, 'part')
            : undefined,
        ),
        draftPartsOf('CLASS', variant).filter((part) => part !== 'testclasses'),
      );
    });
  });
}

describe('the draft part runs in the call', () => {
  it('is not a long read: a background with it is refused, the read is the call', () => {
    assert.equal(
      isLongRead('HandlerGet', {
        object_type: 'CLASS',
        object_name: 'ZC',
        part: 'draft',
      }),
      false,
    );
  });
});
