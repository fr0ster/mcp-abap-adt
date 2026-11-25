/**
 * The compact transport tools, live, on requests and objects of the test's
 * own. Each request is created by HandlerTransportCreate with a unique
 * description (`prepareRequestCreate`), recorded at once
 * (`reconcileRequestCreate`), read back with the one task SAP created with
 * it, which the tool types S (SAP creates it Unclassified, and an
 * Unclassified task refuses edits). Its target is the configured request's
 * (read only), none where none is configured: a move between requests of
 * different targets is refused (measured, `TransportObjectToolsCrud.test.ts`).
 *
 * - **Both systems:** HandlerTransportCreate creates a request,
 *   ListTransports lists the session user's modifiable requests by SAP's
 *   query (no saved search configuration), the request just created among
 *   them, and HandlerTransportSortAndCompress sorts and compresses the
 *   new request's task. On
 *   premise the task holds an own interface's entry (the package has a
 *   transport layer, so SAP records it there), still held once after. The
 *   cloud trial has only ZLOCAL packages and SAP records no local object on
 *   a request, so its task is empty and SAP's acceptance is asserted.
 * - **On premise only:** HandlerTransportMoveObjects moves an own
 *   interface's entry between the tasks of two own requests (SAP refuses a
 *   move between two tasks of one request, TR 717), both tasks read again.
 *   The cloud side is a reason row of the ledger (`CLOUD_MOVE_REASON`).
 *
 * - **`HandlerSystem` `transports`, both systems, read only:** the session
 *   user's modifiable requests, through the server's dispatch
 *   (`throughServer`), with `background: false` in the call and without
 *   `background` as a run read once with `HandlerBackgroundRunGet`.
 *
 * No request is ever released. Each suite's cleanup (`deleteRecordedRequests`)
 * deletes its interface (read absent), takes its entries off the test's
 * requests, and deletes the tasks and requests, each read absent; the
 * configured request and every other user's are not touched.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, describe, it } from 'node:test';
import {
  configuredSystemKind,
  resolvePackageName,
  resolveTransportRequest,
} from '../helpers/configHelpers';
import {
  deleteRecordedRequests,
  expectAbsent,
  expectNameFree,
  type LiveAnswer,
  liveCall,
  livePrepare,
  liveSuite,
  prepareRequestCreate,
  type RequestCreatePlan,
  reconcileRequestCreate,
  recordCreated,
  recordCreatedRequest,
  throughServer,
} from '../helpers/live';
import { member, payloadOf, succeeded } from './ownObjects';
import { finishedRun, startedRun } from './systemRuns';

const SUFFIX = randomBytes(2).toString('hex').toUpperCase();
/** The interface the sort case's task holds (on premise). */
const SORTED = `ZIF_MCP_TS${SUFFIX}`;
/** The interface whose entry is moved (on premise). */
const MOVED = `ZIF_MCP_TM${SUFFIX}`;

/** Why the move has no live case on the cloud system (the ledger's reason row). */
const CLOUD_MOVE_REASON =
  "the cloud trial has only ZLOCAL packages; SAP records no local object on a request (TRINT_APPEND_TO_COMM_ARRAYS: 'Local object is edited without a request')";

/** The packages a run may create in: transportable on premise, ZLOCAL on the cloud. */
const ACCEPTED: Readonly<Record<'onprem' | 'cloud', string>> = {
  onprem: 'ZAC_TEST_PKG',
  cloud: 'ZADT_BLD_PKG03',
};

/** The configured package, checked to be the transportable one of the system. */
function transportablePackage(): string {
  const kind = configuredSystemKind();
  if (kind !== 'onprem' && kind !== 'cloud') {
    throw new Error('the test config states no system kind');
  }
  const accepted = ACCEPTED[kind];
  if (resolvePackageName().toUpperCase() !== accepted) {
    throw new Error(`the package is not ${accepted}: nothing is created`);
  }
  return accepted;
}

/** A request's tasks, by number, as GetTransport answers them. */
async function tasksOf(request: string): Promise<string[]> {
  const read = succeeded(
    `GetTransport ${request}`,
    await livePrepare('GetTransport', { transport_number: request }),
  );
  const tasks = member(payloadOf(read), 'tasks');
  return Array.isArray(tasks)
    ? tasks
        .map((task) => member(task, 'number'))
        .filter((number): number is string => typeof number === 'string')
    : [];
}

/** An object's entries on a task: their type and position. */
async function entriesOn(
  task: string,
  name: string,
): Promise<Array<{ type: string; position: string; pgmid: string }>> {
  const read = succeeded(
    `ReadTransportObjects ${task}`,
    await livePrepare('ReadTransportObjects', {
      transport_number: task,
      detail: 'medium',
    }),
  );
  const objects = member(payloadOf(read), 'objects');
  return (Array.isArray(objects) ? objects : []).flatMap((object) => {
    const type = member(object, 'type');
    const position = member(object, 'position');
    const pgmid = member(object, 'pgmid');
    return member(object, 'name') === name && typeof type === 'string'
      ? [
          {
            type,
            position: typeof position === 'string' ? position : '',
            pgmid: typeof pgmid === 'string' ? pgmid : '',
          },
        ]
      : [];
  });
}

/**
 * The configured request's target, as `target_system` takes it: SAP keeps a
 * transport layer's target as `/<name>/`. A read only; none when no request
 * is configured.
 */
async function configuredTarget(): Promise<string> {
  const configured = resolveTransportRequest();
  if (configured === undefined) return '';
  const read = succeeded(
    'GetTransport of the configured request',
    await livePrepare('GetTransport', { transport_number: configured }),
  );
  const kept = member(member(payloadOf(read), 'transport'), 'target_system');
  const target = typeof kept === 'string' ? kept.trim() : '';
  return target.length > 2 && target.startsWith('/') && target.endsWith('/')
    ? target.slice(1, -1)
    : target;
}

/** A request of the test's own and its one task. */
interface OwnRequest {
  readonly request: string;
  readonly task: string;
}

/** HandlerTransportCreate's arguments for a request of the test's own. */
const createArgs = (description: string, target: string) => ({
  description,
  transport_type: 'workbench',
  ...(target === '' ? {} : { target_system: target }),
});

/**
 * After HandlerTransportCreate: the request recorded at once
 * (`reconcileRequestCreate`), read back with its description and its one
 * task, typed S. The task is recorded after its request: it is deleted
 * first.
 */
async function ownRequest(
  plan: RequestCreatePlan,
  created: LiveAnswer,
): Promise<OwnRequest> {
  await reconcileRequestCreate(plan, created);
  // The terse answer states the numbers, and a task_type_error only when
  // the task could not be typed as asked (S, Development/Correction).
  const answered = payloadOf(created);
  assert.equal(
    typeof member(answered, 'transport_number'),
    'string',
    created.text,
  );
  assert.notEqual(member(answered, 'transport_number'), '', created.text);
  assert.equal(member(answered, 'task_type_error'), undefined, created.text);
  const request = member(answered, 'transport_number');
  if (typeof request !== 'string') throw new Error('no request number');
  const read = succeeded(
    `GetTransport ${request}`,
    await livePrepare('GetTransport', { transport_number: request }),
  );
  assert.equal(
    member(member(payloadOf(read), 'transport'), 'description'),
    plan.description,
    read.text,
  );
  const tasks = await tasksOf(request);
  assert.equal(tasks.length, 1, `${request} holds ${tasks.length} tasks`);
  const [task] = tasks;
  if (task === undefined) throw new Error(`${request} holds no task`);
  assert.equal(member(answered, 'task_number'), task);
  recordCreatedRequest(task);
  return { request, task };
}

/**
 * Creates an interface of the test's own on `request` (its name read free
 * first, its delete recorded before the create): on premise the package has
 * a transport layer, so SAP records its one entry on the request's task.
 * Answers the delete's arguments, whose request follows the entry.
 */
async function ownInterface(
  name: string,
  request: string,
): Promise<{ interface_name: string; transport_request: string }> {
  await expectNameFree({
    tool: 'GetInterface',
    args: { interface_name: name },
  });
  const deleteArgs = { interface_name: name, transport_request: request };
  recordCreated('DeleteInterface', deleteArgs);
  succeeded(
    'CreateInterface',
    await livePrepare('CreateInterface', {
      interface_name: name,
      package_name: transportablePackage(),
      description: 'MCP compact transport live case',
      transport_request: request,
    }),
  );
  succeeded(
    'UpdateInterface',
    await livePrepare('UpdateInterface', {
      interface_name: name,
      source_code: `INTERFACE ${name.toLowerCase()} PUBLIC.\nENDINTERFACE.`,
      transport_request: request,
    }),
  );
  return deleteArgs;
}

/** The cleanup: the objects, their entries, the tasks and requests, each read absent. */
async function cleanUp(names: readonly string[]): Promise<void> {
  await deleteRecordedRequests();
  for (const name of names) {
    await expectAbsent({
      tool: 'GetInterface',
      args: { interface_name: name },
    });
  }
}

liveSuite(['onprem', 'cloud'], 'Compact transports', () => {
  const own: OwnRequest[] = [];
  after(async () => {
    await cleanUp(configuredSystemKind() === 'onprem' ? [SORTED] : []);
  });

  it('HandlerTransportCreate creates a request of the test own and types its task', async () => {
    transportablePackage();
    const plan = await prepareRequestCreate();
    const target = await configuredTarget();
    // An empty target_system is LOCAL, as an absent one.
    const created = await liveCall('HandlerTransportCreate', {
      description: plan.description,
      transport_type: 'workbench',
      target_system: target,
    });
    own.push(await ownRequest(plan, created));
  });

  it("ListTransports lists the session user's modifiable requests, the one just created among them", async () => {
    const answered = await liveCall('ListTransports', { detail: 'medium' });
    const listed = payloadOf(succeeded('ListTransports', answered));
    assert.equal(member(listed, 'success'), true);
    const transports = member(listed, 'transports');
    if (!Array.isArray(transports)) throw new Error('no transports list');
    assert.equal(member(listed, 'count'), transports.length);
    const numbers = transports.map((transport) => member(transport, 'number'));
    for (const created of own) {
      assert.ok(
        numbers.includes(created.request),
        `the request ${created.request} created by this suite is not listed`,
      );
    }
    for (const transport of transports) {
      const number = member(transport, 'number');
      assert.equal(typeof number, 'string');
      // Modifiable only (the default): D or L, or a status SAP left unstated.
      const status = member(transport, 'status');
      assert.ok(
        status === undefined || ['', 'D', 'L'].includes(String(status)),
        `${String(number)} has status ${String(status)}`,
      );
    }
  });

  it('HandlerTransportSortAndCompress sorts and compresses the task of the test own', async () => {
    const [mine] = own;
    if (mine === undefined) throw new Error('no request was created');
    // On premise the task holds an own interface's entry; the cloud system
    // records no object on a request (only ZLOCAL packages), so there the
    // task is empty, and SAP's acceptance on it is what is asserted.
    if (configuredSystemKind() === 'onprem') {
      await ownInterface(SORTED, mine.request);
      assert.equal((await entriesOn(mine.task, SORTED)).length, 1);
    }
    const sorted = await liveCall('HandlerTransportSortAndCompress', {
      transport_number: mine.task,
    });
    assert.equal(
      member(
        payloadOf(succeeded('HandlerTransportSortAndCompress', sorted)),
        'accepted',
      ),
      true,
      sorted.text,
    );
    if (configuredSystemKind() === 'onprem') {
      assert.equal((await entriesOn(mine.task, SORTED)).length, 1);
    }
  });
});

liveSuite(['onprem'], 'Compact transport create with a typed task', () => {
  after(async () => {
    await cleanUp([]);
  });

  it('HandlerCreate TRANSPORT gives the task SAP creates with the request the type task_type asks (R)', async () => {
    transportablePackage();
    const plan = await prepareRequestCreate();
    const target = await configuredTarget();
    // An empty target_system is LOCAL, as an absent one. HandlerCreate's
    // members are no ledger keys: the call is made, its key not recorded.
    const created = await livePrepare('HandlerCreate', {
      object_type: 'TRANSPORT',
      description: plan.description,
      transport_type: 'workbench',
      target_system: target,
      task_type: 'R',
      // The task type read below: the JSON of detail medium.
      detail: 'medium',
    });
    await reconcileRequestCreate(plan, created);
    const answered = payloadOf(created);
    assert.equal(member(answered, 'task_type'), 'R', created.text);
    const request = member(answered, 'transport_number');
    if (typeof request !== 'string') throw new Error('no request number');
    const task = member(answered, 'task_number');
    if (typeof task !== 'string') throw new Error('no task number');
    recordCreatedRequest(task);
    // Read back: the request's one task, of type R — GetTransport names it
    // Repair (measured on premise).
    const read = succeeded(
      `GetTransport ${request}`,
      await livePrepare('GetTransport', { transport_number: request }),
    );
    const tasks = member(payloadOf(read), 'tasks');
    const listed = Array.isArray(tasks) ? tasks : [];
    assert.deepEqual(
      listed.map((entry) => [member(entry, 'number'), member(entry, 'type')]),
      [[task, 'Repair']],
      read.text,
    );
  });
});

liveSuite(
  ['onprem'],
  `Compact transport move (cloud: ${CLOUD_MOVE_REASON})`,
  () => {
    after(async () => {
      await cleanUp([MOVED]);
    });

    it('HandlerTransportMoveObjects moves the entry of an own interface to the task of another own request', async () => {
      // Two requests: SAP refuses a move between two tasks of one request (TR 717).
      const target = await configuredTarget();
      const sourcePlan = await prepareRequestCreate();
      const source = await ownRequest(
        sourcePlan,
        await livePrepare(
          'HandlerTransportCreate',
          createArgs(sourcePlan.description, target),
        ),
      );
      const destinationPlan = await prepareRequestCreate();
      const destination = await ownRequest(
        destinationPlan,
        await livePrepare(
          'HandlerTransportCreate',
          createArgs(destinationPlan.description, target),
        ),
      );
      const deleteArgs = await ownInterface(MOVED, source.request);
      const held = await entriesOn(source.task, MOVED);
      assert.equal(held.length, 1, `the interface has ${held.length} entries`);
      const [entry] = held;
      if (entry === undefined || entry.position === '') {
        throw new Error('the entry has no position');
      }
      const moved = await liveCall('HandlerTransportMoveObjects', {
        transport_number: source.task,
        target_number: destination.task,
        objects: [
          {
            object_name: MOVED,
            object_type: entry.type,
            position: entry.position,
            ...(entry.pgmid === '' ? {} : { pgmid: entry.pgmid }),
          },
        ],
      });
      // The entry is where the move left it: the delete goes on that request.
      if (!moved.isError) deleteArgs.transport_request = destination.request;
      assert.equal(
        member(
          payloadOf(succeeded('HandlerTransportMoveObjects', moved)),
          'accepted',
        ),
        true,
        moved.text,
      );
      assert.equal((await entriesOn(source.task, MOVED)).length, 0);
      assert.equal((await entriesOn(destination.task, MOVED)).length, 1);
    });
  },
);

/** A listing of the session user's modifiable requests: its count, each number, each status D, L or unstated. */
function expectModifiableListing(answer: LiveAnswer): void {
  const listed = payloadOf(succeeded('HandlerSystem transports', answer));
  assert.equal(member(listed, 'success'), true, answer.text);
  const transports = member(listed, 'transports');
  if (!Array.isArray(transports)) throw new Error('no transports list');
  assert.equal(member(listed, 'count'), transports.length);
  for (const transport of transports) {
    const number = member(transport, 'number');
    assert.equal(typeof number, 'string');
    const status = member(transport, 'status');
    assert.ok(
      status === undefined || ['', 'D', 'L'].includes(String(status)),
      `${String(number)} has status ${String(status)}`,
    );
  }
}

liveSuite(['onprem', 'cloud'], 'HandlerSystem transports', () => {
  describe('through the server', () => {
    throughServer();

    it('background false lists the modifiable requests in the call', async () => {
      const answer = await liveCall('HandlerSystem', {
        action: 'transports',
        background: false,
        // The fields read below: the JSON of detail medium.
        detail: 'medium',
      });
      expectModifiableListing(answer);
    });

    it('without background it starts a run, whose answer HandlerBackgroundRunGet reads once', async () => {
      const started = await liveCall('HandlerSystem', {
        action: 'transports',
        detail: 'medium',
      });
      expectModifiableListing(await finishedRun(startedRun(started)));
    });
  });
});
