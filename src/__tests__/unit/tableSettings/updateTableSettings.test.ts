/**
 * UpdateTableSettings: LOCK the settings, patch the named settings, UNLOCK,
 * then activate the table when asked — one call, through the declared system
 * kind's client.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import {
  handleUpdateTableSettings,
  TOOL_DEFINITION,
} from '../../../handlers/table/high/handleUpdateTableSettings';
import { declareSystemKind } from '../../../lib/systemKind';
import { readOnlyToolNames } from '../../../lib/toolSet';
import { corpusBody } from '../../helpers/adtCorpus';
import {
  LOCK_SUCCESS_XML,
  recordingConnection,
} from '../../helpers/recordingConnection';
import { toolAnswer } from '../../helpers/toolAnswer';
import {
  SETTINGS_ETAG,
  SETTINGS_MEDIA_TYPE,
  settingsDocument,
} from './settingsStandIn';

const SETTINGS = '/sap/bc/adt/ddic/db/settings/zts_x';
const HANDLE = 'B92E65858E83454C783181344F429D4BFD8E395D';

/** A table activation SAP executed and cancelled with an error (DT 771's shape). */
const CANCELLED =
  '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">' +
  '<chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="false"/>' +
  '<msg objDescr="Table ZTS_X" type="E" line="1" href="/sap/bc/adt/ddic/tables/zts_x" code="771" forceSupported="true">' +
  '<shortText><txt>AMDP writes to table ZTS_X not possible (Logging activated)</txt></shortText></msg>' +
  '</chkl:messages>';

type Answer = Partial<IAdtWireResponse> | Error;

/**
 * A connection answering each request by `answerFor` (an `Error` with a
 * `response` rejects, as the shipped connection rejects a non-2xx answer),
 * recording each request with the session type it went in.
 */
function standIn(
  variant: 'onprem' | 'cloud',
  answerFor: (request: IAbapRequestOptions) => Answer | undefined,
) {
  const connection = recordingConnection();
  const sessions: string[] = [];
  let session = 'stateless';
  connection.setSessionType = (type) => {
    session = type;
  };
  const record = connection.makeAdtRequest.bind(connection);
  connection.makeAdtRequest = async <T, D>(options: IAbapRequestOptions) => {
    sessions.push(`${session} ${options.method} ${options.url}`);
    await record(options);
    const answer = answerFor(options);
    if (answer instanceof Error) throw answer;
    return {
      status: answer?.status ?? 200,
      statusText: answer?.statusText ?? 'OK',
      headers: answer?.headers ?? {},
      data: answer?.data ?? '',
    } as IAdtWireResponse<T, D>;
  };
  declareSystemKind(connection, variant);
  return { connection, sessions };
}

/** The answers of a write that SAP takes, `amdp` the cloud's flag as read. */
function accepting(
  variant: 'onprem' | 'cloud',
  activation: string = corpusBody('activation-success-verdict--01-activation'),
) {
  const amdp = variant === 'cloud' ? false : undefined;
  return (request: IAbapRequestOptions): Answer | undefined => {
    if (request.url.includes('_action=LOCK')) return { data: LOCK_SUCCESS_XML };
    if (request.method === 'GET' && request.url.startsWith(SETTINGS)) {
      return {
        headers: { etag: SETTINGS_ETAG },
        data: settingsDocument('ZTS_X', 'inactive', amdp),
      };
    }
    if (request.method === 'PUT') {
      return { data: settingsDocument('ZTS_X', 'inactive', amdp) };
    }
    if (request.url.startsWith('/sap/bc/adt/activation')) {
      return { data: activation };
    }
    return undefined;
  };
}

/** `value[a][b]…`, read by shape. */
function member(value: unknown, ...keys: string[]): unknown {
  return keys.reduce<unknown>(
    (at, key) =>
      typeof at === 'object' && at !== null ? Reflect.get(at, key) : undefined,
    value,
  );
}

function json(value: unknown): Record<string, unknown> {
  const answer = toolAnswer(value);
  return JSON.parse(answer.content.map((item) => item.text).join(''));
}

const refused = (status: number, message: string) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: {
      status,
      statusText: 'Refused',
      headers: {},
      data: `<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><type id="ExceptionInvalidData"/><message>${message}</message></exc:exception>`,
    },
  });

/** The body of the PUT the call sent. */
function putBody(connection: ReturnType<typeof standIn>['connection']): string {
  const put = connection.requests.find((r) => r.method === 'PUT');
  assert.ok(put, 'a PUT was sent');
  return String(put.data);
}

describe('UpdateTableSettings', () => {
  it('locks the settings, reads and writes them, and unlocks, in that order, only the LOCK and the UNLOCK stateful', async () => {
    const { connection, sessions } = standIn('onprem', accepting('onprem'));
    const result = await handleUpdateTableSettings(
      { connection, logger: undefined },
      { table_name: 'zts_x', data_class: 'APPL0', activate: false },
    );
    assert.notEqual(result.isError, true);
    assert.deepEqual(
      sessions.filter((line) => !line.includes('/discovery')),
      [
        `stateful POST ${SETTINGS}?_action=LOCK&accessMode=MODIFY`,
        `stateless GET ${SETTINGS}?version=inactive`,
        `stateless PUT ${SETTINGS}?lockHandle=${HANDLE}`,
        `stateful POST ${SETTINGS}?_action=UNLOCK&lockHandle=${HANDLE}`,
      ],
    );
  });

  it('writes the setting named and every other setting as read', async () => {
    const { connection } = standIn('onprem', accepting('onprem'));
    await handleUpdateTableSettings(
      { connection, logger: undefined },
      { table_name: 'ZTS_X', size_category: '3', activate: false },
    );
    const body = putBody(connection);
    assert.match(body, /<ts:sizeCategory>3<\/ts:sizeCategory>/);
    assert.match(body, /<ts:dataClassCategory>APPL1<\/ts:dataClassCategory>/);
    assert.match(body, /<ts:storageType>C<\/ts:storageType>/);
  });

  it('writes the translation value only, its flags as read', async () => {
    const { connection } = standIn('onprem', accepting('onprem'));
    await handleUpdateTableSettings(
      { connection, logger: undefined },
      { table_name: 'ZTS_X', translation: 'X', activate: false },
    );
    assert.match(
      putBody(connection),
      /<ts:translation ts:value="X" ts:isVisible="false" ts:isEditable="false" ts:granularity="2"\/>/,
    );
  });

  it('asks the patch with its media type alone: the library sets the content type', async () => {
    const { connection } = standIn('onprem', accepting('onprem'));
    await handleUpdateTableSettings(
      { connection, logger: undefined },
      { table_name: 'ZTS_X', load_unit: 'P', activate: false },
    );
    const put = connection.requests.find((r) => r.method === 'PUT');
    assert.equal(put?.headers?.Accept, SETTINGS_MEDIA_TYPE);
    assert.equal(put?.headers?.['If-Match'], SETTINGS_ETAG);
  });

  it("answers a refused PUT with SAP's answer and still unlocks", async () => {
    const { connection } = standIn('onprem', (request) =>
      request.method === 'PUT'
        ? refused(400, 'The description is missing for ZTS_X')
        : accepting('onprem')(request),
    );
    const result = await handleUpdateTableSettings(
      { connection, logger: undefined },
      { table_name: 'ZTS_X', data_class: 'APPL1', activate: true },
    );
    assert.equal(result.isError, true);
    assert.equal(json(result).status, 400);
    assert.ok(
      connection.requests.some((r) => r.url.includes('_action=UNLOCK')),
    );
    assert.ok(
      !connection.requests.some((r) =>
        r.url.startsWith('/sap/bc/adt/activation'),
      ),
      'nothing is activated after a refused write',
    );
  });

  it('sends no PUT when the read answers no ETag, and still unlocks', async () => {
    const { connection } = standIn('onprem', (request) =>
      request.method === 'GET' && request.url.startsWith(SETTINGS)
        ? { data: settingsDocument('ZTS_X', 'inactive') }
        : accepting('onprem')(request),
    );
    const result = await handleUpdateTableSettings(
      { connection, logger: undefined },
      { table_name: 'ZTS_X', data_class: 'APPL1', activate: false },
    );
    assert.equal(result.isError, true);
    assert.ok(!connection.requests.some((r) => r.method === 'PUT'));
    assert.ok(
      connection.requests.some((r) => r.url.includes('_action=UNLOCK')),
    );
  });

  it('activates the table after a clean unlock when activate is true, and only then', async () => {
    const { connection } = standIn('onprem', accepting('onprem'));
    await handleUpdateTableSettings(
      { connection, logger: undefined },
      { table_name: 'ZTS_X', data_class: 'APPL1', activate: true },
    );
    const urls = connection.requests.map((r) => r.url);
    const unlock = urls.findIndex((url) => url.includes('_action=UNLOCK'));
    const activation = urls.findIndex((url) =>
      url.startsWith('/sap/bc/adt/activation'),
    );
    assert.ok(unlock >= 0 && activation > unlock);
    const { connection: kept } = standIn('onprem', accepting('onprem'));
    await handleUpdateTableSettings(
      { connection: kept, logger: undefined },
      { table_name: 'ZTS_X', data_class: 'APPL1', activate: false },
    );
    assert.ok(
      !kept.requests.some((r) => r.url.startsWith('/sap/bc/adt/activation')),
    );
  });

  it('activates nothing when the UNLOCK is refused, and says the lock may be held', async () => {
    const { connection } = standIn('onprem', (request) =>
      request.url.includes('_action=UNLOCK')
        ? refused(403, 'unlock refused')
        : accepting('onprem')(request),
    );
    const result = await handleUpdateTableSettings(
      { connection, logger: undefined },
      { table_name: 'ZTS_X', data_class: 'APPL1', activate: true },
    );
    assert.equal(member(json(result), 'cleanup', 'left_locked'), true);
    assert.ok(
      !connection.requests.some((r) =>
        r.url.startsWith('/sap/bc/adt/activation'),
      ),
    );
  });

  it("answers an activation SAP executed with an error as an error carrying SAP's message", async () => {
    const { connection } = standIn('cloud', accepting('cloud', CANCELLED));
    const result = await handleUpdateTableSettings(
      { connection, logger: undefined },
      {
        table_name: 'ZTS_X',
        is_writable_by_amdp: true,
        logging_enabled: true,
        activate: true,
      },
    );
    assert.equal(result.isError, true);
    assert.match(
      JSON.stringify(json(result)),
      /AMDP writes to table ZTS_X not possible \(Logging activated\)/,
    );
  });

  it('keeps the AMDP flag as read on the cloud, and writes it when named', async () => {
    const { connection } = standIn('cloud', accepting('cloud'));
    await handleUpdateTableSettings(
      { connection, logger: undefined },
      { table_name: 'ZTS_X', data_class: 'APPL0', activate: false },
    );
    assert.match(
      putBody(connection),
      /<ts:isWritableByAMDP>false<\/ts:isWritableByAMDP>/,
    );
    const { connection: named } = standIn('cloud', accepting('cloud'));
    await handleUpdateTableSettings(
      { connection: named, logger: undefined },
      { table_name: 'ZTS_X', is_writable_by_amdp: true, activate: false },
    );
    assert.match(
      putBody(named),
      /<ts:isWritableByAMDP>true<\/ts:isWritableByAMDP>/,
    );
  });

  it('refuses a cloud read without the AMDP flag before any PUT (the cloud client)', async () => {
    const { connection } = standIn('cloud', (request) =>
      request.method === 'GET' && request.url.startsWith(SETTINGS)
        ? {
            headers: { etag: SETTINGS_ETAG },
            data: settingsDocument('ZTS_X', 'inactive'),
          }
        : accepting('cloud')(request),
    );
    const result = await handleUpdateTableSettings(
      { connection, logger: undefined },
      { table_name: 'ZTS_X', data_class: 'APPL0', activate: false },
    );
    assert.equal(result.isError, true);
    assert.ok(!connection.requests.some((r) => r.method === 'PUT'));
  });

  it('is served by the full sets, never by the read-only ones', () => {
    assert.equal(readOnlyToolNames().has(TOOL_DEFINITION.name), false);
    assert.deepEqual([...TOOL_DEFINITION.available_in], ['onprem', 'cloud']);
  });

  describe('the schema', () => {
    const onprem = TOOL_DEFINITION.variants.onprem.inputSchema;
    const cloud = TOOL_DEFINITION.variants.cloud.inputSchema;

    it('refuses a call that names no setting', () => {
      assert.equal(
        onprem.safeParse({ table_name: 'ZTS_X', activate: false }).success,
        false,
      );
    });

    it('requires activate', () => {
      assert.equal(
        onprem.safeParse({ table_name: 'ZTS_X', data_class: 'APPL0' }).success,
        false,
      );
    });

    it('refuses area_key_fields beside a buffering type other than G', () => {
      const parsed = (type: string) =>
        onprem.safeParse({
          table_name: 'ZTS_X',
          buffering: { type, area_key_fields: 2 },
          activate: false,
        }).success;
      assert.equal(parsed('P'), false);
      assert.equal(parsed('G'), true);
    });

    it('takes the AMDP flag on the cloud only', () => {
      const args = {
        table_name: 'ZTS_X',
        is_writable_by_amdp: true,
        activate: false,
      };
      assert.equal(cloud.safeParse(args).success, true);
      const onpremParsed = onprem.safeParse(args);
      // The on-premise schema has no such field: the flag alone names no setting.
      assert.equal(onpremParsed.success, false);
    });

    it('refuses the AMDP flag on premise beside a setting it would write', () => {
      const parsed = onprem.safeParse({
        table_name: 'ZTS_X',
        data_class: 'APPL1',
        is_writable_by_amdp: false,
        activate: false,
      });
      assert.equal(parsed.success, false);
      assert.match(String(parsed.error?.message), /is_writable_by_amdp/);
    });
  });
});
