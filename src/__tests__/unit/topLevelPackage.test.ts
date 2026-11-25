/**
 * A top-level package — bound to a transport layer, with no super package —
 * is created, locked and unlocked like any other: SAP's lock of a package
 * (`CL_PAK_ADT_PERSIST->if_wb_object_persist~lock`) reads the package by its
 * name alone, and adt-clients' `AdtPackage.lock()` sends
 * `POST …?_action=LOCK&accessMode=MODIFY` from `packageName` alone; its
 * create writes an empty `<pak:superPackage/>` when it is given none.
 * Measured on premise (2026-11-21): a local package created with an empty
 * super package answered 201, its LOCK 200 and its UNLOCK 200.
 *
 * Each case runs the tool's own entry — its schema's parse, then its handler
 * — over a recording connection declared the variant: real adt-clients code,
 * no SAP.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  TOOL_DEFINITION as HandlerCreate,
  handleHandlerCreate,
} from '../../../compact-modify/src/handlers/handleHandlerCreate';
import {
  TOOL_DEFINITION as HandlerLock,
  handleHandlerLock,
  handleHandlerLock as lockOrUnlock,
} from '../../../compact-modify/src/handlers/handleHandlerLock';
import {
  handleLockObject,
  TOOL_DEFINITION as LockObjectLow,
} from '../../handlers/common/low/handleLockObject';
import {
  handleUnlockObject,
  TOOL_DEFINITION as UnlockObjectLow,
} from '../../handlers/common/low/handleUnlockObject';
import {
  TOOL_DEFINITION as CreatePackage,
  handleCreatePackage,
} from '../../handlers/package/high/handleCreatePackage';
import type { ProjectionVariant } from '../../lib/adtProjections';
import {
  defineTool,
  type HandlerContext,
  type ToolArgs,
} from '../../lib/handlers/interfaces';
import { resetSystemContextCache } from '../../lib/systemContext';
import { declareSystemKind } from '../../lib/systemKind';
import { holding } from '../helpers/heldLocks';
import { setSystemContext } from '../helpers/processSystemContext';
import {
  type RecordedRequest,
  recordingConnection,
} from '../helpers/recordingConnection';

const VARIANTS: readonly ProjectionVariant[] = ['onprem', 'cloud'];

const PACKAGE = 'ZPKG_TOP';
const HANDLE = 'B92E65858E83454C783181344F429D4BFD8E395D';

/** One tool's entry, called as the model calls it. */
type Send = (context: HandlerContext, args: ToolArgs) => Promise<unknown>;

const TOOLS: Readonly<Record<string, Send>> = {
  CreatePackage: (context, args) =>
    defineTool(CreatePackage, handleCreatePackage).call(context, args),
  HandlerCreate: (context, args) =>
    defineTool(HandlerCreate, handleHandlerCreate).call(context, args),
  LockObjectLow: (context, args) =>
    defineTool(LockObjectLow, handleLockObject).call(context, args),
  HandlerLock: (context, args) =>
    defineTool(HandlerLock, handleHandlerLock).call(context, args),
  UnlockObjectLow: (context, args) =>
    defineTool(UnlockObjectLow, handleUnlockObject).call(context, args),
  // The unlock of the merged HandlerLock, under its own key here.
  HandlerUnlock: (context, args) =>
    defineTool(HandlerLock, lockOrUnlock).call(context, {
      ...args,
      action: 'unlock',
    }),
};

/** The requests one call sends on `variant`, and what it answered. */
async function sent(
  tool: string,
  variant: ProjectionVariant,
  args: ToolArgs,
): Promise<{ requests: RecordedRequest[]; answered: string }> {
  process.env.SAP_SYSTEM_TYPE = variant;
  const connection = recordingConnection();
  declareSystemKind(connection, variant);
  const send = TOOLS[tool];
  if (send === undefined) throw new Error(`no entry for ${tool}`);
  const answered = await send(
    { connection, heldLocks: holding(HANDLE) },
    args,
  ).catch((thrown: unknown) => ({ thrown: String(thrown) }));
  return {
    requests: connection.requests,
    answered: JSON.stringify(answered) ?? String(answered),
  };
}

/** The requests whose URL carries `action`. */
function withAction(
  requests: readonly RecordedRequest[],
  action: string,
): RecordedRequest[] {
  return requests.filter(
    (request) =>
      request.method === 'POST' &&
      request.url.includes(`/packages/${PACKAGE.toLowerCase()}`) &&
      request.url.includes(`_action=${action}`),
  );
}

/** The one create request: the POST whose body is a package document. */
function createOf(requests: readonly RecordedRequest[]): string {
  const bodies = requests
    .filter((request) => request.method === 'POST')
    .map((request) => request.data)
    .filter(
      (data): data is string =>
        typeof data === 'string' && data.includes('<pak:package'),
    );
  const [only] = bodies;
  assert.equal(bodies.length, 1, JSON.stringify(requests, null, 2));
  assert.ok(only !== undefined);
  return only;
}

describe('a top-level package: no super package', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;

  beforeEach(() => {
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

  const creates: ReadonlyArray<readonly [string, ToolArgs]> = [
    ['CreatePackage', { package_name: PACKAGE, transport_layer: 'ZLAYER' }],
    [
      'HandlerCreate',
      {
        object_type: 'PACKAGE',
        package_name: PACKAGE,
        transport_layer: 'ZLAYER',
      },
    ],
  ];

  for (const variant of VARIANTS) {
    for (const [tool, args] of creates) {
      it(`${tool} on ${variant}: the create is sent with an empty superPackage`, async () => {
        const { requests, answered } = await sent(tool, variant, args);
        assert.ok(answered.includes('"isError":false'), answered);
        const body = createOf(requests);
        assert.ok(body.includes('<pak:superPackage/>'), body);
        assert.ok(!body.includes('<pak:superPackage adtcore:name'), body);
      });
    }
  }

  const locks: ReadonlyArray<readonly [string, ToolArgs]> = [
    ['LockObjectLow', { object_type: 'package', object_name: PACKAGE }],
    ['HandlerLock', { object_type: 'PACKAGE', object_name: PACKAGE }],
  ];

  for (const variant of VARIANTS) {
    for (const [tool, args] of locks) {
      it(`${tool} on ${variant}: the LOCK is sent and its handle answered`, async () => {
        const { requests, answered } = await sent(tool, variant, args);
        assert.equal(withAction(requests, 'LOCK').length, 1, answered);
        assert.ok(answered.includes('"isError":false'), answered);
        assert.ok(answered.includes(HANDLE), answered);
      });
    }
  }

  const unlocks: ReadonlyArray<readonly [string, ToolArgs]> = [
    [
      'UnlockObjectLow',
      { object_type: 'package', object_name: PACKAGE, lock_handle: HANDLE },
    ],
    [
      'HandlerLock',
      {
        action: 'unlock',
        object_type: 'PACKAGE',
        object_name: PACKAGE,
        lock_handle: HANDLE,
      },
    ],
  ];

  for (const variant of VARIANTS) {
    for (const [tool, args] of unlocks) {
      it(`${tool} on ${variant}: the UNLOCK is sent`, async () => {
        const { requests, answered } = await sent(tool, variant, args);
        assert.equal(withAction(requests, 'UNLOCK').length, 1, answered);
        assert.ok(answered.includes('"isError":false'), answered);
      });
    }
  }
});
