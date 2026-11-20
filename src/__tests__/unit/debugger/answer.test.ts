import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { debugAnswer, debugStateAnswer } from '../../../lib/debugger/answer';
import { DebugListenerError } from '../../../lib/debugger/DebugSession';
import {
  readAttach,
  readDebuggee,
  readStack,
} from '../../../lib/debugger/readings';
import { corpusBody } from '../../helpers/adtCorpus';
import { assertMatchObject } from '../../helpers/assertions';

describe('debug answers', () => {
  const view = { value: { a: 1, b: 2 }, raw: '<x/>' };
  it('terse by default; full parses; raw is the document', async () => {
    assert.deepStrictEqual(
      JSON.parse(
        (
          await debugAnswer(
            {},
            async () => view,
            (v) => ({ a: v.a }),
          )
        ).content[0].text,
      ),
      { a: 1 },
    );
    assert.deepStrictEqual(
      JSON.parse(
        (
          await debugAnswer(
            { detail: 'full' },
            async () => view,
            () => 0,
          )
        ).content[0].text,
      ),
      { a: 1, b: 2 },
    );
    assert.deepStrictEqual(
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
      { parsed: 2 },
    );
    assert.equal(
      (
        await debugAnswer(
          { detail: 'raw' },
          async () => view,
          () => 0,
        )
      ).content[0].text,
      '<x/>',
    );
  });
  it("a conflict is a tool error with SAP's message", async () => {
    const r = await debugStateAnswer({}, async () => {
      throw new DebugListenerError('Another debugger … SY 530');
    });
    assert.equal(r.isError, true);
    assert.ok(r.content[0].text.includes('SY 530'));
  });
  it('the handle survives every detail: merged under terse and full, a block of its own under raw', async () => {
    const view = { value: { state: 'listening' }, raw: '<x/>' };
    for (const detail of ['terse', 'full'] as const) {
      const r = await debugAnswer(
        { detail },
        async () => view,
        (v) => v,
        (v) => v,
        () => ({ state_handle: 'H' }),
      );
      assertMatchObject(JSON.parse(r.content[0].text), {
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
    assert.equal(raw.content[0].text, '<x/>');
    assert.deepStrictEqual(JSON.parse(raw.content[1].text), {
      state_handle: 'H',
    });
  });
  it('extra fields (handle, ids) join a state', async () => {
    const r = await debugStateAnswer(
      {},
      async () => ({ state: 'listening' }),
      () => ({ state_handle: 'H' }),
    );
    assert.deepStrictEqual(JSON.parse(r.content[0].text), {
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
    assertMatchObject(terse, {
      state: 'stopped',
      attach_impossible: true,
      is_post_mortem: true,
    });
    const full = JSON.parse(
      (await debugStateAnswer({ detail: 'full' }, work)).content[0].text,
    );
    assert.equal(full.stop.debuggee.attachImpossible, true);
    assert.equal(full.stop.attach.isPostMortem, true);
  });

  it('a terse stop names the settings in force and a settings failure', async () => {
    const SETTINGS_REFUSED = {
      message: 'Settings not allowed',
      origin: 'refusal',
      step: 'set settings',
      status: 403,
    };
    const STACK_REFUSED = {
      message: 'Stack not readable',
      origin: 'refusal',
      step: 'read stack',
    };
    const r = await debugStateAnswer({}, async () => ({
      state: 'stopped' as const,
      stop: {
        debuggee: readDebuggee(corpusBody('debugger-run-to-line--02-listen'))!,
        attach: readAttach(corpusBody('debugger-run-to-line--03-attach')),
        stack: readStack(corpusBody('debugger-run-to-line--04-stack')),
        raw: { debuggee: '', attach: '', stack: '' },
        settings: { systemDebugging: true },
        settingsError: SETTINGS_REFUSED,
        stackError: STACK_REFUSED,
      },
    }));
    const json = JSON.parse((r.content[0] as { text: string }).text);
    assert.deepStrictEqual(json.settings, { system_debugging: true });
    // Each failure in the shape of every other: the method's error as it is,
    // with its step — not text.
    assert.deepStrictEqual(json.settings_error, SETTINGS_REFUSED);
    assert.deepStrictEqual(json.stack_error, STACK_REFUSED);
  });
});
