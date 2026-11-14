/**
 * A YAML timestamp reaches a parameter's reader as text. The file is typed
 * at the parse (`loadYamlConfig`), so the test goes through it: js-yaml 5's
 * default (core) schema has no timestamp tag, so the reader gets the text as
 * written; a `Date` the parse were handed would be its ISO text — what JSON
 * writes for it ({@link jsonValueOf}), as a thrown carrier's `Date` reads in
 * an answer (`answerValueOf`).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  type Parameter,
  type ParameterTable,
  readParameters,
} from '../../../lib/config/authParameters';
import { loadYamlConfig } from '../../../lib/config/yamlConfig';
import { type JsonValue, jsonValueOf } from '../../../lib/json';

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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaml-date-'));
    const file = path.join(dir, 'config.yaml');
    fs.writeFileSync(file, 'schedule:\n  when: 2026-11-14T07:00:00Z\n');
    let yaml: ReturnType<typeof loadYamlConfig>;
    try {
      yaml = loadYamlConfig(table, file);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    // The load validates the file against the table: the reader sees it once there.
    expect(seen).toEqual(['2026-11-14T07:00:00Z']);
    seen.length = 0;
    const read = readParameters(table, [], {}, yaml);
    if (seen[0] !== '2026-11-14T07:00:00Z') {
      process.stderr.write(
        `the reader got ${JSON.stringify(seen)}, answered ${JSON.stringify(read)}\n`,
      );
    }
    expect(seen).toEqual(['2026-11-14T07:00:00Z']);
    expect(read).toEqual({ when: '2026-11-14T07:00:00Z' });
  });

  it('a Date handed to the parse is its ISO text', () => {
    expect(
      jsonValueOf({ schedule: { when: new Date('2026-11-14T07:00:00Z') } }),
    ).toEqual({ schedule: { when: '2026-11-14T07:00:00.000Z' } });
  });
});
