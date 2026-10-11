import { corpusBody } from '../../../lib/adtCorpus';
import { debugAnswer, debugStateAnswer } from '../../../lib/debugger/answer';
import { DebugListenerError } from '../../../lib/debugger/DebugSession';
import {
  readAttach,
  readDebuggee,
  readStack,
} from '../../../lib/debugger/readings';

describe('debug answers', () => {
  const view = { value: { a: 1, b: 2 }, raw: '<x/>' };
  it('terse by default; full parses; raw is the document', async () => {
    expect(
      JSON.parse(
        (
          await debugAnswer(
            {},
            async () => view,
            (v) => ({ a: v.a }),
          )
        ).content[0].text,
      ),
    ).toEqual({ a: 1 });
    expect(
      JSON.parse(
        (
          await debugAnswer(
            { detail: 'full' },
            async () => view,
            () => 0,
          )
        ).content[0].text,
      ),
    ).toEqual({ a: 1, b: 2 });
    expect(
      JSON.parse(
        (
          await debugAnswer(
            { detail: 'full' },
            async () => view,
            () => 0,
            (v) => ({ parsed: v.b }),
          )
        ).content[0].text,
      ),
    ).toEqual({ parsed: 2 });
    expect(
      (
        await debugAnswer(
          { detail: 'raw' },
          async () => view,
          () => 0,
        )
      ).content[0].text,
    ).toBe('<x/>');
  });
  it("a conflict is a tool error with SAP's message", async () => {
    const r = await debugStateAnswer({}, async () => {
      throw new DebugListenerError('Another debugger … SY 530');
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('SY 530');
  });
  it('the handle survives every detail: merged under terse and full, a block of its own under raw', async () => {
    const view = { value: { state: 'listening' }, raw: '<x/>' };
    for (const detail of ['terse', 'full']) {
      const r = await debugAnswer(
        { detail },
        async () => view,
        (v) => v,
        (v) => v,
        () => ({ state_handle: 'H' }),
      );
      expect(JSON.parse(r.content[0].text)).toMatchObject({
        state_handle: 'H',
      });
    }
    const raw = await debugAnswer(
      { detail: 'raw' },
      async () => view,
      (v) => v,
      (v) => v,
      () => ({ state_handle: 'H' }),
    );
    expect(raw.content[0].text).toBe('<x/>');
    expect(JSON.parse(raw.content[1].text)).toEqual({ state_handle: 'H' });
  });
  it('extra fields (handle, ids) join a state', async () => {
    const r = await debugStateAnswer(
      {},
      async () => ({ state: 'listening' }),
      () => ({ state_handle: 'H' }),
    );
    expect(JSON.parse(r.content[0].text)).toEqual({
      state: 'listening',
      state_handle: 'H',
    });
  });
  it('a stop answer names the flags SAP raised under terse and carries them all under full (debugger-run-to-line--02-listen, --03-attach, --04-stack)', async () => {
    const stop = {
      debuggee: readDebuggee(
        corpusBody('debugger-run-to-line--02-listen').replace(
          '<IS_ATTACH_IMPOSSIBLE>false<',
          '<IS_ATTACH_IMPOSSIBLE>true<',
        ),
      )!,
      attach: readAttach(
        corpusBody('debugger-run-to-line--03-attach').replace(
          'isPostMortem="false"',
          'isPostMortem="true"',
        ),
      ),
      stack: readStack(corpusBody('debugger-run-to-line--04-stack')),
      raw: { debuggee: '', attach: '', stack: '' },
    };
    const work = async () => ({ state: 'stopped' as const, stop });
    const terse = JSON.parse(
      (await debugStateAnswer({}, work)).content[0].text,
    );
    expect(terse).toMatchObject({
      state: 'stopped',
      attach_impossible: true,
      is_post_mortem: true,
    });
    const full = JSON.parse(
      (await debugStateAnswer({ detail: 'full' }, work)).content[0].text,
    );
    expect(full.stop.debuggee.attachImpossible).toBe(true);
    expect(full.stop.attach.isPostMortem).toBe(true);
  });
});
