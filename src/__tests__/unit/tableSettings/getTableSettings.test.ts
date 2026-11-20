/**
 * GetTableSettings: one read of the settings document, at the version asked,
 * through the client of the declared system kind.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  handleGetTableSettings,
  TOOL_DEFINITION,
} from '../../../handlers/table/readonly/handleGetTableSettings';
import { declareSystemKind } from '../../../lib/systemKind';
import { readOnlyToolNames } from '../../../lib/toolSet';
import { recordingConnection } from '../../helpers/recordingConnection';
import { toolAnswer } from '../../helpers/toolAnswer';
import {
  SETTINGS_ETAG,
  SETTINGS_MEDIA_TYPE,
  settingsDocument,
} from './settingsStandIn';

function json(value: unknown): Record<string, unknown> {
  const answer = toolAnswer(value);
  return JSON.parse(answer.content.map((item) => item.text).join(''));
}

function connectionFor(
  variant: 'onprem' | 'cloud',
  answer: Partial<IAdtWireResponse>,
) {
  const connection = recordingConnection([answer]);
  declareSystemKind(connection, variant);
  return connection;
}

describe('GetTableSettings', () => {
  it('reads the settings document once, with its media type, at the version asked', async () => {
    const connection = connectionFor('onprem', {
      status: 200,
      headers: { etag: SETTINGS_ETAG },
      data: settingsDocument('ZTS_X', 'inactive'),
    });
    await handleGetTableSettings(
      { connection, logger: undefined },
      { table_name: 'zts_x', version: 'inactive' },
    );
    assert.equal(connection.requests.length, 1);
    const [request] = connection.requests;
    assert.equal(request?.method, 'GET');
    assert.equal(
      request?.url,
      '/sap/bc/adt/ddic/db/settings/zts_x?version=inactive',
    );
    assert.equal(request?.headers?.Accept, SETTINGS_MEDIA_TYPE);
  });

  it('answers every setting and the description, on premise without the AMDP flag', async () => {
    const connection = connectionFor('onprem', {
      status: 200,
      headers: { etag: SETTINGS_ETAG },
      data: settingsDocument('ZTS_X', 'active'),
    });
    const answer = json(
      await handleGetTableSettings(
        { connection, logger: undefined },
        { table_name: 'ZTS_X' },
      ),
    );
    assert.deepEqual(answer, {
      success: true,
      table_name: 'ZTS_X',
      version: 'active',
      description: 'Settings of a table',
      data_class: 'APPL1',
      size_category: '1',
      buffering: { allowed: 'N', type: '', area_key_fields: 0 },
      storage_type: 'C',
      sharing_type: '',
      load_unit: '',
      translation: {
        value: '',
        is_visible: false,
        is_editable: false,
        granularity: '2',
      },
      logging_enabled: false,
    });
  });

  it('answers the AMDP flag on cloud', async () => {
    const connection = connectionFor('cloud', {
      status: 200,
      headers: { etag: SETTINGS_ETAG },
      data: settingsDocument('ZTS_X', 'active', true),
    });
    const answer = json(
      await handleGetTableSettings(
        { connection, logger: undefined },
        { table_name: 'ZTS_X' },
      ),
    );
    assert.equal(answer.is_writable_by_amdp, true);
  });

  it('refuses a cloud read that carries no AMDP flag (the cloud read strategy)', async () => {
    const connection = connectionFor('cloud', {
      status: 200,
      headers: { etag: SETTINGS_ETAG },
      data: settingsDocument('ZTS_X', 'active'),
    });
    const result = await handleGetTableSettings(
      { connection, logger: undefined },
      { table_name: 'ZTS_X' },
    );
    assert.equal(result.isError, true);
  });

  it("passes SAP's 404 through as the answer", async () => {
    const connection = recordingConnection();
    declareSystemKind(connection, 'onprem');
    connection.makeAdtRequest = async (options) => {
      connection.requests.push({ method: options.method, url: options.url });
      throw Object.assign(new Error('Request failed with status code 404'), {
        response: {
          status: 404,
          statusText: 'Not Found',
          headers: {},
          data: '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><type id="ExceptionResourceNotFound"/><message>Error while importing object ZTS_X from the database</message></exc:exception>',
        },
      });
    };
    const result = await handleGetTableSettings(
      { connection, logger: undefined },
      { table_name: 'ZTS_X' },
    );
    assert.equal(result.isError, true);
    assert.equal(json(result).status, 404);
  });

  it('is served by the read-only builds', () => {
    assert.equal(readOnlyToolNames().has(TOOL_DEFINITION.name), true);
  });

  it('is served on premise and on the cloud', () => {
    assert.deepEqual([...TOOL_DEFINITION.available_in], ['onprem', 'cloud']);
  });
});
