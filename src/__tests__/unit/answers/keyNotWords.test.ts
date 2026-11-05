/**
 * SAP's answers judged by key, never by words: each site recognises its case
 * by the T100 key (or the structured field SAP gives where it gives no key),
 * so the same words under another key are not recognised, and the same key
 * worded in another logon language is.
 *
 * Keys: `OO 002` and `SWB_TOOL 016` from the corpus
 * (`refusal-validation-name-taken-*`); `EC 304` and `EC 408`, the two T100
 * keys holding "Interface & has not been created" (on premise, 2026-11-05);
 * the dump's termination relation as the BTP ABAP environment answered it
 * (2026-10-01).
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { AxiosError } from 'axios';
import { handleCreateFunctionGroup } from '../../../handlers/function/high/handleCreateFunctionGroup';
import { dumpSummaryOf } from '../../../handlers/system/readonly/handleRuntimeGetDumpById';
import { corpusBody } from '../../../lib/adtCorpus';
import {
  rfcAddressRefusalFor,
  rfcAddressRefusalOf,
} from '../../../lib/config/messageServer';
import { failureText } from '../../../lib/debugger/readings';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import {
  isAlreadyExistsError,
  parseValidationResponse,
  return_error,
} from '../../../lib/utils';
import { recordingConnection } from '../../helpers/recordingConnection';

// The process declares its system type, as every launcher requires.
process.env.SAP_SYSTEM_TYPE = 'onprem';

/** An `exc:exception` with `text` in `lang` under the T100 key `id`/`no`. */
function exception(
  text: string,
  id: string,
  no: string,
  lang = 'EN',
  type = 'InvalidObjName',
): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
    `<namespace id="com.sap.adt"/><type id="${type}"/>` +
    `<message lang="${lang}">${text}</message><localizedMessage lang="${lang}">${text}</localizedMessage>` +
    '<properties><entry key="LONGTEXT"/>' +
    `<entry key="T100KEY-ID">${id}</entry><entry key="T100KEY-NO">${no}</entry>` +
    '</properties></exc:exception>'
  );
}

/** An `exc:exception` with `text` and no T100 key, of type `type`. */
function keyless(text: string, type: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
    `<namespace id="com.sap.adt"/><type id="${type}"/>` +
    `<message lang="EN">${text}</message><localizedMessage lang="EN">${text}</localizedMessage>` +
    '</exc:exception>'
  );
}

/** An error carrying `body` as SAP's answer. */
function carrying(body: string): {
  response: { status: number; data: string };
} {
  return { response: { status: 400, data: body } };
}

const TAKEN_TABLE = corpusBody(
  'refusal-validation-name-taken-table--01-tables-validation',
);
const TAKEN_CLASS = corpusBody(
  'refusal-validation-name-taken-class--01-validation-objectname',
);

describe('isAlreadyExistsError: a taken name, by its T100 key', () => {
  it('the keyed case is recognised (SWB_TOOL 016, OO 002)', () => {
    expect(isAlreadyExistsError(carrying(TAKEN_TABLE))).toBe(true);
    expect(isAlreadyExistsError(carrying(TAKEN_CLASS))).toBe(true);
  });

  it('the same words under another key are not', () => {
    expect(
      isAlreadyExistsError(
        carrying(exception('Database Table ZX already exists', 'SY', '530')),
      ),
    ).toBe(false);
  });

  it('the same key worded in another logon language is', () => {
    expect(
      isAlreadyExistsError(
        carrying(
          exception(
            'Datenbanktabelle mit dem Namen ZX ist bereits vorhanden',
            'SWB_TOOL',
            '016',
            'DE',
          ),
        ),
      ),
    ).toBe(true);
  });
});

describe('the creates measured on premise (2026-11-05)', () => {
  // Creating a class that exists: 400, ExceptionResourceAlreadyExists,
  // SADT_RESOURCE 001 (V1 CLASS, V2 the name).
  const classTaken = exception(
    'Resource CLASS ZCL_X does already exist.',
    'SADT_RESOURCE',
    '001',
    'EN',
    'ExceptionResourceAlreadyExists',
  );
  // Creating a program that exists: 500, ExceptionResourceCreationFailure,
  // XI 001 (V1 the name).
  const programTaken = exception(
    'A program or include already exists with the name ZPROG_X',
    'XI',
    '001',
    'EN',
    'ExceptionResourceCreationFailure',
  );

  it('a class duplicate (SADT_RESOURCE 001) is a taken name', () => {
    expect(isAlreadyExistsError(carrying(classTaken))).toBe(true);
    expect(
      parseValidationResponse({ status: 400, data: classTaken }).exists,
    ).toBe(true);
  });

  it('the same key in another logon language is too', () => {
    expect(
      isAlreadyExistsError(
        carrying(
          exception(
            'Ressource CLASS ZCL_X existiert bereits',
            'SADT_RESOURCE',
            '001',
            'DE',
            'ExceptionResourceAlreadyExists',
          ),
        ),
      ),
    ).toBe(true);
  });

  it("a program duplicate (XI 001) is not named: SAP's answer is relayed as it is", () => {
    expect(isAlreadyExistsError(carrying(programTaken))).toBe(false);
    expect(
      parseValidationResponse({ status: 500, data: programTaken }),
    ).toEqual({
      valid: false,
      severity: 'ERROR',
      message: 'A program or include already exists with the name ZPROG_X',
    });
  });
});

describe('isAlreadyExistsError: with no key, the exception type decides', () => {
  it('a keyless ExceptionResourceAlreadyExists is recognised', () => {
    expect(
      isAlreadyExistsError(
        carrying(keyless('ZX', 'ExceptionResourceAlreadyExists')),
      ),
    ).toBe(true);
    expect(
      parseValidationResponse({
        status: 400,
        data: keyless('ZX', 'ExceptionResourceAlreadyExists'),
      }).exists,
    ).toBe(true);
  });

  it('the same words under another type are not', () => {
    expect(
      isAlreadyExistsError(
        carrying(keyless('Class ZX already exists', 'InvalidClifName')),
      ),
    ).toBe(false);
    expect(
      parseValidationResponse({
        status: 400,
        data: keyless('Class ZX already exists', 'InvalidClifName'),
      }).exists,
    ).toBeUndefined();
  });

  it('with a key, the key decides: the type with another key is not (PAK 058, a held package)', () => {
    expect(
      isAlreadyExistsError(
        carrying(
          exception(
            'Package ZX is already locked',
            'PAK',
            '058',
            'EN',
            'ExceptionResourceAlreadyExists',
          ),
        ),
      ),
    ).toBe(false);
  });
});

describe('parseValidationResponse: exists by key; a keyless refusal relayed', () => {
  it('the keyed case is recognised', () => {
    expect(parseValidationResponse({ status: 400, data: TAKEN_TABLE })).toEqual(
      {
        valid: false,
        severity: 'ERROR',
        message: 'Database Table with the name ZMCP_SHR_RTABL already exists',
        exists: true,
      },
    );
  });

  it('the same words under another key are not', () => {
    expect(
      parseValidationResponse({
        status: 400,
        data: exception('Class ZX already exists', 'SY', '530'),
      }).exists,
    ).toBeUndefined();
  });

  it('the same key worded in another logon language is', () => {
    expect(
      parseValidationResponse({
        status: 400,
        data: exception('Klasse ZX ist bereits vorhanden', 'OO', '002', 'DE'),
      }).exists,
    ).toBe(true);
  });

  it('a refusal with no key (DDL) is relayed, exists not stated', () => {
    expect(
      parseValidationResponse({
        status: 200,
        data: corpusBody(
          'refusal-validation-name-taken-ddl--01-ddl-validation',
        ),
      }),
    ).toEqual({
      valid: false,
      severity: 'ERROR',
      message: 'Data definition ZMCP_SHR_I_ROOT already exists',
      longText: '',
    });
  });

  it('a body that is no document is relayed as it came, never cut out of markup', () => {
    expect(
      parseValidationResponse({
        status: 500,
        data: '<message>a</message', // not XML
      }),
    ).toEqual({
      valid: false,
      severity: 'ERROR',
      message: '<message>a</message',
    });
  });
});

describe('CreateFunctionGroup: the interface 400 by its T100 key', () => {
  // A change is made for its owner: the responsible stated here.
  beforeEach(() => setSystemContext({ responsible: 'PIN_RESPONSIBLE' }));
  afterEach(() => resetSystemContextCache());
  const args = {
    function_group_name: 'ZPIN_FG',
    package_name: 'ZPIN_PKG',
    description: 'Pin group',
    activate: false,
  };
  const metadata = corpusBody(
    'read-metadata-function-group--01-groups-zmcpshrfgrp',
  );
  const run = async (refusal: string) => {
    const connection = recordingConnection([
      { status: 400, statusText: 'Bad Request', data: refusal },
      { status: 200, data: metadata },
    ]);
    const result = await handleCreateFunctionGroup(
      { connection, logger: undefined },
      args,
    );
    return { result, methods: connection.requests.map((r) => r.method) };
  };

  it('the keyed case is recognised: the group is read back (EC 304, EC 408)', async () => {
    for (const no of ['304', '408']) {
      const { result, methods } = await run(
        exception(
          'Interface SAPLZPIN_FG has not been created',
          'EC',
          no,
          'EN',
          'ExceptionResourceCreationFailure',
        ),
      );
      expect(methods).toEqual(['POST', 'GET']);
      expect(result.isError).toBe(false);
    }
  });

  it('the same words under another key are not: the 400 is the answer', async () => {
    const { result, methods } = await run(
      exception(
        'Interface SAPLZPIN_FG has not been created',
        'SY',
        '530',
        'EN',
        'ExceptionResourceCreationFailure',
      ),
    );
    expect(methods).toEqual(['POST']);
    expect(result.isError).toBe(true);
  });

  it('the same key worded in another logon language is', async () => {
    const { result, methods } = await run(
      exception(
        'Schnittstelle SAPLZPIN_FG wurde nicht angelegt',
        'EC',
        '304',
        'DE',
        'ExceptionResourceCreationFailure',
      ),
    );
    expect(methods).toEqual(['POST', 'GET']);
    expect(result.isError).toBe(false);
  });
});

describe('the dump reader: the termination link by its whole relation', () => {
  const dump = (relation: string) =>
    '<?xml version="1.0" encoding="utf-8"?><dump:dump xmlns:dump="http://www.sap.com/adt/categories/dump" error="RAISE_SHORTDUMP">' +
    '<dump:links>' +
    `<dump:link relation="${relation}" type="text/plain" uri="adt://SID/sap/bc/adt/oo/classes/zcl_x/source/main#start=42,8"/>` +
    '</dump:links></dump:dump>';

  it('the exact relation is recognised', () => {
    expect(
      dumpSummaryOf(
        dump('http://www.sap.com/adt/relations/runtime/dump/termination'),
      ),
    ).toMatchObject({
      termination: {
        uri: '/sap/bc/adt/oo/classes/zcl_x/source/main',
        line: 42,
      },
    });
  });

  it('another relation that names a termination is not', () => {
    expect(
      dumpSummaryOf(
        dump('http://www.sap.com/adt/relations/runtime/dump/termination/raw'),
      )?.termination,
    ).toBeUndefined();
  });
});

describe('return_error: network failures by their code, not their words', () => {
  it('ENOTFOUND by code names the host Node gave', () => {
    const error = new AxiosError('getaddrinfo ENOTFOUND sap.example.com');
    error.code = 'ENOTFOUND';
    Object.defineProperty(error, 'cause', {
      value: Object.assign(new Error('getaddrinfo ENOTFOUND sap.example.com'), {
        code: 'ENOTFOUND',
        hostname: 'sap.example.com',
      }),
    });
    const text = return_error(error).content[0]?.text ?? '';
    expect(text).toContain(
      'DNS resolution failed: Cannot resolve hostname "sap.example.com"',
    );
  });

  it('the words without the code are not a DNS failure', () => {
    const text =
      return_error(new Error('getaddrinfo ENOTFOUND sap.example.com'))
        .content[0]?.text ?? '';
    expect(text).toBe('getaddrinfo ENOTFOUND sap.example.com');
  });

  it("an SDK McpError answers its own words, cut by its code's prefix", () => {
    const error = new McpError(ErrorCode.InvalidParams, 'bad input');
    expect(return_error(error).content[0]?.text).toBe('bad input');
  });

  it('another error worded like one is answered as it came', () => {
    expect(
      return_error(new Error('MCP error -32602: bad input')).content[0]?.text,
    ).toBe('MCP error -32602: bad input');
  });
});

describe("connection's RFC address refusal, by its class", () => {
  it('a config connection cannot dial is refused with its own words', () => {
    const refusal = rfcAddressRefusalFor({
      url: '',
      authType: 'basic',
      mshost: 'ms.example.com',
    });
    expect(refusal).toBeDefined();
    expect(rfcAddressRefusalOf(refusal)).toBe(refusal?.message);
  });

  it('an error worded like it is not one', () => {
    const refusal = rfcAddressRefusalFor({
      url: '',
      authType: 'basic',
      mshost: 'ms.example.com',
    });
    expect(rfcAddressRefusalOf(new Error(refusal?.message))).toBeUndefined();
  });

  it('a config connection can dial is no refusal', () => {
    expect(
      rfcAddressRefusalFor({
        url: '',
        authType: 'basic',
        mshost: 'ms.example.com',
        sysid: 'XYZ',
      }),
    ).toBeUndefined();
  });
});

describe('failureText: what the document adds, no text searched', () => {
  const conflict = corpusBody('debugger-conflict--01-listen-refused');

  it('appends the document words, even where the line already holds them', () => {
    const told = failureText({
      message: 'Request failed with status code 409',
      response: { data: conflict },
    });
    const line = told.slice('Request failed with status code 409: '.length);
    expect(failureText({ message: line, response: { data: conflict } })).toBe(
      `${line}: ${line}`,
    );
  });

  it('a body that is no exception document adds nothing', () => {
    expect(
      failureText({
        message: 'socket hang up',
        response: { data: 'no exception here' },
      }),
    ).toBe('socket hang up');
  });
});
