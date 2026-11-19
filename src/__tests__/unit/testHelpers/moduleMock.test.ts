/**
 * The module-mock helper (`helpers/moduleMock.ts`): the real `mock.module`
 * on the line running it (the runner passes `--experimental-test-module-mocks`),
 * and the Node 22 path through an injected `mock.module` that, as Node 22's,
 * ignores `exports` and copies `namedExports` — CI runs Node 22 and 24, a
 * developer's machine may run neither.
 */
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  type ModuleLoader,
  type ModuleMocker,
  type ModuleMockOptions,
  mockModuleExports,
} from '../../helpers/moduleMock';

const ADT_CLIENTS = require.resolve('@mcp-abap-adt/adt-clients');

describe('on the running line', () => {
  it('replaces the named export, keeps the others real, restores the real module', () => {
    const real: typeof import('@mcp-abap-adt/adt-clients') =
      require(ADT_CLIENTS);
    const replacement = async () => undefined;
    const context = mockModuleExports(ADT_CLIENTS, {
      getSystemInformation: replacement,
    });
    try {
      const replaced: typeof import('@mcp-abap-adt/adt-clients') =
        require(ADT_CLIENTS);
      assert.equal(replaced.getSystemInformation, replacement);
      assert.equal(replaced.AdtRuntimeClient, real.AdtRuntimeClient);
    } finally {
      context.restore();
    }
    const after: typeof import('@mcp-abap-adt/adt-clients') =
      require(ADT_CLIENTS);
    assert.equal(after.getSystemInformation, real.getSystemInformation);
  });

  it('refuses an empty replacement', () => {
    assert.throws(
      () => mockModuleExports(ADT_CLIENTS, {}),
      /nothing to replace/,
    );
  });
});

/** A module registry and a `mock.module` over it that behaves as `line`'s. */
function fakeLine(line: 22 | 24, broken = false) {
  const REAL = { keep: 'real', swap: 'real' };
  let current: object = REAL;
  const restore = mock.fn(() => {
    current = REAL;
  });
  const mocker = mock.fn<ModuleMocker>(
    (_specifier: string, options: ModuleMockOptions) => {
      if (broken) current = {};
      else if (options.exports !== undefined)
        current = line === 24 ? options.exports : {};
      else current = { ...options.namedExports };
      return { restore };
    },
  );
  const load: ModuleLoader = () => current;
  return { mocker, load, restore, loaded: () => current };
}

describe('the line is read from what require answers', () => {
  it('Node 22: exports gives an empty module, so it is restored and namedExports used', () => {
    const line = fakeLine(22);
    mockModuleExports('/m.js', { swap: 'fake' }, line.mocker, line.load);
    assert.deepStrictEqual(
      line.mocker.mock.calls.map((call) => call.arguments[1]),
      [
        { exports: { keep: 'real', swap: 'fake' } },
        { namedExports: { keep: 'real', swap: 'fake' } },
      ],
    );
    assert.equal(line.restore.mock.callCount(), 1);
    assert.deepStrictEqual(line.loaded(), { keep: 'real', swap: 'fake' });
  });

  it('Node 24 and later: exports alone, nothing restored', () => {
    const line = fakeLine(24);
    mockModuleExports('/m.js', { swap: 'fake' }, line.mocker, line.load);
    assert.deepStrictEqual(
      line.mocker.mock.calls.map((call) => call.arguments[1]),
      [{ exports: { keep: 'real', swap: 'fake' } }],
    );
    assert.equal(line.restore.mock.callCount(), 0);
    assert.deepStrictEqual(line.loaded(), { keep: 'real', swap: 'fake' });
  });

  it('neither form replacing it: both restored and the helper throws', () => {
    const line = fakeLine(24, true);
    assert.throws(
      () =>
        mockModuleExports('/m.js', { swap: 'fake' }, line.mocker, line.load),
      /did not replace \/m\.js/,
    );
    assert.equal(line.mocker.mock.callCount(), 2);
    assert.equal(line.restore.mock.callCount(), 2);
  });
});
