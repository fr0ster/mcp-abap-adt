/**
 * Embeddings from the local Ollama (`http://127.0.0.1:11434`), the one place
 * the vector half of tool retrieval runs: no remote service, nothing cached
 * beyond one test run.
 */
import { spawnSync } from 'node:child_process';

export const OLLAMA_URL = 'http://127.0.0.1:11434';

/** The embedding models measured, each with the prefixes its card asks for. */
export const MODELS: ReadonlyArray<{
  readonly model: string;
  readonly query: string;
  readonly document: string;
  /**
   * Run on the CPU (`num_gpu: 0`): bge-m3 (F16) on the GPU answers some
   * texts with a NaN Ollama cannot encode (HTTP 500, measured with Ollama
   * 0.24: 54 of the 296 search texts); on the CPU it answers every one.
   */
  readonly cpu?: boolean;
}> = [
  {
    model: 'nomic-embed-text',
    query: 'search_query: ',
    document: 'search_document: ',
  },
  { model: 'bge-m3', query: '', document: '', cpu: true },
  {
    model: 'mxbai-embed-large',
    query: 'Represent this sentence for searching relevant passages: ',
    document: '',
  },
  {
    model: 'bge-large',
    query: 'Represent this sentence for searching relevant passages: ',
    document: '',
  },
  {
    model: 'snowflake-arctic-embed:335m',
    query: 'Represent this sentence for searching relevant passages: ',
    document: '',
  },
];

/**
 * The models the Ollama at `OLLAMA_URL` serves, asked synchronously (a child
 * node process) so a test file can decide at load time what runs: `undefined`
 * when it does not answer.
 */
export function servedModels(): ReadonlySet<string> | undefined {
  const script = [
    `fetch(${JSON.stringify(`${OLLAMA_URL}/api/tags`)}, { signal: AbortSignal.timeout(3000) })`,
    '  .then((r) => r.json())',
    '  .then((b) => process.stdout.write(JSON.stringify((b.models ?? []).map((m) => m.name))))',
    '  .catch(() => process.exit(1));',
  ].join('\n');
  const run = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
  });
  if (run.status !== 0) return undefined;
  try {
    const names = JSON.parse(run.stdout) as string[];
    const served = new Set<string>();
    for (const name of names) {
      served.add(name);
      if (name.endsWith(':latest'))
        served.add(name.slice(0, -':latest'.length));
    }
    return served;
  } catch {
    return undefined;
  }
}

async function embedBatch(
  model: string,
  input: readonly string[],
  cpu: boolean,
): Promise<number[][] | string> {
  const response = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      input,
      ...(cpu ? { options: { num_gpu: 0 } } : {}),
    }),
  });
  if (!response.ok) {
    return `HTTP ${response.status} ${(await response.text()).slice(0, 200)}`;
  }
  return ((await response.json()) as { embeddings: number[][] }).embeddings;
}

/**
 * The embeddings of `texts` by `model`, in order. A batch the server cannot
 * answer (bge-m3 answers some batches with a NaN it cannot encode) is asked
 * again one text at a time; a text it still cannot answer gets an empty
 * vector (it scores 0 against every query) and is named in `unembeddable`.
 */
export async function embed(
  model: string,
  texts: readonly string[],
  unembeddable: string[] = [],
  cpu = false,
): Promise<number[][]> {
  const vectors: number[][] = [];
  const BATCH = 16;
  for (let start = 0; start < texts.length; start += BATCH) {
    const batch = texts.slice(start, start + BATCH);
    const answered = await embedBatch(model, batch, cpu);
    if (typeof answered !== 'string') {
      vectors.push(...answered);
      continue;
    }
    for (const text of batch) {
      const one = await embedBatch(model, [text], cpu);
      if (typeof one === 'string') {
        unembeddable.push(text);
        vectors.push([]);
        continue;
      }
      vectors.push(...one);
    }
  }
  return vectors;
}
