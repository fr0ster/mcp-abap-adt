/**
 * The table-type tools, driven through the real adt-clients against a
 * recording connection: what each tool sends, and what it refuses before
 * sending anything.
 */

import { handleGetTableType } from '../../../handlers/table_type/high/handleGetTableType';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import { declareSystemKind } from '../../../lib/systemKind';
import { recordingConnection } from '../../helpers/recordingConnection';

const previous = process.env.SAP_SYSTEM_TYPE;

beforeEach(() => {
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  setSystemContext({
    masterSystem: 'SYSTEM_PLACEHOLDER',
    responsible: 'USER_PLACEHOLDER',
  });
});

afterEach(() => {
  resetSystemContextCache();
  if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previous;
});

const TABLE_TYPE_XML =
  '<?xml version="1.0" encoding="utf-8"?><ttyp:tableType adtcore:name="ZTT_X" xmlns:ttyp="http://www.sap.com/dictionary/tabletype"/>';

describe('GetTableType', () => {
  it('sends one GET to the table type, and answers the document under metadata', async () => {
    const connection = recordingConnection([{ data: TABLE_TYPE_XML }]);
    const result = await handleGetTableType(
      { connection, logger: undefined },
      { table_type_name: 'ztt_x' },
    );
    expect(result.isError).toBe(false);
    expect(connection.requests).toHaveLength(1);
    const [sent] = connection.requests;
    expect(sent?.method).toBe('GET');
    expect(sent?.url).toBe('/sap/bc/adt/ddic/tabletypes/ztt_x');
    const first = result.content[0];
    const answered = JSON.parse(first && 'text' in first ? first.text : '{}');
    expect(answered).toEqual({
      success: true,
      table_type_name: 'ZTT_X',
      part: 'metadata',
      metadata: TABLE_TYPE_XML,
    });
  });

  it.each([[{}], [{ table_type_name: '' }]])(
    'refuses a missing table_type_name, sending nothing',
    async (args) => {
      const connection = recordingConnection();
      const result = await handleGetTableType(
        { connection, logger: undefined },
        args,
      );
      expect(result.isError).toBe(true);
      const first = result.content[0];
      expect(first && 'text' in first ? first.text : '').toBe(
        'table_type_name is required',
      );
      expect(connection.requests).toHaveLength(0);
    },
  );

  it('is served on a connection declared cloud', async () => {
    const connection = recordingConnection([{ data: TABLE_TYPE_XML }]);
    declareSystemKind(connection, 'cloud');
    const result = await handleGetTableType(
      { connection, logger: undefined },
      { table_type_name: 'ZTT_X' },
    );
    expect(result.isError).toBe(false);
    expect(connection.requests).toHaveLength(1);
  });
});
