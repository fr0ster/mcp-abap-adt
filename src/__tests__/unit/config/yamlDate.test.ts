/**
 * A YAML timestamp, which the YAML parser hands over as a `Date`, reaches a
 * parameter's reader as its ISO text — what JSON writes for it, as a
 * thrown carrier's `Date` reads in an answer (`answerValueOf`).
 */
import {
  type Parameter,
  type ParameterTable,
  readParameters,
} from '../../../lib/config/authParameters';
import type { JsonValue } from '../../../lib/json';

describe('a YAML value is read as JSON writes it', () => {
  it('a timestamp reaches the reader as its ISO text', () => {
    const seen: JsonValue[] = [];
    const row: Parameter = {
      key: 'when',
      cli: '--when',
      yaml: 'schedule.when',
      kind: 'custom',
      parse: (raw) => {
        seen.push(raw);
        return typeof raw === 'string' ? raw : 'not text';
      },
      section: 'Test',
      help: 'A timestamp.',
    };
    const table: ParameterTable = {
      program: 'test',
      rows: [row],
      removed: [],
    };
    const read = readParameters(
      table,
      [],
      {},
      {
        schedule: { when: new Date('2026-11-14T07:00:00Z') },
      },
    );
    if (seen[0] !== '2026-11-14T07:00:00.000Z') {
      process.stderr.write(
        `the reader got ${JSON.stringify(seen)}, answered ${JSON.stringify(read)}\n`,
      );
    }
    expect(seen).toEqual(['2026-11-14T07:00:00.000Z']);
    expect(read).toEqual({ when: '2026-11-14T07:00:00.000Z' });
  });
});
