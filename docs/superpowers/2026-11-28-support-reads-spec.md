# Support reads over ADT — spec

The goal is `2026-11-28-support-reads-goal.md`. Every SAP claim here is either measured on the
system kind named, or marked unverified. The measurements behind them are the goal's, plus
the ones this spec names.

The packages are released in this order, each built only against the registry version of
the one before it:

1. `@mcp-abap-adt/interfaces-adt`;
2. `@mcp-abap-adt/adt-strategies`, then `@mcp-abap-adt/adt-clients` (one repository,
   `publishOrder`);
3. `mcp-abap-adt` 24.3.0.

Each package's release is a minor; the version numbers are the owner's.

## 1. `@mcp-abap-adt/interfaces-adt`

Types and constants only: no function, no class, no runtime value but the table rows.

### 1.1 Contracts

All additions are additive, and no existing signature changes.

- **`IApplicationLog`** (`src/runtime/IApplicationLog.ts`) keeps its members.
  `IGetApplicationLogObjectOptions` and `IGetApplicationLogSourceOptions` each gain
  `accept?: string`, the `Accept` of that one request. When it is absent, adt-clients sends
  its own default (§3.1).
- **`src/runtime/IApplicationJob.ts`** (new):
  - `IGetApplicationJobOptions`: `{ version?: AdtReadVersion; accept?: string }`;
  - `IApplicationJobCatalog<TObject, TSource>`, with `kind: 'applicationJobCatalog'`;
  - `IApplicationJobTemplate<TObject, TSource>`, with `kind: 'applicationJobTemplate'`.

  Each has `getObject(name, options?)` and `getSource(name, options?)`, where `options` is
  `IGetApplicationJobOptions & IAdtAnalyseOptions<E>`. Each is overloaded with a required
  `analyse` (answering `IAdtResponse<T, E | IAdtError>`) and without one (answering
  `IAdtResponse<T>`), exactly as `IApplicationLog.getObject` / `getSource` are.
- **`src/runtime/IAbapKeywordDocumentation.ts`** (new):
  - `IKeywordDocumentationQueryParams`:
    `{ query: string; language?: string; version?: string; format?: string }`;
  - `IKeywordDocumentationTopicParams`:
    `{ object: string; language?: string; version?: string; format?: string }`;
  - `IKeywordDocumentationPositionParams`:
    `{ uri: string; language?: string; version?: string; format?: string }`;
  - `IKeywordDocumentationOptions`: `{ accept?: string }`;
  - `IAbapKeywordDocumentation<TQuery, TTopic, TPosition>`, with
    `kind: 'abapKeywordDocumentation'` and three members, one per form: `query(params,
    options?)`, `topic(params, options?)` and `position(params, options?)`. Each takes
    `IKeywordDocumentation…Options & IAdtAnalyseOptions<E>` and is overloaded with and
    without a required `analyse`, as above.

  Every parameter value is a string that the member sends as given. The contract fixes no
  value of `version` or `format`.
- **Exports** (`src/index.ts`): `IApplicationJobCatalog`, `IApplicationJobTemplate`,
  `IGetApplicationJobOptions`, `IAbapKeywordDocumentation`, the three `…Params` types and
  `IKeywordDocumentationOptions`.
- **Where the reading result types live.** They are not here. `IDocuPage`, `DocuLink` and
  `IBluesMetadata` belong to adt-strategies (§2.1), as `ISystemMessageEntry` does.

### 1.2 ADT type tables

These rows go into `ADT_TYPES_ONPREM` and `ADT_TYPES_CLOUD` (`src/adt/AdtTypeTables.ts`),
not into `ADT_TYPES_BASIS_740`.

| API | Collection | Code | `nameMaxLength` | Operations | Evidence |
|---|---|---|---|---|---|
| `applicationLog` | `/sap/bc/adt/applicationlog/objects` | `APLO/TYP` | 20 | `source`, `readMetadata` | `system-description-s4-2025--07-typestructure` / `…abap-cloud--07-typestructure` |
| `applicationJobCatalog` | `/sap/bc/adt/applicationjob/catalogs` | `SAJC` | 40 | `source`, `readMetadata` | same |
| `applicationJobTemplate` | `/sap/bc/adt/applicationjob/templates` | `SAJT` | 40 | `source`, `readMetadata` | same |

- The name lengths are the `OBJNAME_MAXLENGTH` values that the recorded typestructure of both
  releases lists.
- The entry shape requires them. They are the library's declaration, and the server reads
  nothing from them.
- The recorded 7.40 typestructure lists none of the three codes.
- The keyword documentation is no ADT object type, so it has no row.

### 1.3 Tests and docs

- **Tests** (`src/__typechecks__`):
  - each new contract is implementable;
  - its `analyse` overloads narrow as `IApplicationLog`'s do;
  - each export resolves from the package entry;
  - the existing table typechecks cover the three rows.
- **Docs:**
  - `CHANGELOG.md`: the new contracts, the `accept` options and the three rows;
  - `README.md`: the contract list, where it names the runtime contracts.

## 2. `@mcp-abap-adt/adt-strategies`

### 2.1 Readings

Every reading is plain code with no regular expression. A reading that cannot read its
input answers `undefined`; it never throws and never fabricates a value.

- **`utilDiscoveryTemplates`**:
  `IResultStrategy<ReadonlyMap<string, ReadonlySet<string>> | undefined>`.
  - It reads each collection's path (`app:collection/@href`, paths only, as
    `utilDiscoveryCollections` reads them) together with the union of the parameter names
    declared by its templates' `{?a,b,…}` (every `adtcomp:templateLink/@template`). A
    collection with no template maps to the empty set.
  - An answer that is no `app:service` document reads as `undefined`.
- **`docuPage`**: `IResultStrategy<IDocuPage | undefined>`.
  - Types:
    - `IDocuPage` is `{ title: string; text: string; links: readonly DocuLink[];
      versions: readonly IDocuTopicLink[] }`; `versions` holds every `option` whose
      `value` is a topic link (its `href` the value), in document order.
    - A `DocuLink` is one of these two shapes:
      - `{ kind: 'topic'; href: string; object: string; version: string | null;
        language: string | null; label: string }`;
      - `{ kind: 'other'; href: string; label: string }`.
  - `title`: the text of the first `title` element, entities decoded, whitespace runs
    collapsed to one space and trimmed. It is `''` when the page has no `title`.
  - `text`: the text of the `body` (the whole document when there is no `body`), in
    document order:
    - without `style`, `script` and `svg` elements and without markup;
    - entities decoded;
    - whitespace runs collapsed to one space and trimmed.

    A `data:` URI is an attribute value, so it never enters `text`.
  - `links`: every `a` element that carries an `href` attribute, in document order,
    repeats included, each exactly once.
    - Empty `href`s, in-page `#…` anchors and relative URLs are all included.
    - `href` is the attribute value with its entities decoded and nothing else changed.
    - `label` is the element's text, read as `text` is read.
  - **Topic links.** A link is `topic` when its `href`, after an optional `adtcom:`
    prefix, has the path `/sap/bc/adt/docu/abap/langu` and an `object` parameter.
    - The query string is split on `&`, and each pair on its first `=`. Each part is
      percent-decoded, and a part that does not decode is kept as written.
    - The first occurrence of a parameter counts.
    - `object` is that parameter's value.
    - `version` is the `version` parameter, and `language` the `sap-language` parameter,
      else the `language` parameter. Each is `null` when the parameter is absent and `''`
      when it is present and empty.
    - `href` keeps everything else.
  - **Every other `a` element with an `href`** is `other`.
  - **Not a page.** An input with no `html` element reads as `undefined`.
  - **Tokenizing.** The tokenizer does not depend on the page being well-formed XML. A page
    that ends mid-tag reads up to its last complete token. Whether every page is XHTML is
    unverified: the pages read declare the XHTML 1.1 doctype.
- **`jsonDocument`**: `IResultStrategy<unknown>`. It answers `JSON.parse` of the body, or
  `undefined` when it does not parse. It reads the definition sources, which answered
  `application/json` on both kinds.
- **`bluesMetadata`**: `IResultStrategy<IBluesMetadata | undefined>`.
  - It reads the root element `blue:blueSource` and answers `undefined` when the root is
    any other element or the body is not XML.
  - `IBluesMetadata` has these fields, each `string | undefined` (absent when the document
    does not carry it):
    - from the root's `adtcore:` attributes: `name`, `type`, `description`, `language`,
      `masterLanguage`, `masterSystem`, `abapLanguageVersion`, `version`, `createdAt`,
      `changedAt`, `createdBy`, `changedBy` and `responsible`;
    - from `adtcore:packageRef`: `packageName` and `packageDescription`.
  - It also has `links`: every child `atom:link` in document order, as
    `{ rel, href, type, title }`, each of those `string | undefined`.
  - The documents differ: the APLO document read on cloud had no `changedAt`.
- **Exports:** the four readings and `IDocuPage`, `DocuLink` and `IBluesMetadata`.

### 2.2 Tests and docs

- **Unit tests against the corpus** (`packages/adt-clients/corpus/adt/`, the cases of §3.4):
  - `utilDiscoveryTemplates`, on the three recorded discoveries. The parameter sets for
    `/sap/bc/adt/docu/abap/langu` are:
    - s4-2025 and abap-cloud: `format`, `language`, `query`, `uri`, `version`;
    - basis-740: `format`, `language`, `uri`;
    - a malformed answer reads as `undefined`.
  - `docuPage`, on a hit-list page, a topic page and a "Not found" page per kind. Each case
    has a sidecar listing every `a href` of the page, written by an independent count (the
    capture script) and checked in. The test compares `kind`, `href`, `object`, `version`,
    `language`, `label`, order and repetitions, element by element.

    Further cases:
    - no `data:` in `text`;
    - an empty `href`, a `#` anchor and a relative `href`, each kept (fixture);
    - a page truncated mid-tag;
    - a body with no `html` element (`undefined`);
    - a page without `title` (`''`).
  - `jsonDocument`: one source per type per kind, plus a body that does not parse.
  - `bluesMetadata`: one metadata document per type per kind, a document with another root
    (`undefined`), and a document missing `changedAt` and `packageRef`.
- **Docs:** the `README.md` readings list and `CHANGELOG.md`.

## 3. `@mcp-abap-adt/adt-clients`

### 3.1 Members

Every member sends one `GET` and nothing else: no state, no CSRF fetch, no retry. Each one:

- sets `timeout: 0`, as the existing runtime reads do, so no timeout is its own;
- answers through the result strategy of its result set and the `analyse` of the call;
- uses a caller's `accept` as given, and otherwise the default shown below;
- builds its address in `src/endpoints/objects.ts`.

**Names in addresses.** A name enters an address only through `seg()`, the library's one
address rule: lowercased and percent-encoded, the form ADT itself answers with. Nothing
else is done to it: no trim and no length check. On both kinds, the lowercase addresses of
uppercase names answered `200`.

New address records (`objects.ts`):

| Record | `collection` | `uri(name)` |
|---|---|---|
| `APPLICATION_LOG` | `/sap/bc/adt/applicationlog/objects` | `${collection}/${seg(name)}` |
| `APPLICATION_JOB_CATALOG` | `/sap/bc/adt/applicationjob/catalogs` | same pattern |
| `APPLICATION_JOB_TEMPLATE` | `/sap/bc/adt/applicationjob/templates` | same pattern |
| `KEYWORD_DOCUMENTATION` | `/sap/bc/adt/docu/abap/langu` | (no name: the forms are query parameters) |

`APPLICATION_LOG` also carries `validation` (`/sap/bc/adt/applicationlog/objects/validation`)
for the existing `validateName`.

| Member | Request | Default `Accept` | Measured |
|---|---|---|---|
| `getApplicationLog().getObject(name)` | `GET APPLICATION_LOG.uri(name)`, the existing `X-sap-adt-relation` kept | `application/vnd.sap.adt.blues.v1+xml` | `200` on both kinds; a namespaced name `200` on premise |
| `getApplicationLog().getSource(name)` | `GET sourceUri(APPLICATION_LOG.uri(name))` | `application/json` | `200` on both |
| `getApplicationJobCatalog().getObject(name)` | `GET APPLICATION_JOB_CATALOG.uri(name)` | `application/vnd.sap.adt.blues.v2+xml` | `200` on both |
| `getApplicationJobCatalog().getSource(name)` | `GET sourceUri(…)` | `application/json` | `200` on both |
| `getApplicationJobTemplate().getObject(name)` | `GET APPLICATION_JOB_TEMPLATE.uri(name)` | `application/vnd.sap.adt.blues.v2+xml` | `200` on both |
| `getApplicationJobTemplate().getSource(name)` | `GET sourceUri(…)` | `application/json` | `200` on both |
| `getKeywordDocumentation().query(p)` | `GET KEYWORD_DOCUMENTATION.collection?query=…[&language][&version][&format]` | `application/vnd.sap.adt.docu.v1+html` | `200` on both; `Accept: application/xml` answered `406` on both |
| `getKeywordDocumentation().topic(p)` | `GET …?object=…[&language][&version][&format]` | same | `200` on both |
| `getKeywordDocumentation().position(p)` | `GET …?uri=…[&language][&version][&format]` | same | `200` on both, but the start page for every position tried |

More on these members:

- **Where they live.** `getKeywordDocumentation` is a new factory on `AdtRuntimeClient`.
  The three definition APIs are rows of the type tables (§1.2), and the conformance check
  requires an `AdtClient` factory for every table API, so `getApplicationLog`,
  `getApplicationJobCatalog` and `getApplicationJobTemplate` are `AdtClient` factories,
  gated by the tables (`AdtServedBy<…>`); `AdtRuntimeClient.getApplicationLog` stays and
  answers the same handler. The legacy client overrides the three with handlers that
  refuse with no request. Each factory takes an optional result set and builds a fresh
  implementation per call. The result sets are:
  - `applicationJobDocuments`: `object` and `source` slots, `rawDocument` by default;
  - `keywordDocumentationDocuments`: `query`, `topic` and `position` slots, `rawDocument`
    by default.
- **Query parameters** are sent only when given, in the order shown, each value as given
  and URL-encoded by the connection. There is no count, page or size parameter.
  `language` goes as `language`, never as `sap-language`.
- **The existing application-log members** move onto `APPLICATION_LOG`. Their path segment
  changes from the raw name to `seg(name)`, which is the fix for a namespaced name. Their
  query parameters and relation header stay as they are.
- **`version` of the definition reads** goes as the `version` query parameter, as the
  existing application-log members send it.

### 3.2 What a member does not do

- No member reads the page, decides "no hit" or maps a `version`.
- No member checks that a form is announced: that is the consumer's discovery gate.
- No member checks a name's length.

### 3.3 Tests

- **Unit tests**, on a connection double, for each of the nine members:
  - the method and the URL;
  - the encoded path segment, for an uppercase name, a lowercase name, a mixed-case name,
    a namespaced name, a name with leading, inner and trailing spaces, and a name of 41
    characters. Each segment is exactly `seg(name)`;
  - the query parameters present and absent, the exact parameter set (no other key), the
    default and a given `Accept`, and `timeout: 0`;
  - exactly one request;
  - that a `404`, a `406`, the HTML `500` of an unknown `version` and the HTML `500` of a
    21-character APLO name (captured, §3.4) come back through `analyse` with their status
    and body, and not as a throw;
  - the existing `ApplicationLog.test.ts`, updated for the encoded segment.
- **Enforcement:**
  - `noHardcodedObjectAddresses.test.ts` enforces every string field of the address
    records across `src/`. Once the new records exist it enforces their paths, so the
    literals that `applicationLog/read.ts` holds today must move;
  - `publicApiSurface.test.ts` lists the new factories and result sets;
  - the conformance check holds the three table rows (§1.2) to the recorded typestructure.
- **Live tests** (`src/__tests__/integration/runtime/applicationJob/`, `…/applicationLog/`
  and `…/keywordDocumentation/`), run on premise and on cloud. Every name comes from the
  system at run time, never from a literal. Each eligible form's test asserts its own
  condition from the goal's "Availability", not a status alone.
  - **Definitions**, per type:
    - **Positive.** The first quick-search hit of the type. `getObject` answers `200`; its
      `bluesMetadata` reads, with `name` equal to the hit's name and `type` equal to the
      type's code (`APLO/TYP`, `SAJC`, `SAJT`). `getSource` answers `200`; its
      `jsonDocument` reads, as an object with `formatVersion` and `header`.
    - **On premise**, the same for a namespaced hit where the search returns one.
    - **Absent.** A name of 7 characters, generated at run time and checked absent by quick
      search first: `404` for both reads.
    - **APLO with a name of 21 characters** (generated and checked absent the same way):
      both reads are recorded. The status is asserted as `500` on cloud and recorded on
      premise.
  - **Keyword documentation:**
    - **Query** with the configured keyword (a test-config key, default `SELECT`): `200`.
      The page's `docuPage` reads with:
      - a title other than the start page's ("ABAP - Keyword Documentation | ABAP Keyword
        Documentation") and other than "Not found | ABAP Keyword Documentation";
      - non-empty text that contains the keyword (case-insensitive);
      - at least one topic link.
    - **Query** with a term generated to match nothing: `200`, title
      "Not found | ABAP Keyword Documentation".
    - **Topic.** The first topic link of the hit list, sent exactly as the link carries it
      (`object`, and `version` and `language` when the link carries them): `200`, and
      non-empty text.
      - **The page is the topic asked for.** The page carries its own topic name, so the
        test checks that. Its version choices (`docuPage`'s `versions`: the `option`
        elements of the page's version selector, "Standard ABAP" and "ABAP Cloud", whose
        values are topic links) each carry `object` equal to the topic asked for,
        compared case-insensitively. They are `option` values, not `a` elements, so they
        are not among `links`.
      - Measured: on cloud and on premise, the version choices of every topic page read
        (four topics) carried the page's own topic name in upper case, against the lower
        case of the link followed.
      - The title is recorded, not asserted: whether it equals the link's label is
        unverified.
    - **Link fidelity**, for that topic, kept as a test of the goal's measurement:
      - with its link's `version`, with no `version`, and with the other kind's link value
        (`5` / `X`): the three texts differ pairwise.
    - **Version matrix**, for that topic: `version` `1`, `2`, `3`, `4`, `5`, `6` and `X`.
      - The statuses measured are asserted on both kinds: `500` for `1` and `6`, `200` for
        `2`, `3`, `4`, `5` and `X`.
      - Nothing about what a value means is asserted.
      - No difference between the `2`, `3` and `4` pages is asserted: on premise `3` and
        `4` answered pages of the same size.
    - **`Accept: application/xml`**: `406`.
    - **Position: a measurement, not an eligibility proof.** On the source of a class found
      at run time:
      - the class: the quick-search class hits are taken in order, and the first one whose
        source answers `200` and holds a line whose first token, after leading blanks, is
        `DATA` (case-insensitive) is used. When no hit qualifies, the test records that and
        asserts nothing more;
      - the statement: that class's first such line;
      - the position is that line, and the token's first column, once counted from 1 and
        once from 0, each as `uri=<source uri>#start=<line>,<column>`;
      - the expected topic is a page whose title contains `DATA` and is not the start
        page's.

      The test records each answer's title. It asserts only `200`, and that the form stays
      ineligible while no answer meets the expectation. On cloud, every position tried so
      far (line 1 column 1, line 2 column 1, line 21 columns 2 and 3) answered the start
      page. The goal's position condition becomes provable only through this test; Eclipse
      may use another request for it (unverified).
- **ERRATA** (`docs/usage/ERRATA.md`), one entry each, with Symptom, Cause, Rule, Workaround
  and Evidence. Each states its exact measured case:
  - a query with no hit answered `200` with "Not found", on both kinds;
  - the topic form, which no discovery template announces, is what every topic link of the
    pages read uses;
  - `version=1` and `version=6` answered `500` on both kinds, while what any value means
    is unverified;
  - on cloud, an absent APLO name of 21 characters answered `500` "Application Server
    Error", "Data was lost while copying a value", while one of 7 characters answered
    `404`. Its relation to the 20 characters of the typestructure is unverified.

### 3.4 Corpus

New cases under `corpus/adt/`:

- one per type per kind, for the object document and the source;
- the cloud `500` of a 21-character APLO name, for both reads;
- the `500` of `version=1`;
- for the keyword documentation: a hit-list page, a topic page and a "Not found" page per
  kind, each with its link sidecar (§2.2).

They are sanitised as the corpus rules require:

- `adtcore:createdBy`, `changedBy` and `responsible` become `SAPUSER01`;
- the system's host in the page's external "Open in Browser" link becomes a placeholder
  host;
- `sap-client` becomes `000`.

Each case's sidecar names the kind and the release.

### 3.5 Docs

- `README.md`: the runtime factories list, and a section on the keyword documentation's
  three forms with their measured status.
- `docs/usage/ERRATA.md`: §3.3.
- `CHANGELOG.md`: the members; the application-log path fix, stated as a fix for
  namespaced names; the new `accept` options.
- `scripts/address-matrix.ts`: the three new records.

## 4. `mcp-abap-adt` 24.3.0

### 4.1 Tools per binary

| Tool / entry | core (stdio, HTTP, SSE) | core-ro | compact | compact-ro |
|---|---|---|---|---|
| `GetAbapKeywordDocumentation` | yes, long read | yes, long read | — | — |
| `GetApplicationLogDefinition` | yes | yes | — | — |
| `GetApplicationJobCatalog` | yes | yes | — | — |
| `GetApplicationJobTemplate` | yes | yes | — | — |
| `HandlerGet` type `APPLICATION_LOG_DEFINITION` | — | — | yes | yes |
| `HandlerGet` type `APPLICATION_JOB_CATALOG` | — | — | yes | yes |
| `HandlerGet` type `APPLICATION_JOB_TEMPLATE` | — | — | yes | yes |
| `HandlerSystem` action `keyword_documentation` | — | — | yes | yes |

How they are registered:

- **Where the handlers live:**
  - `src/handlers/system/readonly/handleGetAbapKeywordDocumentation.ts`, registered in
    `SystemHandlersGroup`;
  - `src/handlers/application_log/readonly/handleGetApplicationLogDefinition.ts`,
    `src/handlers/application_job/readonly/handleGetApplicationJobCatalog.ts` and
    `…/handleGetApplicationJobTemplate.ts`, registered in `ReadOnlyHandlersGroup`;
  - all four in `READ_DEFINITIONS` (`readDefinitions.ts`), because the compact routes are
    their entries.
- **Long read.** `GetAbapKeywordDocumentation` goes into `LONG_TOOLS` (`src/lib/longTools.ts`)
  and `tools/long-handlers.json`, so it declares `background` and runs on an ABAP session
  of its own. `HandlerGet` and `HandlerSystem` are listed already, and their new type and
  action follow them, with no `NOT_A_READ` entry. The three full definition tools are not
  long reads.
- **`-ro` sets.** These take every entry through the existing groups and
  `compactReadOnlyTools.ts`, because every new entry is a read.
- **Batch.** The full binaries serve no batch mode. In the compact binaries they are not admitted to batch mode. On a cold discovery cache a support read waits
  for the discovery answer before it sends its own request, while a batch
  (`oneRequestPerEntry`) sends every request before any answer comes back. So, as #392
  treats every read that waits on another answer, the new `HandlerGet` types and the
  `keyword_documentation` action get no row in `tools/batch-handlers.json`.
  - While a communication batch is open, a call of one of them is refused
    `batch_not_recordable`, with `batchNotRecordableWords` (`BaseMcpServer.recordCall`: the
    eligibility check against the table, after the background checks).
  - Nothing is sent, the discovery read included, and no batch entry or number is allocated.
  - With `background: true` the existing `batch_no_background` refusal answers first.
  `tools/batch-handlers.json`, `BATCH_ENTRY_CASES`, `BATCH_MODE.md` and the batch sentences
  of `HandlerGet` and `HandlerSystem` stay as they are, and the batch tests stay green
  unchanged. The long-read and background handling (§4.1 "Long read") is not affected.
- **Access restrictions.** `--deny-actions` takes these eight entries:
  - the four tools by name;
  - `HandlerGet.APPLICATION_LOG_DEFINITION`, `HandlerGet.APPLICATION_JOB_CATALOG`,
    `HandlerGet.APPLICATION_JOB_TEMPLATE` and `HandlerSystem.keyword_documentation`, as
    values.

  A denied call is refused before any request, the discovery read included.

### 4.2 Schemas

Names and arguments go to the client exactly as given. No handler trims, changes the case
of, or checks the length of a name; the one transformation is the library's `seg()`
(§3.1).

`GetAbapKeywordDocumentation` (`z.strictObject`: a property it does not declare is
refused):

- `query?: string` (min 1): a word or phrase to search the documentation for.
- `topic?: string`: a topic name, as a documentation link of an earlier answer carries it.
- `topic_version?: string`: the `version` that documentation link carries. It is taken only
  with `topic`.
  - It is named apart from the read `version` that `HandlerSystem`'s `search_source`
    already takes as an enum, so the two never share one flat property.
- `language?: string`: the documentation's language. Without it, the system's default
  answers.

A link is followed exactly as it is. `topic`, `topic_version` and `language` take any
string, the empty one included: the reading keeps an empty `version` as `''`. A value that
is given goes as its parameter, `''` as `version=`, and an absent one is not sent. A
link's `null` means its parameter was absent, so the caller leaves the argument out.
- `detail` (`DETAIL_SHAPE`).
- `background` (the long-read field).
- **Refinements**, refused by the schema before anything is sent:
  - exactly one of `query` and `topic`, by presence (`topic: ''` counts as given);
  - `topic_version` without `topic`.
- **No position argument.** The position form is eligible nowhere (§4.5), so no schema
  offers it.

`GetApplicationLogDefinition` (`application_log_name`), `GetApplicationJobCatalog`
(`job_catalog_name`) and `GetApplicationJobTemplate` (`job_template_name`):

- The name is a string (min 1), passed unchanged.
- `part`: `source` (default) or `metadata`. Its own words: "source" is the definition
  (JSON), "metadata" is the ADT object document.
- `version`: `READ_VERSION_FIELD`, as the other `Get<Type>` tools take it (`readVersion.ts`).
- `detail`.

**Compact `HandlerGet`.**

- `compact-readonly-entries/src/handlers/compactReadRoutes.ts` routes each new type to its
  full tool's entry (`get`), and `compactGetRefusals.ts` checks it with that tool's schema
  (`of(D.Get…)`), as for every type.
- The caller gives the target's own name argument (`application_log_name`,
  `job_catalog_name`, `job_template_name`), as `HandlerGet` callers do for every type.
  `HandlerGet`'s schema (`compactSchemas.ts`) gets each new name property with the
  target's words, and its per-type map of the properties each type takes gets one entry per
  type, as `TABLE: ['table_name', 'version']` is written: for example
  `APPLICATION_JOB_CATALOG: ['job_catalog_name', 'version']`.
- `part`:
  - `source` and `metadata` route to the target with that `part`;
  - any other `HandlerGet` part (`urls`, `contents`, `activation_status`,
    `activation_results`, `draft`, `main_programs`, …) is refused by name, naming the two
    parts offered, as for every type that lacks a part.
- `version` and `detail` pass to the target.
- Add the new types to `CompactObjectType`, `COMPACT_OBJECT_TYPES` and `compactMatrix.ts`
  (`get` only), and their `AdtNeed` rows (`adtProjections.ts`) to the three table APIs of
  §1.2 with `source` / `readMetadata`.

**Compact `HandlerSystem`.**

- `keyword_documentation` is added to:
  - `SYSTEM_ACTIONS`;
  - `SYSTEM_ACTION_TOOLS` (`'GetAbapKeywordDocumentation'`);
  - `ACTION_WORDS`, as "keyword_documentation (the ABAP keyword documentation)";
  - `SYSTEM_PAIRS`, as "reads the ABAP keyword documentation".
- `COMPACT_SYSTEM_TAKES.members.keyword_documentation` is `['query', 'topic',
  'topic_version', 'language', 'detail']`.
- In `systemProperties`:
  - `query` stays the existing property, and its words gain the action's sentence through
    `said()`;
  - `topic`, `topic_version` and `language` are new properties, typed as the full tool
    types them, and worded only for `keyword_documentation`.
- `actionTargetRule` checks the call with the full tool's schema. Because that schema is
  strict, any other action's property given with `keyword_documentation` is refused by
  name. The refinements of the full tool apply as they are.

**Descriptions.** They name nothing concrete (`toolDescriptionsCarryNoLiterals.test.ts`):

- every description is functional;
- each definition tool's description says it reads a definition, not log entries, job runs
  or job logs.

### 4.3 Calls

- **Keyword documentation:**
  - with `query`, the handler calls `getKeywordDocumentation(results).query({ query,
    language })`;
  - with `topic`, it calls `topic({ object: topic, language, version: topic_version })`;
  - neither call sends `format`. For the query form, the body with `format=eclipse` and the
    body without it were byte-equal on cloud (after masking the system's host) and the
    same size on premise.
- **Definitions:** the handler calls the type's `getObject` (`part: metadata`) or
  `getSource` (`part: source`), with `version`.
- **Analyse.** Every call passes `analyseException`.
- **Request count.** Each call sends one read request, after the discovery read of §4.5 when
  no discovery answer is kept.

### 4.4 Answers per `detail`

Each tool states a `DetailTable` (`src/lib/detail`). The reading is selected before the call,
and its value is answered as it is.

**No level ever projects `undefined`.** Each level reading is a `LevelReading` (as
`fullLevel` is):

- it applies the adt-strategies reading to the wire answer;
- when the reading answers `undefined`, the level's value is `rawOf(answer)`: the body as
  sent, the value `raw` answers.

So `return_answer` never reaches `projection_failed`, and no second request is sent. An
unreadable success stays a success.

`GetAbapKeywordDocumentation`:

| `detail` | Answer |
|---|---|
| `terse` (default) | Text, written by the listing writer:<br>• `# title <title>`<br>• the page text as one line<br>• `# links <count>`<br>• one TSV row per link, in page order: `topic`, object, version (`-` for `null`), language (`-` for `null`), label, href; or `other`, href, label |
| `medium`, `full` | JSON `{ title, text, links, versions }`, the whole `docuPage` reading |
| `raw` | The HTML as sent |

- Every level holds every link the page carries, as the reading defines it (§2.1).
- A "Not found" page is a success at every level, and its title and text say so.

Definition tools, `part: source`:

| `detail` | Answer |
|---|---|
| `terse`, `medium`, `full` | The parsed JSON (`jsonDocument`), or the body as sent when it does not parse |
| `raw` | The body as sent |

Definition tools, `part: metadata`:

| `detail` | Answer |
|---|---|
| `terse` | JSON with the keys `name`, `type`, `description`, `packageName`, `language`, `masterLanguage`, `abapLanguageVersion`, `version`, `createdAt` and `changedAt`, each `null` when the document does not carry it |
| `medium`, `full` | The whole `bluesMetadata` reading, user fields and links included |
| `raw` | The document as sent |

When `bluesMetadata` answers `undefined`, every level answers the document as sent.

**Failures, the same at every level.**

- A non-`2xx` answer goes through the existing failure path (`answerFailure`). It carries
  SAP's status and SAP's message, whatever `detail` was asked for.
- For an ADT exception document, the message is its `message`.
- For an HTML body with no exception document (the measured `500`s of a 21-character APLO
  name and of `version=1`), the path as it is keeps SAP's answer whole. Read in the code:
  - `analyseException` finds no `exc:exception`, so it keeps the library's verdict: the
    message "Request failed with status code 500" and the wire answer as `response`;
  - `failurePayload` (`src/lib/answer.ts`) puts the body as `raw_body` on every non-`2xx`
    failure, whatever `detail` says.

  So the model gets status `500`, that message, and the HTML page whole, SAP's own text
  ("Application Server Error" with "Data was lost while copying a value" for the APLO name,
  "Invalid enumeration value" for `version=1`, on both kinds) inside it. No reading
  is added and nothing in the failure path changes.
- A unit test pins this on both captured pages: the status, the message, and `raw_body`
  byte-equal to the body.
- No level turns a failure into a success or a success into a failure.

### 4.5 Availability

**Static: `available_in` and the eligibility table.**

All four full tools are `available_in: ['onprem', 'cloud']`.

`src/lib/supportReads/eligibility.ts` holds one row per form per kind. Each row is eligible
or not and names the live test whose assertions (§3.3, §4.7) prove the form's condition:

| Form | `onprem` | `cloud` | `legacy` |
|---|---|---|---|
| keyword documentation, query | eligible | eligible | not |
| keyword documentation, topic | eligible | eligible | not |
| keyword documentation, position | not | not | not |
| definition read APLO / SAJC / SAJT (each) | eligible | eligible | not |

How the table is used:

- **What is not offered.** A form that is not eligible on the stated kind is not offered:
  - the position form is in no schema;
  - on `legacy` the full tools are not registered (`available_in`);
  - the compact type values and the action are left out of the schemas registered for
    `legacy` (`statedEnvironment`, as `subResources.ts` reads it).
- **The guarantee is at call time.** A form that is not eligible on the stated kind is
  refused `support_read_not_eligible` before any request, the discovery read included:
  "this read is not served on this kind of system; nothing was sent".
- A unit test keeps the table, `available_in` and the compact schemas equal.

**Runtime: discovery.**

`src/lib/supportReads/served.ts` reads the discovery once per system key with
`utilDiscoveryTemplates`. It keeps the answer as `abapGit/availability.ts` keeps its own:

- one read is shared by concurrent callers;
- a failed or `undefined` read is not kept, and answers "not served";
- the connection-reset hook clears it.

The discovery read goes on the connection the read would use: the instance's, or for a
background long read its own session.

What each form needs to be served:

| Form | Discovery must list |
|---|---|
| query | `/sap/bc/adt/docu/abap/langu` with `query` among its template parameters |
| topic | `/sap/bc/adt/docu/abap/langu` |
| APLO | `/sap/bc/adt/applicationlog/objects` |
| SAJC | `/sap/bc/adt/applicationjob/catalogs` |
| SAJT | `/sap/bc/adt/applicationjob/templates` |

A form that is not served is refused `support_read_not_served`: "this system's discovery does
not list this read, or could not be read; the read was not sent".

The requests each refusal sends:

| Situation | Discovery requests | The read |
|---|---:|---:|
| denied (`--deny-actions`) | 0 | 0 |
| not eligible on the stated kind | 0 | 0 |
| not served, discovery answer kept | 0 | 0 |
| not served, no answer kept | 1 | 0 |

**No probing.** Nothing else is sent to decide availability.

### 4.6 Refusals

- **Schema refusals:**
  - a name that is missing or empty;
  - both or neither of `query` and `topic`;
  - `topic_version` without `topic`;
  - a property `GetAbapKeywordDocumentation` does not declare;
  - an unknown `part` or `detail`;
  - a `HandlerGet` part these types do not offer.
- **`support_read_not_eligible`** and **`support_read_not_served`**: new `ServerRefusal`
  codes in `src/lib/auth/serverRefusal.ts`, with the fixed words of §4.5.
- **The existing refusals** apply as they do to every tool: `system_type_required`, a denied
  action, a `background` on a non-long call.
- **SAP's own answers** (§4.4) are failures, not refusals.

### 4.7 Tests

**Unit tests.**

- **Schemas:**
  - the refinements;
  - strictness, and `topic_version` kept apart from `search_source`'s `version`;
  - that no schema has a position argument;
  - names passed unchanged: uppercase, lowercase, mixed case, spaces, namespaced, 21 and
    41 characters, through the full tools and the compact routes.
- **Eligibility:** the table against `available_in` and the compact enums of each kind.
- **`served.ts`**, with a discovery double built from the three recorded discoveries:
  - an answer is kept, shared, and dropped by the reset hook;
  - an unreadable discovery fails closed;
  - basis-740 lists the collection with no `query` parameter, so the query form is not
    served there.
- **Request counts.** A connection double counts requests for each row of the §4.5 table.
- **Access restrictions.** One parameterised test over the eight deny entries of §4.1:
  - each one, when denied, refuses its call with no request;
  - the other seven stay served.
- **Detail tables**, against the corpus cases of §3.4:
  - every level;
  - every link at `terse`, `medium` and `full`, compared with the link sidecar element by
    element;
  - the "Not found" page;
  - an unreadable success at every level, answered as sent and never `projection_failed`:
    an HTML body without `html`, a JSON source that does not parse, a metadata document
    with another root.
- **Failures** at every level, for both parts where they apply:
  - `404`;
  - `406`;
  - the `version=1` `500`;
  - the 21-character APLO `500`. This one is asserted with the name sent unchanged (its
    `seg()` form), exactly one object or source request, status `500`, the message and the whole `raw_body` of §4.4,
    and no local refusal.
- **No server limits.**
  - The largest captured page (184 KB, on premise) is answered whole at every level:
    - `raw` equals the body byte for byte;
    - `medium` / `full` carry the reading's whole `text` and every link;
    - `terse` carries the same text and link rows.
  - The same in a background run (`GetBackgroundRun`), equal to the in-call answer.
  - No support-read code sets a timeout. Every member request carries `timeout: 0` (wire
    test), and a source test finds no timer or deadline in `src/lib/supportReads/` and the
    four handlers.
- **Long read:** `LONG_TOOLS` equals `tools/long-handlers.json`, and a background run
  answers a `run_handle`.
- **Compact routing:**
  - each new type with `source` and `metadata` reaches its full tool through the target's
    parse;
  - another part is refused by name;
  - `keyword_documentation` reaches `GetAbapKeywordDocumentation`;
  - a foreign property with it is refused.
- **Tool sets:** the `-ro` sets carry every new entry, and the tool counts match the docs.

**On-the-wire tests.** The real adt-clients over a connection double, through each handler,
full and compact. For each call they assert:

- the URL, with the `seg()` segment for each name case listed above;
- `query`, `object`, `language` and `version` present only when given, and no other
  parameter (no `format`, no count, no page);
- `topic_version: ''` and `language: ''` sent as `version=` and `language=`;
- the default `Accept` and `timeout: 0`;
- the request counts of §4.5;
- how each answer is read.

**Live tests.** `src/__tests__/integration/readOnly/system/` holds the documentation tests and
`…/readOnly/support/` the definition tests. They run on premise and on cloud, with the
`test-config.yaml.template` entries stating `available_in: [onprem, cloud]`, in soft mode,
and each file once in hard mode before the release. Each asserts the eligibility condition
of its form, as §3.3 defines it:

- **Definitions:**
  - the first search hit of each type, both parts, every `detail`, with `name` and `type`
    matching at `medium`, and `formatVersion` and `header` in the source;
  - an absent name of 7 characters: the `404` failure;
  - an APLO name of 21 characters: SAP's failure as it is. Its status is asserted as `500`
    on cloud and recorded on premise.
- **Documentation:**
  - a query with the configured keyword: a title that is neither the start page's nor the
    "Not found" title, text containing the keyword, and at least one topic link;
  - a topic followed from that answer's first topic link exactly as it carries it
    (`topic`, `topic_version` and `language`): non-empty text, and the page's two
    version choices ("Standard ABAP", "ABAP Cloud") carrying `object` equal,
    case-insensitively, to the topic asked for (§3.3);
  - a no-hit query: the "Not found" page as a success.

  Each runs once in the call (`background: false`) and once in the background.
- **Compact:** one call of each new entry, through `HandlerGet` and `HandlerSystem`.

### 4.8 Docs

- **`README.md`**: the feature list and the first-screen tool overview.
- **Generated docs:**
  - `docs/user-guide/AVAILABLE_TOOLS.md` and `AVAILABLE_TOOLS_READONLY.md`
    (`tools/generate-tools-docs.js`);
  - `compact/docs/AVAILABLE_TOOLS.md`;
  - `tools/tool-search.json` and the prompt listings, where their tests ask for them.
- **`docs/user-guide/HANDLERS_MANAGEMENT.md`**:
  - the tool counts per binary and transport (core and core-ro +4, compact and compact-ro
    +0);
  - the `HandlerSystem` action list and the `HandlerGet` type list.
- **`docs/user-guide/ACCESS_RESTRICTIONS.md`**: the new entries, where the page lists tools,
  types or actions. `BATCH_MODE.md` is unchanged (§4.1 "Batch").
- **`CHANGELOG.md`**, 24.3.0:
  - the tools, the types and the action;
  - what is not served (the position form, `legacy`);
  - the dependency versions.
- **The audit.** The files above are the known set, not a limit. Before the tag, every guide,
  usage example and description that the change touches is found by search and updated:
  - tool counts;
  - `HandlerSystem` action lists and `HandlerGet` type lists;
  - application log and job wording;
  - read-only tool lists.
- **`CLAUDE.md`'s "Cloud vs On-Prem"**: not changed by this work. The controller proposes a
  line to the owner.

### 4.9 Release

The release follows the order of the header, and each package's gates hold before its tag.

- **Every package:**
  - every `package.json` in the release declares only semver ranges: no `file:`, `link:`
    or `workspace:`;
  - every range resolves on the registry. A package of the same release is published
    first, in order;
  - every third-party entry in the lockfile resolves from the registry, and `"link": true`
    appears only for a repository's own workspace siblings;
  - after publishing, a clean install of that package from the registry into an empty
    directory outside the repository proves it installs.
- **`mcp-abap-adt`:**
  - it takes `interfaces-adt`, `adt-strategies` and `adt-clients` only once they are
    visible on the registry;
  - before the tag: the full integration run on premise and on cloud, and
    `npm run test:install`;
  - after publishing: `npm run release:verify`.
- The goal, this spec and the plan are deleted before the tag.
