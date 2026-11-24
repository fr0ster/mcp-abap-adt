/**
 * Plan step 10.8a: the vector checks of meaning (`meaning.ts`) over every
 * assembled tool of the full and compact sets, through the local Ollama
 * (`ollama.ts`): its description, and its name in words, must each rank its
 * own function (purpose and facts) first among every tool's. Failures are
 * compared with the recorded baseline (`meaningBaseline.json`, per model):
 * a new one fails, and so does a recorded one that no longer fails. A model
 * the Ollama does not serve skips with its reason. In CI the job
 * `meaning-vectors` runs this file with `bge-m3` (its prefixes, none, and the CPU
 * from `MODELS`).
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { before, describe, it } from 'node:test';
import { partsOfDescription } from '../../../lib/description';
import { repositoryRoot } from '../../helpers/repoRoot';
import { type ServedTool, servedCatalog, setOf } from './catalog';
import {
  baselineFaults,
  type MeaningBaseline,
  nameWords,
  rankFailures,
} from './meaning';
import { embed, MODELS, OLLAMA_URL, servedModels } from './ollama';

const BASELINE_FILE = path.join(
  repositoryRoot(__dirname),
  'src',
  '__tests__',
  'unit',
  'descriptions',
  'meaningBaseline.json',
);

describe('the meaning checks themselves', () => {
  it('turns a name into words: case changes, underscores, digits', () => {
    assert.equal(nameWords('GetPackageContents'), 'get package contents');
    assert.equal(nameWords('GetATCResult'), 'get atc result');
    assert.equal(nameWords('ActivateObjectLow'), 'activate object low');
    assert.equal(nameWords('Read_Table2Rows'), 'read table 2 rows');
    assert.equal(nameWords('HandlerGet', 'class'), 'handler get class');
  });

  it('fails a query whose own function is not strictly nearest, naming the nearer tool', () => {
    const functions = [
      { tool: 'A', vector: [1, 0] },
      { tool: 'B', vector: [0, 1] },
    ];
    assert.deepStrictEqual(
      rankFailures('description', [{ tool: 'A', vector: [1, 0.1] }], functions),
      [],
    );
    assert.deepStrictEqual(
      rankFailures('name', [{ tool: 'A', vector: [0.1, 1] }], functions),
      [{ tool: 'A', check: 'name', confusedWith: 'B' }],
    );
    // A tie is a failure: the own function must be strictly nearest.
    assert.deepStrictEqual(
      rankFailures('name', [{ tool: 'A', vector: [1, 1] }], functions),
      [{ tool: 'A', check: 'name', confusedWith: 'B' }],
    );
  });

  it('fails a new failure, and a recorded one that no longer fails', () => {
    const recorded = { tool: 'A', check: 'name' as const, confusedWith: 'B' };
    assert.deepStrictEqual(baselineFaults([recorded], [recorded]), []);
    assert.deepStrictEqual(baselineFaults([recorded], []), ['new: name A ~ B']);
    assert.deepStrictEqual(baselineFaults([], [recorded]), [
      'resolved, still in the baseline: name A ~ B',
    ]);
  });
});

const served = servedModels();
const only = process.env.MEANING_MODELS?.split(',');
/** The model a run requires (CI): an Ollama that cannot serve it fails, never skips. */
const required = process.env.MEANING_REQUIRED;

/**
 * Whether the checks mean anything yet: they rank assembled tools, and the
 * first are assembled in group (2) of plan step 10.7, which sets this.
 */
const MEANING_LIVE = false;

/** The fewest tools a ranking among them says something about. */
const MEANING_FEWEST = 10;

describe('description and name against function, through the local Ollama', () => {
  let tools: ServedTool[] = [];
  before(async () => {
    // The union of what onprem and cloud serve: a tool on one only (the
    // cloud's abapGit reads) is ranked too, each tool once.
    const all = [
      ...(await servedCatalog(setOf('core'))),
      ...(await servedCatalog(setOf('compact'))),
      ...(await servedCatalog(setOf('core'), 'stdio', 'cloud')),
      ...(await servedCatalog(setOf('compact'), 'stdio', 'cloud')),
    ];
    // A compact tool is ranked per action once group (10) of step 10.7
    // assembles its actions: until then none of its texts is assembled.
    const seen = new Set<string>();
    tools = [
      ...all,
      // The tools only the HTTP transports serve (a long session, …).
      ...(await servedCatalog(setOf('core'), 'http')),
      ...(await servedCatalog(setOf('compact'), 'http')),
      ...(await servedCatalog(setOf('core'), 'http', 'cloud')),
      ...(await servedCatalog(setOf('compact'), 'http', 'cloud')),
    ].filter((tool) => {
      if (seen.has(tool.name)) return false;
      seen.add(tool.name);
      return partsOfDescription(tool.description) !== undefined;
    });
  });

  for (const model of MODELS) {
    const unserved =
      served === undefined
        ? `the Ollama at ${OLLAMA_URL} does not answer`
        : served.has(model.model)
          ? undefined
          : `the Ollama at ${OLLAMA_URL} does not serve ${model.model}`;
    const reason =
      only !== undefined && !only.includes(model.model)
        ? `skipped: MEANING_MODELS names ${only.join(', ')}`
        : !MEANING_LIVE
          ? 'skipped: not yet meaningful — no tool is assembled before group (2) of plan step 10.7'
          : unserved !== undefined && required !== model.model
            ? `skipped: ${unserved}`
            : undefined;
    it(`${model.model}: each tool's description and name rank its own function first, against the baseline`, {
      skip: reason ?? false,
    }, async () => {
      // Required here, and not served: the run fails, naming why.
      assert.equal(unserved, undefined, unserved);
      const assembled = tools.flatMap((tool) => {
        const parts = partsOfDescription(tool.description);
        return parts === undefined ? [] : [{ tool, parts }];
      });
      assert.ok(
        assembled.length >= MEANING_FEWEST,
        `${assembled.length} assembled tools: a ranking needs ${MEANING_FEWEST}`,
      );
      const functionTexts = assembled.map(
        ({ parts }) => `${model.document}${parts.purpose.text}`,
      );
      const vectors = (texts: readonly string[]) =>
        embed(model.model, texts, [], model.cpu === true);
      const functions = (await vectors(functionTexts)).map((vector, i) => ({
        tool: assembled[i]?.tool.name ?? '',
        vector,
      }));
      const asQueries = async (texts: readonly string[]) =>
        (await vectors(texts.map((text) => `${model.query}${text}`))).map(
          (vector, i) => ({ tool: assembled[i]?.tool.name ?? '', vector }),
        );
      const failures = [
        ...rankFailures(
          'description',
          await asQueries(assembled.map(({ tool }) => tool.description)),
          functions,
        ),
        ...rankFailures(
          'name',
          await asQueries(assembled.map(({ tool }) => nameWords(tool.name))),
          functions,
        ),
      ];
      const baseline: MeaningBaseline = JSON.parse(
        fs.readFileSync(BASELINE_FILE, 'utf8'),
      );
      const recorded = baseline[model.model];
      assert.ok(recorded !== undefined, `no baseline for ${model.model}`);
      assert.deepStrictEqual(baselineFaults(failures, recorded), []);
    });
  }
});
