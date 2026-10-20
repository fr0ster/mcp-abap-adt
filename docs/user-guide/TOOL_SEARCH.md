# Tool search: three texts per tool

A client that does not hand every tool to the model picks a few by search
first: lexical (BM25), vector (embeddings), or both. The methods do not
match the same words, so every tool the server lists carries three texts, and
a client indexes the one its search uses:

| Text | Where it is | For |
|---|---|---|
| `description` | `tools/list`, each tool's `description` | the model's choice among the tools it is given: what the tool does on what its parameters name, its parameters and its result |
| `keywords` | `tools/list`, each tool's `_meta["mcp-abap-adt/search"].keywords` | lexical search (BM25): the terms, synonyms and object kinds users ask with — `CDS view`, `BAPI`, `where used`, `short dump`, `SE16` |
| `semantic` | `tools/list`, each tool's `_meta["mcp-abap-adt/search"].semantic` | vector search: one or two natural sentences of what a user wants when this tool is the answer |

A client that knows none of this reads `description`, as before.

## Reading them

Over MCP, each tool of `tools/list` carries:

```json
{
  "name": "GetDdl",
  "description": "[read-only] Reads the CDS view (or classic DDL view) named by ddl_name in one request: …",
  "inputSchema": { "…": "…" },
  "_meta": {
    "mcp-abap-adt/search": {
      "keywords": ["read", "show", "…", "CDS view", "DDL source", "DDLS", "…"],
      "semantic": "Show the DDL source of a CDS view: its fields, associations, joins and annotations."
    }
  }
}
```

An embedder of `@mcp-abap-adt/lib` reads them without a server, from the
subpath `@mcp-abap-adt/lib/tool-search`:

```ts
import {
  TOOL_SEARCH_META_KEY, // 'mcp-abap-adt/search'
  toolSearchText, // (name) => { keywords, semantic } | undefined
  toolSearchTexts, // () => ReadonlyMap<name, { keywords, semantic }>
} from '@mcp-abap-adt/lib/tool-search';
```

The table is `tools/tool-search.json` in the package: one entry per tool of
every set (the full set, the `-ro` sets and the compact sets).

## Building the index

- **Lexical (BM25):** index each tool as its name, its parameter names and its
  `keywords`. The tests tokenize as follows; a tokenizer that differs ranks
  differently:
  - letters and digits form words; anything else separates them;
  - a word is split on underscores, case changes and letter/digit boundaries
    (`BAPI_USER_GET_DETAIL` → `bapi user get detail`, `GetWhereUsed` →
    `get where used`, `ZI_SALESORDER2` → `zi salesorder 2`);
  - lower-cased; a plural folded to its singular (`views` → `view`,
    `entries` → `entry`; a word ending in `ss`, `us` or `is` is kept);
  - a short list of English stopwords dropped (`the`, `of`, `is`, `me`, …);
    `where` and `who` are kept, since "where used" and "who calls" are what
    users ask with.
  - BM25 with k1 = 1.2, b = 0.75.
- **Vector:** embed `semantic` alone, with the document prefix your model
  asks for (`search_document: ` for nomic-embed-text, for example), and the
  query with its query prefix.
- **Hybrid:** 0.7 × cosine + 0.3 × BM25, the BM25 score divided by the best
  of the collection.
- **Collections:** the tests build two: the read collection is the tools the
  `-ro` binary of the full set (`mcp-abap-adt-ro`) serves; the write
  collection is every other tool of the full set. Each is searched for its own
  top K. This is not the same as splitting by the `[read-only]` marker: some
  tools that change nothing (the syntax checks, the version reads, a class's
  local includes, the ATC status and findings, the debugger's reads) are not
  served by the `-ro` binary, and the `-ro` binary also serves the run tools.
  A tool that scored nothing is never counted as found, whatever its place.

### Embedding with bge-m3 on a GPU

Measured with Ollama 0.24: bge-m3 (F16) on the GPU answers some texts with a
NaN that Ollama cannot encode (HTTP 500, "unsupported value: NaN"): 54 of the
296 `semantic` texts. A client embedding with bge-m3 on the GPU loses those
tools from its index. On the CPU (Ollama option `num_gpu: 0`) every text
embeds; the tests run bge-m3 that way.

## How they are checked

Two query sets, both for a reader (the read collection) and a developer
(both collections), over the full set's catalog as `tools/list` serves it,
with the top 10 of the read collection and the top 5 of the write collection:

- **the tuning set** (`src/__tests__/unit/descriptions/queries.ts`: the
  cases of issues #270 and #271, and requests written with the texts): every
  query must find every tool it needs. It is a regression guard on these
  queries, not a measure of how the texts do on others.
- **the held-out set** (`heldOutQueries.json` beside it: queries the texts
  were never tuned on; the consumer's findings join it): it must not get worse
  than its recorded baseline (`heldOutBaseline.json`, the pairs that failed
  per mode and model). The texts are never edited to make a held-out query
  pass: a held-out failure is fixed only together with fresh held-out
  queries, which the fix is measured on, and the baseline is recorded again
  with them.

The tests:

- `toolRetrieval.test.ts` — BM25 over name, parameters and `keywords`;
  offline, in every run (CI included);
- `toolRetrievalVectors.test.ts` — cosine over `semantic`, and the hybrid,
  for five embedding models of a local Ollama (`http://127.0.0.1:11434`:
  nomic-embed-text, bge-m3, mxbai-embed-large, bge-large,
  snowflake-arctic-embed:335m); it runs where that Ollama answers with the
  model and is skipped elsewhere, its name saying why. Its requests carry no
  timeout of their own; a hung Ollama is bounded by Jest's test timeout.

`descriptionsFunctional.test.ts` holds every `description` to its rules:
no negation, no other tool of its set named, `[read-only]` on every tool that
changes nothing (beside a `[runtime]`, `[debug]` or `[session]` marker where
the tool has one), a first sentence no other tool of its set shares, and no
vague subject ("an ABAP object") in it.
