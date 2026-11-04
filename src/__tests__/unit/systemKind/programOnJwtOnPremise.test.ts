/**
 * The credential is not the system kind (the owner's rule, plan C2e):
 * nothing is derived from the authorization — only the declared system kind
 * decides what a variant offers.
 *
 * - An on-premise system reached with a JWT credential: the program writes
 *   are listed and send their requests. Each case runs with a JWT
 *   credential in the session context (`sessionContext`, the store the
 *   removed `isCloudConnection()` read first), on `recordingConnection`
 *   with the declared kind `onprem`.
 * - A cloud system reached with a basic credential: the cloud surface keeps
 *   today's program reads and checks, and nothing more.
 */

import type { SapConfig } from '@mcp-abap-adt/connection';
import { corpusBody } from '../../../lib/adtCorpus';
import { listedTool, statedEnvironment } from '../../../lib/listedTool';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import { sessionContext } from '../../../lib/utils';
import { jsonFind, listedJson } from '../../helpers/listedJson';
import {
  PIN_PORTS,
  type PinCase,
  pinKey,
  runPinCase,
  servedEntries,
} from '../../helpers/pinCases';
import type { SystemKind } from '../../helpers/servedTools';

/** This file's fixed stand-in port, for its server case. */
const PORT = PIN_PORTS.last;

const JWT_SETTINGS: SapConfig = {
  url: 'https://example.com',
  client: '100',
  authType: 'jwt',
  jwtToken: 'pin-token',
};

/** A program create states its responsible person: from the settings here. */
beforeEach(() => {
  setSystemContext({ responsible: 'PIN_RESPONSIBLE' });
});
afterEach(() => {
  resetSystemContextCache();
});

/** `c` run with `settings` as the session's credential. */
function runWith(settings: SapConfig, c: PinCase): Promise<void> {
  return sessionContext.run({ sapConfig: settings }, () => runPinCase(c));
}

/** The tool names `kind` lists. */
function listedNames(kind: SystemKind): Set<string> {
  return new Set(servedEntries(kind).keys());
}

/** The `object_type` enum `tool` is listed with on `kind`. */
function objectTypes(tool: string, kind: SystemKind): readonly string[] {
  const entry = servedEntries(kind).get(tool);
  if (entry === undefined) throw new Error(`${kind} lists no ${tool}`);
  const listed = listedTool(entry.toolDefinition, statedEnvironment(kind));
  if (!listed.listed) throw new Error(`${kind} lists no ${tool}`);
  const values = jsonFind(listedJson(listed.inputSchema), 'object_type')?.enum;
  if (values === undefined) throw new Error(`${tool} has no object_type enum`);
  return values.filter((value): value is string => typeof value === 'string');
}

/** ADT's answer to an activation that activated: a real corpus document. */
const ACTIVATED = [
  {
    status: 200,
    data: corpusBody('activation-success-verdict--01-activation'),
  },
];

/** The program activation every activate of `ZPIN_PROGRAM` sends. */
const ACTIVATE_ZPIN_PROGRAM = [
  {
    method: 'POST',
    url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
    headers: {
      Accept: 'application/xml',
      'Content-Type': 'application/vnd.sap.adt.activation+xml',
    },
    body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/programs/programs/zpin_program" adtcore:name="ZPIN_PROGRAM"/>\n</adtcore:objectReferences>',
  },
];

const onPremiseWrites: PinCase[] = [
  {
    tool: 'CreateProgram',
    variant: 'onprem',
    stand: 'recording',
    args: {
      program_name: 'ZPIN_PROGRAM',
      package_name: '$TMP',
      description: 'Pin program',
    },
    expected: [
      {
        method: 'POST',
        url: '/sap/bc/adt/programs/programs',
        headers: {
          Accept: 'application/vnd.sap.adt.programs.programs.v2+xml',
          'Content-Type': 'application/vnd.sap.adt.programs.programs.v2+xml',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?><program:abapProgram xmlns:program="http://www.sap.com/adt/programs/programs" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="Pin program" adtcore:language="EN" adtcore:name="ZPIN_PROGRAM" adtcore:type="PROG/P" adtcore:masterLanguage="EN" adtcore:responsible="PIN_RESPONSIBLE" program:programType="1" program:application="*">\n  <adtcore:packageRef adtcore:name="$TMP"/>\n</program:abapProgram>',
      },
    ],
  },
  {
    tool: 'UpdateProgram',
    variant: 'onprem',
    stand: 'recording',
    args: { program_name: 'ZPIN_PROGRAM', source_code: 'REPORT zpin_program.' },
    expected: [
      {
        method: 'POST',
        url: '/sap/bc/adt/programs/programs/zpin_program?_action=LOCK&accessMode=MODIFY',
        headers: {
          Accept:
            'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9',
        },
        body: undefined,
      },
      {
        method: 'PUT',
        url: '/sap/bc/adt/programs/programs/zpin_program/source/main?lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
        headers: {
          Accept: 'text/plain',
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: 'REPORT zpin_program.',
      },
      {
        method: 'POST',
        url: '/sap/bc/adt/programs/programs/zpin_program?_action=UNLOCK&lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
        headers: {},
        body: undefined,
      },
    ],
  },
  {
    tool: 'ActivateProgram',
    variant: 'onprem',
    stand: 'recording',
    args: { program_name: 'ZPIN_PROGRAM' },
    answers: ACTIVATED,
    expected: ACTIVATE_ZPIN_PROGRAM,
  },
  {
    tool: 'HandlerCreate',
    variant: 'onprem',
    stand: 'recording',
    args: {
      object_type: 'PROGRAM',
      program_name: 'ZPIN_PROGRAM',
      package_name: '$TMP',
      description: 'Pin program',
    },
    expected: [
      {
        method: 'POST',
        url: '/sap/bc/adt/programs/programs',
        headers: {
          Accept: 'application/vnd.sap.adt.programs.programs.v2+xml',
          'Content-Type': 'application/vnd.sap.adt.programs.programs.v2+xml',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?><program:abapProgram xmlns:program="http://www.sap.com/adt/programs/programs" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="Pin program" adtcore:language="EN" adtcore:name="ZPIN_PROGRAM" adtcore:type="PROG/P" adtcore:masterLanguage="EN" adtcore:responsible="PIN_RESPONSIBLE" program:programType="1" program:application="*">\n  <adtcore:packageRef adtcore:name="$TMP"/>\n</program:abapProgram>',
      },
    ],
  },
  {
    tool: 'HandlerUpdate',
    variant: 'onprem',
    stand: 'recording',
    args: {
      object_type: 'PROGRAM',
      program_name: 'ZPIN_PROGRAM',
      source_code: 'REPORT zpin_program.',
      lock_handle: 'PIN_LOCK_HANDLE',
    },
    expected: [
      {
        method: 'PUT',
        url: '/sap/bc/adt/programs/programs/zpin_program/source/main?lockHandle=PIN_LOCK_HANDLE',
        headers: {
          Accept: 'text/plain',
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: 'REPORT zpin_program.',
      },
    ],
  },
  {
    tool: 'HandlerActivate',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'PROGRAM', object_name: 'ZPIN_PROGRAM' },
    answers: ACTIVATED,
    expected: ACTIVATE_ZPIN_PROGRAM,
  },
];

describe('an on-premise system with a JWT credential', () => {
  for (const c of onPremiseWrites) {
    it(`${pinKey(c)} on premise with JWT auth sends its requests`, async () => {
      await runWith(JWT_SETTINGS, c);
    });
  }

  it('JWT credential with onprem stated: the program tools are listed and run', async () => {
    const listed = listedNames('onprem');
    for (const tool of ['CreateProgram', 'UpdateProgram', 'ActivateProgram']) {
      expect({ tool, listed: listed.has(tool) }).toEqual({
        tool,
        listed: true,
      });
    }
    for (const tool of ['HandlerCreate', 'HandlerUpdate', 'HandlerActivate']) {
      expect(objectTypes(tool, 'onprem')).toContain('PROGRAM');
    }
  });
});

describe('a cloud system with a basic credential', () => {
  it("basic credential with cloud stated: the cloud surface keeps today's program reads and checks, and nothing more", async () => {
    const listed = listedNames('cloud');
    for (const tool of [
      'CreateProgram',
      'UpdateProgram',
      'ActivateProgram',
      'DeleteProgram',
      'CreateProgramUnitTest',
      'UpdateProgramUnitTest',
      'RuntimeRunProgram',
      'GetMainPrograms',
    ]) {
      expect({ tool, listed: listed.has(tool) }).toEqual({
        tool,
        listed: false,
      });
    }
    for (const tool of [
      'GetProgram',
      'GetProgramVersions',
      'GetProgramVersionSource',
      'GetProgramVersionDiff',
      'CheckProgram',
      'RunProgramUnitTest',
    ]) {
      expect({ tool, listed: listed.has(tool) }).toEqual({
        tool,
        listed: true,
      });
    }
    for (const tool of [
      'HandlerCreate',
      'HandlerUpdate',
      'HandlerActivate',
      'HandlerLock',
      'HandlerUnlock',
      'HandlerValidate',
      'HandlerDelete',
    ]) {
      expect({
        tool,
        program: objectTypes(tool, 'cloud').includes('PROGRAM'),
      }).toEqual({ tool, program: false });
    }
    for (const tool of [
      'HandlerGet',
      'HandlerCheckRun',
      'HandlerDeletionCheck',
      'HandlerWhereUsed',
    ]) {
      expect({
        tool,
        program: objectTypes(tool, 'cloud').includes('PROGRAM'),
      }).toEqual({ tool, program: true });
    }
  });

  // Through the server's dispatch (`pinServer`: basic settings, `cloud`
  // declared): the listed cloud schema refuses it. The SDK answers its
  // schema refusal as an error result, not a throw.
  it('a compact HandlerCreate of a PROGRAM on the cloud is refused by its schema, nothing sent', async () => {
    await runPinCase(
      {
        tool: 'HandlerCreate',
        variant: 'cloud',
        stand: 'server',
        args: {
          object_type: 'PROGRAM',
          program_name: 'ZPIN_PROGRAM',
          package_name: 'ZPIN_PACKAGE',
          description: 'Pin program',
        },
        refusal: 'answer',
        expected: 'none',
        ran: (answer) => {
          const text = answer.content[0]?.text ?? '';
          expect(text).toContain(
            'Input validation error: Invalid arguments for tool HandlerCreate: ',
          );
          expect(text).toContain('at object_type');
        },
      },
      { port: PORT },
    );
  });
});
