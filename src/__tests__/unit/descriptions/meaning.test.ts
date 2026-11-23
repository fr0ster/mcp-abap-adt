/**
 * Plan step 10.8a: the vector checks of meaning (`meaning.ts`) over every
 * assembled tool of the full and compact sets, through the local Ollama
 * (`ollama.ts`): its description, and its name in words, must each rank its
 * own function (purpose and facts) first among every tool's. Failures are
 * compared with the recorded baseline (`meaningBaseline.json`, per model):
 * a new one fails, and so does a recorded one that no longer fails. A model
 * the Ollama does not serve skips with its reason. In CI the job
 * `meaning-vectors` runs this file with `mxbai-embed-large` (its query prefix
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

describe('description and name against function, through the local Ollama', () => {
  let tools: ServedTool[] = [];
  before(async () => {
    const all = [
      ...(await servedCatalog(setOf('core'))),
      ...(await servedCatalog(setOf('compact'))),
    ];
    const seen = new Set<string>();
    tools = all.filter((tool) => {
      if (seen.has(tool.name)) return false;
      seen.add(tool.name);
      return partsOfDescription(tool.description) !== undefined;
    });
  });

  for (const model of MODELS) {
    const reason =
      only !== undefined && !only.includes(model.model)
        ? `skipped: MEANING_MODELS names ${only.join(', ')}`
        : served === undefined
          ? `skipped: the Ollama at ${OLLAMA_URL} does not answer`
          : served.has(model.model)
            ? undefined
            : `skipped: the Ollama at ${OLLAMA_URL} does not serve ${model.model}`;
    it(`${model.model}: each tool's description and name rank its own function first, against the baseline`, {
      skip: reason ?? false,
    }, async () => {
      const assembled = tools.flatMap((tool) => {
        const parts = partsOfDescription(tool.description);
        return parts === undefined ? [] : [{ tool, parts }];
      });
      const functionTexts = assembled.map(
        ({ parts }) =>
          `${model.document}${[parts.purpose.text, ...parts.returns.map((fact) => fact.text)].join(' ')}`,
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
      assert.deepStrictEqual(
        baselineFaults(failures, baseline[model.model] ?? []),
        [],
      );
    });
  }
});
