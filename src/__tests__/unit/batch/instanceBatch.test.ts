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
  execute: jest.Mock;
} {
  const execute = jest.fn(async () => undefined);
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
    expect(batch.nextNumber()).toBe(1);
    expect(batch.nextNumber()).toBe(2);
    expect(batch.nextNumber()).toBe(3);
    batch.end();
    batch.begin('debugger', fakeBatch().open);
    expect(batch.nextNumber()).toBe(1); // each batch counts from 1
  });

  it('holdsState is true while open or while answers are kept, false after drop', () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    expect(batch.holdsState()).toBe(false);
    batch.begin('communication', fakeBatch().open);
    expect(batch.holdsState()).toBe(true); // open, no answers
    endWith(batch, [answerOf(1)]);
    expect(batch.mode()).toBe('off');
    expect(batch.holdsState()).toBe(true); // closed, answers kept
    batch.drop();
    expect(batch.holdsState()).toBe(false);
    // An executed empty batch keeps no answers.
    batch.begin('communication', fakeBatch().open);
    batch.end();
    expect(batch.holdsState()).toBe(false);
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
    expect(seen).toEqual([true, true, false]);
    void state.shutdown();
  });

  it('begin while a batch is open throws batch_mode_on / batch_mode_other by kind', () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    batch.begin('communication', fakeBatch().open);
    expect(codeOf(() => batch.begin('communication', fakeBatch().open))).toBe(
      'batch_mode_on',
    );
    expect(codeOf(() => batch.begin('debugger', fakeBatch().open))).toBe(
      'batch_mode_other',
    );
    expect(batch.mode()).toBe('communication');
    batch.drop();
    batch.begin('debugger', fakeBatch().open);
    expect(codeOf(() => batch.begin('debugger', fakeBatch().open))).toBe(
      'batch_mode_on',
    );
    expect(codeOf(() => batch.begin('communication', fakeBatch().open))).toBe(
      'batch_mode_other',
    );
    expect(batch.mode()).toBe('debugger');
  });

  it('nextNumber and signal with no batch open are refused batch_mode_off', () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    expect(codeOf(() => batch.nextNumber())).toBe('batch_mode_off');
    expect(codeOf(() => batch.signal())).toBe('batch_mode_off');
  });

  it('end replaces the map; its numbers stay readable until the next end', async () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    expect(batch.answer(1)).toBeUndefined();
    batch.begin('communication', fakeBatch().open);
    endWith(batch, [answerOf(1), answerOf(2)]);
    await expect(batch.answer(1)).resolves.toEqual(answerOf(1));
    await expect(batch.answer(2)).resolves.toEqual(answerOf(2));
    // Readable while the next batch is open, until its end.
    batch.begin('debugger', fakeBatch().open);
    await expect(batch.answer(2)).resolves.toEqual(answerOf(2));
    endWith(batch, [{ ...answerOf(10), number: 1 }]);
    await expect(batch.answer(1)).resolves.toEqual({
      ...answerOf(10),
      number: 1,
    });
    expect(batch.answer(2)).toBeUndefined(); // replaced, not merged
  });

  it('a number is resumed when first read, once: read again, it answers the same', async () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    const { open } = fakeBatch();
    const runs = { count: 0 };
    open.recorded.push(callOf(answerOf(1), runs));
    batch.begin('communication', open);
    batch.end(open);
    expect(runs.count).toBe(0); // the end resumes nothing
    const first = batch.answer(1);
    const second = batch.answer(1);
    expect(second).toBe(first);
    await expect(first).resolves.toEqual(answerOf(1));
    expect(runs.count).toBe(1);
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
    expect(batch.mode()).toBe('off');
    expect(signal.aborted).toBe(true);
    await expect(batch.answer(2)).resolves.toEqual({ number: 2, ...failure });
    expect(batch.answer(3)).toBeUndefined();
    const answered = {
      content: [{ type: 'text' as const, text: 'as the dispatch answered' }],
      isError: true,
    };
    batch.fail(answered, open);
    await expect(batch.answer(1)).resolves.toEqual({ number: 1, ...answered });
    expect(runs.count).toBe(0);
    expect(batch.holdsState()).toBe(true);
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
      expect(signal.aborted).toBe(false);
      if (ends === 'replace') {
        batch.begin('communication', fakeBatch().open);
        batch.end();
      } else if (ends === 'drop') batch.drop();
      else if (ends === 'dispose') await batch.dispose();
      else batch.dropDebuggerAnswers();
      expect(signal.aborted).toBe(true);
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
    expect(batch.opened()).toBe(second.open);
    await batch.dispose();
    expect(batch.mode()).toBe('off');
    expect(batch.opened()).toBeUndefined();
    expect(batch.answer(1)).toBeUndefined();
    expect(batch.holdsState()).toBe(false);
    expect(first.execute).not.toHaveBeenCalled();
    expect(second.execute).not.toHaveBeenCalled();
  });

  it('end after a drop leaves the dropped state: no answers re-installed, the target sealed', () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    const dropped = fakeBatch();
    batch.begin('communication', dropped.open);
    batch.drop();
    endWith(batch, [answerOf(1)], dropped.open);
    expect(batch.mode()).toBe('off');
    expect(batch.answer(1)).toBeUndefined();
    expect(batch.holdsState()).toBe(false);
    // Sealed: pointing it again changes nothing.
    dropped.open.target.point({} as never);
    expect(dropped.open.target.getSessionId()).toBeNull();
  });

  it('end of a dropped batch does not end the batch begun since', () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    const dropped = fakeBatch();
    batch.begin('communication', dropped.open);
    batch.drop();
    const next = fakeBatch();
    batch.begin('communication', next.open);
    endWith(batch, [answerOf(1)], dropped.open);
    expect(batch.mode()).toBe('communication');
    expect(batch.opened()).toBe(next.open);
    expect(batch.answer(1)).toBeUndefined();
  });

  it('signal aborts on drop and dispose, not on an end that keeps the map', async () => {
    const batch = new InstanceBatch({ keepRawParts: false });
    batch.begin('communication', fakeBatch().open);
    const ended = batch.signal();
    batch.end();
    expect(ended.aborted).toBe(false);

    batch.begin('communication', fakeBatch().open);
    const dropped = batch.signal();
    expect(dropped).not.toBe(ended); // each batch its own signal
    expect(ended.aborted).toBe(false); // its map is still kept
    batch.drop();
    expect(dropped.aborted).toBe(true);
    expect(ended.aborted).toBe(true); // the drop let its map go too

    batch.begin('debugger', fakeBatch().open);
    const disposed = batch.signal();
    expect(disposed.aborted).toBe(false);
    await batch.dispose();
    expect(disposed.aborted).toBe(true);
  });

  it('keepRawParts is what the host gave', () => {
    expect(new InstanceBatch({ keepRawParts: true }).keepRawParts).toBe(true);
    expect(new InstanceBatch({ keepRawParts: false }).keepRawParts).toBe(false);
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
    expect(server.owner()).toBe(batch);
    expect(server.holdsState()).toBe(false);
    batch.begin('communication', fakeBatch().open);
    expect(server.holdsState()).toBe(true);
    const signal = batch.signal();
    await server.dispose(); // the state's undo drops the batch
    expect(signal.aborted).toBe(true);
    expect(server.holdsState()).toBe(false);
    await server.shutdownState();
  });

  it('absent: the instance has none', () => {
    expect(new Server().owner()).toBeUndefined();
  });
});
