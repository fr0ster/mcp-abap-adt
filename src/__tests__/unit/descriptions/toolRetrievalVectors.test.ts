/**
 * Vector tool retrieval, where it can run: the local Ollama
 * (`OLLAMA_URL`, 127.0.0.1:11434) embeds each tool's `semantic` sentence (as
 * `tools/list` serves it, under `_meta["mcp-abap-adt/search"]`) and every
 * query, for each embedding model in `MODELS`. Two modes per model: cosine
 * alone, and hybrid (0.7 cosine + 0.3 BM25 over name, parameters and
 * keywords). Every required group of every tuning query is found within
 * the top K of its collection, per role, as in the lexical test; the
 * held-out queries (`heldOut.ts`) get no worse than their recorded baseline.
 *
 * No request carries a timeout of its own (no built-in timeouts): a hung
 * Ollama is bounded by Jest's test timeout (`testTimeout`, package.json).
 *
 * Where it runs: a machine whose Ollama answers and serves the model. It
 * asks at load time; where the Ollama does not answer (CI), or does not
 * serve a model, that model's test is skipped, its name saying why. No
 * remote service is asked, and nothing is kept beyond the run.
 */
import { servedCatalog, setOf } from './catalog';
import {
  bm25Scorer,
  type Catalog,
  catalogOf,
  lexicalText,
  vectorScorers,
} from './harness';
import { HELD_OUT, worseThanBaseline } from './heldOut';
import { MODELS, OLLAMA_URL, servedModels } from './ollama';
import { QUERIES } from './queries';
import { describeFailure, evaluate } from './retrieval';

const served = servedModels();

describe('vector tool retrieval over the semantic sentences, through the local Ollama', () => {
  let catalog: Catalog;
  beforeAll(async () => {
    catalog = catalogOf(
      await servedCatalog(setOf('core')),
      await servedCatalog(setOf('core-ro')),
    );
  });

  for (const model of MODELS) {
    const reason =
      served === undefined
        ? `skipped: the Ollama at ${OLLAMA_URL} does not answer`
        : served.has(model.model)
          ? undefined
          : `skipped: the Ollama at ${OLLAMA_URL} does not serve ${model.model}`;
    const run = reason === undefined ? it : it.skip;
    run(
      `${model.model}: cosine and hybrid find every required tuning tool within the top K, the held-out no worse than its baseline${reason === undefined ? '' : ` (${reason})`}`,
      async () => {
        const lexical = bm25Scorer(catalog, lexicalText);
        const scorers = await vectorScorers(
          model,
          catalog,
          [...QUERIES, ...HELD_OUT],
          (tool) => tool.search?.semantic ?? '',
          lexical,
        );
        const failures = (mode: 'cosine' | 'hybrid') =>
          evaluate(QUERIES, scorers[mode], catalog.collectionOf)
            .filter((outcome) => !outcome.passed)
            .map(describeFailure);
        const worse = (mode: 'cosine' | 'hybrid') =>
          worseThanBaseline(
            `${mode} ${model.model}`,
            evaluate(HELD_OUT, scorers[mode], catalog.collectionOf),
          );
        expect({
          model: model.model,
          unembeddable: scorers.unembeddable,
          cosine: failures('cosine'),
          hybrid: failures('hybrid'),
          heldOutWorseCosine: worse('cosine'),
          heldOutWorseHybrid: worse('hybrid'),
        }).toEqual({
          model: model.model,
          unembeddable: [],
          cosine: [],
          hybrid: [],
          heldOutWorseCosine: [],
          heldOutWorseHybrid: [],
        });
      },
    );
  }
});
