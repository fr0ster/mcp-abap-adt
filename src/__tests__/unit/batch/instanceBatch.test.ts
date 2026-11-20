import assert from 'node:assert/strict';
import { describe, it, type Mock, mock } from 'node:test';
import type { AdtBatchConnection } from '@mcp-abap-adt/adt-clients';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { serverRefusalOf } from '../../../lib/auth/serverRefusal';
import {
  type BatchAnswer,
  InstanceBatch,
  type OpenBatch,
  type RecordedCall,
} from '../../../lib/batch/InstanceBatch';
import { LateBoundConnection } from '../../../lib/batch/lateBound';
import { InstanceState } from '../../../lib/state/InstanceState';

/** A batch connection that only counts what would be sent: the owner sends nothing. */
function fakeBatch(): {
  open: OpenBatch & { target: LateBoundConnection };
  execute: Mock<() => Promise<undefined>>;
} {
  const execute = mock.fn(async () => undefined);
  const connection = { execute } as unknown as AdtBatchConnection;
  return {
    open: { connection, target: new LateBoundConnection(), recorded: [] },
    execute,
  };
}

const answerOf = (n: number): BatchAnswer => ({
  number: n,
  content: [{ type: 'text', text: `answer ${n}` }],
});

/** A recorded call whose handler, resumed, answers `answer`; `runs` counts its resumptions. */
function callOf(answer: BatchAnswer, runs = { count: 0 }): RecordedCall {
  return {
    number: answer.number,
    parts: () => [],
    resume: async () => {
      runs.count += 1;
      return answer;
    },
  };
}

/** Ends `batch`'s open batch (or `ending`) with `answers` as its recorded calls. */
function endWith(
  batch: InstanceBatch,
  answers: BatchAnswer[],
  ending?: OpenBatch,
): void {
  const open = ending ?? batch.opened();
  open?.recorded.push(...answers.map((answer) => callOf(answer)));
  batch.end(ending);
}

const codeOf = (thrown: () => unknown): string | undefined => {
  try {
    thrown();
  } catch (error) {
    return serverRefusalOf(error)?.code;
  }
  return undefined;
};

describe('InstanceBatch — the per-instance owner of batch state', () => {
  it('numbers start at 1 and follow nextNumber calls', () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    batch.begin('communication', fakeBatch().open);
    assert.equal(batch.nextNumber(), 1);
    assert.equal(batch.nextNumber(), 2);
    assert.equal(batch.nextNumber(), 3);
    batch.end();
    batch.begin('debugger', fakeBatch().open);
    assert.equal(batch.nextNumber(), 1); // each batch counts from 1
  });

  it('holdsState is true while open or while answers are kept, false after drop', () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    assert.equal(batch.holdsState(), false);
    batch.begin('communication', fakeBatch().open);
    assert.equal(batch.holdsState(), true); // open, no answers
    endWith(batch, [answerOf(1)]);
    assert.equal(batch.mode(), 'off');
    assert.equal(batch.holdsState(), true); // closed, answers kept
    batch.drop();
    assert.equal(batch.holdsState(), false);
    // An executed empty batch keeps no answers.
    batch.begin('communication', fakeBatch().open);
    batch.end();
    assert.equal(batch.holdsState(), false);
  });

  it('holdsState reaches the instance state it is attached to', () => {
    const state = new InstanceState();
    const batch = new InstanceBatch({ keepRawParts: false });
    state.attach(batch);
    const seen: boolean[] = [];
    state.onChange(() => seen.push(state.holdsState()));
    batch.begin('communication', fakeBatch().open);
    endWith(batch, [answerOf(1)]);
    batch.drop();
    assert.deepStrictEqual(seen, [true, true, false]);
    void state.shutdown();
  });

  it('begin while a batch is open throws batch_mode_on / batch_mode_other by kind', () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    batch.begin('communication', fakeBatch().open);
    assert.equal(
      codeOf(() => batch.begin('communication', fakeBatch().open)),
      'batch_mode_on',
    );
    assert.equal(
      codeOf(() => batch.begin('debugger', fakeBatch().open)),
      'batch_mode_other',
    );
    assert.equal(batch.mode(), 'communication');
    batch.drop();
    batch.begin('debugger', fakeBatch().open);
    assert.equal(
      codeOf(() => batch.begin('debugger', fakeBatch().open)),
      'batch_mode_on',
    );
    assert.equal(
      codeOf(() => batch.begin('communication', fakeBatch().open)),
      'batch_mode_other',
    );
    assert.equal(batch.mode(), 'debugger');
  });

  it('nextNumber and signal with no batch open are refused batch_mode_off', () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    assert.equal(
      codeOf(() => batch.nextNumber()),
      'batch_mode_off',
    );
    assert.equal(
      codeOf(() => batch.signal()),
      'batch_mode_off',
    );
  });

  it('end replaces the map; its numbers stay readable until the next end', async () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    assert.equal(batch.answer(1), undefined);
    batch.begin('communication', fakeBatch().open);
    endWith(batch, [answerOf(1), answerOf(2)]);
    assert.deepStrictEqual(await batch.answer(1), answerOf(1));
    assert.deepStrictEqual(await batch.answer(2), answerOf(2));
    // Readable while the next batch is open, until its end.
    batch.begin('debugger', fakeBatch().open);
    assert.deepStrictEqual(await batch.answer(2), answerOf(2));
    endWith(batch, [{ ...answerOf(10), number: 1 }]);
    assert.deepStrictEqual(await batch.answer(1), {
      ...answerOf(10),
      number: 1,
    });
    assert.equal(batch.answer(2), undefined); // replaced, not merged
  });

  it('a number is resumed when first read, once: read again, it answers the same', async () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    const { open } = fakeBatch();
    const runs = { count: 0 };
    open.recorded.push(callOf(answerOf(1), runs));
    batch.begin('communication', open);
    batch.end(open);
    assert.equal(runs.count, 0); // the end resumes nothing
    const first = batch.answer(1);
    const second = batch.answer(1);
    assert.equal(second, first);
    assert.deepStrictEqual(await first, answerOf(1));
    assert.equal(runs.count, 1);
  });

  it("fail: no map, every recorded number answers the failure, the batch's signal aborted; a later fail of the same batch replaces the failure", async () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    const { open } = fakeBatch();
    const runs = { count: 0 };
    open.recorded.push(callOf(answerOf(1), runs), callOf(answerOf(2), runs));
    batch.begin('communication', open);
    const signal = batch.signal();
    const failure = {
      content: [{ type: 'text' as const, text: 'failed' }],
      isError: true,
    };
    batch.fail(failure, open);
    assert.equal(batch.mode(), 'off');
    assert.equal(signal.aborted, true);
    assert.deepStrictEqual(await batch.answer(2), { number: 2, ...failure });
    assert.equal(batch.answer(3), undefined);
    const answered = {
      content: [{ type: 'text' as const, text: 'as the dispatch answered' }],
      isError: true,
    };
    batch.fail(answered, open);
    assert.deepStrictEqual(await batch.answer(1), { number: 1, ...answered });
    assert.equal(runs.count, 0);
    assert.equal(batch.holdsState(), true);
  });

  it("replacing, dropping or disposing a map aborts its batch's signal: its handlers never read are let go", async () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    for (const ends of [
      'replace',
      'drop',
      'dispose',
      'debugger stop',
    ] as const) {
      const kind = ends === 'debugger stop' ? 'debugger' : 'communication';
      batch.begin(kind, fakeBatch().open);
      const signal = batch.signal();
      endWith(batch, [answerOf(1)]);
      assert.equal(signal.aborted, false);
      if (ends === 'replace') {
        batch.begin('communication', fakeBatch().open);
        batch.end();
      } else if (ends === 'drop') batch.drop();
      else if (ends === 'dispose') await batch.dispose();
      else batch.dropDebuggerAnswers();
      assert.equal(signal.aborted, true);
    }
  });

  it('dispose drops an open batch and the answers, sends nothing', async () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    const first = fakeBatch();
    batch.begin('communication', first.open);
    endWith(batch, [answerOf(1)]);
    const second = fakeBatch();
    batch.begin('communication', second.open);
    batch.nextNumber();
    assert.equal(batch.opened(), second.open);
    await batch.dispose();
    assert.equal(batch.mode(), 'off');
    assert.equal(batch.opened(), undefined);
    assert.equal(batch.answer(1), undefined);
    assert.equal(batch.holdsState(), false);
    assert.equal(first.execute.mock.callCount(), 0);
    assert.equal(second.execute.mock.callCount(), 0);
  });

  it('end after a drop leaves the dropped state: no answers re-installed, the target sealed', () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    const dropped = fakeBatch();
    batch.begin('communication', dropped.open);
    batch.drop();
    endWith(batch, [answerOf(1)], dropped.open);
    assert.equal(batch.mode(), 'off');
    assert.equal(batch.answer(1), undefined);
    assert.equal(batch.holdsState(), false);
    // Sealed: pointing it again changes nothing.
    dropped.open.target.point({} as never);
    assert.equal(dropped.open.target.getSessionId(), null);
  });

  it('end of a dropped batch does not end the batch begun since', () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    const dropped = fakeBatch();
    batch.begin('communication', dropped.open);
    batch.drop();
    const next = fakeBatch();
    batch.begin('communication', next.open);
    endWith(batch, [answerOf(1)], dropped.open);
    assert.equal(batch.mode(), 'communication');
    assert.equal(batch.opened(), next.open);
    assert.equal(batch.answer(1), undefined);
  });

  it('signal aborts on drop and dispose, not on an end that keeps the map', async () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    batch.begin('communication', fakeBatch().open);
    const ended = batch.signal();
    batch.end();
    assert.equal(ended.aborted, false);

    batch.begin('communication', fakeBatch().open);
    const dropped = batch.signal();
    assert.notEqual(dropped, ended); // each batch its own signal
    assert.equal(ended.aborted, false); // its map is still kept
    batch.drop();
    assert.equal(dropped.aborted, true);
    assert.equal(ended.aborted, true); // the drop let its map go too

    batch.begin('debugger', fakeBatch().open);
    const disposed = batch.signal();
    assert.equal(disposed.aborted, false);
    await batch.dispose();
    assert.equal(disposed.aborted, true);
  });

  it('keepRawParts is what the host gave', () => {
    assert.equal(new InstanceBatch({ keepRawParts: true }).keepRawParts, true);
    assert.equal(
      new InstanceBatch({ keepRawParts: false }).keepRawParts,
      false,
    );
  });
});

class Server extends BaseMcpServer {
  constructor(batch?: InstanceBatch) {
    super({
      name: 'batch-owner',
      stateLogger: { error() {} },
      ...(batch !== undefined && { batch }),
    });
  }
  owner(): InstanceBatch | undefined {
    return this.batch;
  }
}

describe('BaseMcpServer — the batch option', () => {
  it("is the host's owner, attached to the instance's state at construction", async () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    const server = new Server(batch);
    assert.equal(server.owner(), batch);
    assert.equal(server.holdsState(), false);
    batch.begin('communication', fakeBatch().open);
    assert.equal(server.holdsState(), true);
    const signal = batch.signal();
    await server.dispose(); // the state's undo drops the batch
    assert.equal(signal.aborted, true);
    assert.equal(server.holdsState(), false);
    await server.shutdownState();
  });

  it('absent: the instance has none', () => {
    assert.equal(new Server().owner(), undefined);
  });
});
