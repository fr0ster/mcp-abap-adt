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
  `keywords`. Split ABAP identifiers on underscores and case changes
  (`BAPI_USER_GET_DETAIL` → `bapi user get detail`, `GetWhereUsed` →
  `get where used`).
- **Vector:** embed `semantic` alone, with the document prefix your model
  asks for (`search_document: ` for nomic-embed-text, for example), and the
  query with its query prefix.
- **Hybrid:** 0.7 × cosine + 0.3 × BM25, the BM25 score divided by the best
  of the collection.
- **Collections:** the read-only tools in one collection, the rest in another,
  each searched for its own top K.

## How they are checked

Two tests run the labelled queries of `src/__tests__/unit/descriptions/queries.ts`
(the cases of issues #270 and #271 among them) for a reader (read-only tools)
and a developer (every tool), over the full set's catalog as `tools/list`
serves it, and require every tool a query needs within the top 10 of the read
collection and the top 5 of the write collection:

- `toolRetrieval.test.ts` — BM25 over name, parameters and `keywords`;
  offline, in every run (CI included);
- `toolRetrievalVectors.test.ts` — cosine over `semantic`, and the hybrid,
  for five embedding models of a local Ollama (`http://127.0.0.1:11434`:
  nomic-embed-text, bge-m3, mxbai-embed-large, bge-large,
  snowflake-arctic-embed:335m); it runs where that Ollama answers with the
  model and is skipped elsewhere, its name saying why.

`descriptionsFunctional.test.ts` holds every `description` to its rules:
no negation, no other tool of its set named, `[read-only]` on a read tool, a
first sentence no other tool of its set shares, and no vague subject ("an
ABAP object") in it.
