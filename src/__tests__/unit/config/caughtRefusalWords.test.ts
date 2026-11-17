/**
 * A caught refusal's words are passed on as the inline conditional did:
 * `refusal !== undefined ? refusal.words : fallback`. A refusal whose words
 * were set to `undefined` hands `undefined` on; only a value that is no
 * refusal takes the fixed words.
 */
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  ParameterRefusal,
  type ParameterTable,
  readParameters,
  STATE_IDLE_ROW,
  validateYamlParameters,
} from '../../../lib/config/authParameters';
import * as idleBound from '../../../lib/state/idleBound';

/** A refusal whose `words` were defined as `undefined`. */
function refusalWithoutWords(): ParameterRefusal {
  const refusal = new ParameterRefusal('said');
  Object.defineProperty(refusal, 'words', { value: undefined });
  return refusal;
}

/** A table of one custom row whose parser throws `thrown`. */
function throwingTable(thrown: unknown): ParameterTable {
  return {
    program: 'probe',
    removed: [],
    rows: [
      {
        key: 'probe',
        cli: '--probe',
        yaml: 'probe',
        kind: 'custom',
        section: 'OPTIONS',
        help: 'A probe.',
        parse: () => {
          throw thrown;
        },
      },
    ],
  };
}

/** The refusal `work` throws. */
function refusalOf(work: () => void): ParameterRefusal {
  try {
    work();
  } catch (error) {
    if (error instanceof ParameterRefusal) return error;
    throw error;
  }
  assert.fail('no refusal was thrown');
}

describe('a caught refusal hands its own words on', () => {
  it('a row read from the command line', () => {
    const table = (thrown: unknown) => throwingTable(thrown);
    assert.equal(
      refusalOf(() =>
        readParameters(table(refusalWithoutWords()), ['--probe', 'x'], {}),
      ).words,
      undefined,
    );
    assert.equal(
      refusalOf(() =>
        readParameters(
          table(new ParameterRefusal('own')),
          ['--probe', 'x'],
          {},
        ),
      ).words,
      'own',
    );
    assert.equal(
      refusalOf(() =>
        readParameters(table(new Error('other')), ['--probe', 'x'], {}),
      ).words,
      'Invalid --probe',
    );
  });

  it('a config file checked against the table', () => {
    assert.deepEqual(
      validateYamlParameters(throwingTable(refusalWithoutWords()), {
        probe: 'x',
      }),
      [undefined],
    );
    assert.deepEqual(
      validateYamlParameters(throwingTable(new Error('other')), { probe: 'x' }),
      ['Invalid probe (config file)'],
    );
  });

  it("the state-idle row hands its reader's message on", () => {
    const silent = new Error('said');
    Object.defineProperty(silent, 'message', { value: undefined });
    const reader = mock.method(idleBound, 'parseStateIdleMinutes', () => {
      throw silent;
    });
    try {
      const parse = STATE_IDLE_ROW.parse;
      assert.ok(parse !== undefined);
      assert.equal(
        refusalOf(() => parse('x', '--state-idle-minutes')).words,
        undefined,
      );
    } finally {
      reader.mock.restore();
    }
  });
});
