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

### 1.1 Contracts

All additions are additive, and no existing signature changes.

- **`IApplicationLog`** (`src/runtime/IApplicationLog.ts`) keeps its members. Its two read
  option types each gain `accept?: string`, the `Accept` of that one request. When it is
  absent, adt-clients sends its own default (§3.1).
- **`IApplicationJobCatalog<TObject, TSource>`** (new, `src/runtime/IApplicationJob.ts`):
  - `kind: 'applicationJobCatalog'`;
  - `getObject(name, options?)` and `getSource(name, options?)`, overloaded with and
    without a required `analyse` exactly as `IApplicationLog.getObject` / `getSource` are.
- **`IApplicationJobTemplate<TObject, TSource>`**: the same shape, with
  `kind: 'applicationJobTemplate'`.
- **`IGetApplicationJobOptions`** (shared by both):
  - `version?: AdtReadVersion`;
  - `accept?: string`.
- **`IAbapKeywordDocumentation<TPage>`** (new, `src/runtime/IAbapKeywordDocumentation.ts`).
  It has `kind: 'abapKeywordDocumentation'` and three members, one per form. Each is
  overloaded with and without a required `analyse`:
  - `query(params, options?)`: `params` is `{ query: string; language?: string;
    version?: string; format?: string }`.
  - `topic(params, options?)`: `params` is `{ object: string; language?: string;
    version?: string; format?: string }`.
  - `position(params, options?)`: `params` is `{ uri: string; language?: string;
    version?: string; format?: string }`.
  - `options` is `IAdtAnalyseOptions & { accept?: string }`.
  - Every value is a string that the member sends as given. The contract fixes no value of
    `version` or `format`.

### 1.2 ADT type tables

These rows go into `ADT_TYPES_ONPREM` and `ADT_TYPES_CLOUD` (`src/adt/AdtTypeTables.ts`),
not into `ADT_TYPES_BASIS_740`.

| API | Collection | Code | `nameMaxLength` | Operations | Evidence |
|---|---|---|---|---|---|
| `applicationLog` | `/sap/bc/adt/applicationlog/objects` | `APLO/TYP` | 20 | `source`, `readMetadata` | `system-description-s4-2025--07-typestructure` / `…abap-cloud--07-typestructure` |
| `applicationJobCatalog` | `/sap/bc/adt/applicationjob/catalogs` | `SAJC` | 40 | `source`, `readMetadata` | same |
| `applicationJobTemplate` | `/sap/bc/adt/applicationjob/templates` | `SAJT` | 40 | `source`, `readMetadata` | same |

The name lengths are the `OBJNAME_MAXLENGTH` values that the recorded typestructure of
both releases lists. The recorded 7.40 typestructure lists none of the three codes.

The keyword documentation is no ADT object type, so it has no row.

### 1.3 Tests and docs

- **Tests:**
  - `src/__typechecks__`: each new contract is implementable, and the `analyse` overloads
    narrow as `IApplicationLog`'s do;
  - the existing table typechecks cover the three rows.
- **Docs:**
  - `CHANGELOG.md`: the new contracts, the `accept` option and the three rows;
  - `README.md`: the contract list, where it names the runtime contracts.

## 2. `@mcp-abap-adt/adt-strategies`

### 2.1 Readings

- **`utilDiscoveryTemplates`**, an `IResultStrategy<ReadonlyMap<string, ReadonlySet<string>>>`.
  It reads the discovery document into each collection's path and the parameter names its
  templates declare:
  - the names are taken from `{?a,b}` in every `adtcomp:templateLink/@template` of the
    collection;
  - an absolute `href` is skipped, as `utilDiscoveryCollections` skips it;
  - an answer that is no `app:service` document reads as the empty map;
  - the reading is plain code with no regular expression.
- **`docuPage`**, an `IResultStrategy<IDocuPage>`, where `IDocuPage` is
  `{ title, text, links }` and each link is one of:
  - `{ kind: 'topic', object, version, label }`, from an `adtcom:` link to
    `/sap/bc/adt/docu/abap/langu` with an `object` parameter (`version` is `''` when the
    link carries none);
  - `{ kind: 'external', url, label }`, from any other link.

  How it reads the page:
  - `text` is the page's text in document order, without `style`, `script` and `svg`
    elements, `data:` URIs and markup. Whitespace runs become one space, and the HTML
    entities are decoded.
  - `links` holds every `href` of the page except an empty one and an in-page `#…`
    anchor, in document order, repeats included.
  - The reading is a tokenizer of plain code, with no regular expression and no DOM. It
    does not depend on the page being well-formed XML. Whether every page is XHTML is
    unverified: the pages read declare the XHTML 1.1 doctype.
  - An answer that has no `<html` element reads as `undefined`, and the server then
    answers it as `raw` does (§4.4).
- **`jsonDocument`**, an `IResultStrategy<unknown>`: the body parsed as JSON, or `undefined`
  when it does not parse. It reads the definition sources, which answered
  `application/json` on both kinds.
- **`bluesMetadata`**, an `IResultStrategy<IBluesMetadata>`. It reads the `adtcore:`
  attributes of the root `blue:blueSource` element:
  - `name`, `type`, `description`, `language`, `masterLanguage`, `masterSystem`,
    `abapLanguageVersion`, `version`, `createdAt`, `changedAt`, `createdBy`, `changedBy`
    and `responsible`;
  - `packageName` and `packageDescription`, from `adtcore:packageRef`;
  - every `atom:link` as `{ rel, href, type, title }`.

  Each attribute is optional, as the documents differ: the APLO document read on cloud had
  no `changedAt`.

### 2.2 Tests and docs

- **Unit tests against the corpus** (`packages/adt-clients/corpus/adt/`), using the
  captured, sanitised documents of §3.4:
  - `utilDiscoveryTemplates`: the three recorded discoveries (s4-2025, abap-cloud,
    basis-740), with the template sets each lists for `/sap/bc/adt/docu/abap/langu`:
    - s4-2025 and abap-cloud: `format`, `language`, `uri`, `version` and `format`,
      `language`, `query`, `version`;
    - basis-740: `format`, `language`, `uri`;
    - a malformed answer reads as the empty map.
  - `docuPage`:
    - a hit-list page, a topic page and a "Not found" page per kind;
    - the topic-link count equals the count of `adtcom:` hrefs with `object=` in the
      document;
    - no `data:` survives in `text`;
    - a page truncated mid-tag reads to its end without a throw.
  - `jsonDocument` and `bluesMetadata`: one source and one metadata document per type per
    kind.
- **Docs:** the `README.md` readings list and `CHANGELOG.md`.

## 3. `@mcp-abap-adt/adt-clients`

### 3.1 Members

Every member sends one `GET` and nothing else: no state, no CSRF fetch, no retry. Each one:

- answers through the result strategy of its result set and the `analyse` of the call;
- uses a caller's `accept` as given, and otherwise the default shown below;
- builds its address in `src/endpoints/objects.ts`, with the name through `seg()`.

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
| `getApplicationLog().getObject(name)` | `GET APPLICATION_LOG.uri(name)`, the existing `X-sap-adt-relation` kept | `application/vnd.sap.adt.blues.v1+xml` | `200` on both kinds; namespaced name `200` on premise |
| `getApplicationLog().getSource(name)` | `GET sourceUri(APPLICATION_LOG.uri(name))` | `application/json` | `200` on both |
| `getApplicationJobCatalog().getObject(name)` | `GET APPLICATION_JOB_CATALOG.uri(name)` | `application/vnd.sap.adt.blues.v2+xml` | `200` on both |
| `getApplicationJobCatalog().getSource(name)` | `GET sourceUri(…)` | `application/json` | `200` on both |
| `getApplicationJobTemplate().getObject(name)` | `GET APPLICATION_JOB_TEMPLATE.uri(name)` | `application/vnd.sap.adt.blues.v2+xml` | `200` on both |
| `getApplicationJobTemplate().getSource(name)` | `GET sourceUri(…)` | `application/json` | `200` on both |
| `getKeywordDocumentation().query(p)` | `GET KEYWORD_DOCUMENTATION.collection?query=…[&language][&version][&format]` | `application/vnd.sap.adt.docu.v1+html` | `200` on both; `Accept: application/xml` answered `406` on both |
| `getKeywordDocumentation().topic(p)` | `GET …?object=…[&language][&version][&format]` | same | `200` on both |
| `getKeywordDocumentation().position(p)` | `GET …?uri=…[&language][&version][&format]` | same | `200` on both, but only the start page for the positions tried |

More on these members:

- **Where they live.** `getApplicationJobCatalog`, `getApplicationJobTemplate` and
  `getKeywordDocumentation` are new factories on `AdtRuntimeClient`, beside
  `getApplicationLog`. Each takes an optional result set and builds a fresh implementation
  per call. The result sets are:
  - `applicationJobDocuments`: `object` and `source` slots, `rawDocument` by default;
  - `keywordDocumentationDocuments`: `query`, `topic` and `position` slots, `rawDocument`
    by default.
- **Query parameters** are sent only when given, in the order shown, each value as given
  and URL-encoded by the connection. `language` goes as `language`, never as
  `sap-language`.
- **The existing application-log members** move onto `APPLICATION_LOG`. Their path
  segment changes from the raw name to `seg(name)`, which is the fix for a namespaced name.
  Their query parameters and relation header stay as they are.
- **`version` of the definition reads** goes as the `version` query parameter, as the
  existing application-log members send it.

### 3.2 What a member does not do

- No member reads the page, decides "no hit" or maps a `version`.
- No member checks that a form is announced: that is the consumer's discovery gate.
- No member checks a name against `nameMaxLength`.

### 3.3 Tests

- **Unit tests**, on a connection double, per member:
  - the method, the URL and the encoded path segment, including a namespaced name;
  - the query parameters present and absent, the default and a given `Accept`;
  - that exactly one request is made;
  - that a `404`, `406` and `500` answer comes back through `analyse` and not as a throw;
  - the existing `ApplicationLog.test.ts` is updated for the encoded segment.
- **Enforcement:**
  - `noHardcodedObjectAddresses.test.ts` enforces every string field of the address
    records across `src/`. Once the new records exist it enforces their paths, so the
    literals that `applicationLog/read.ts` holds today must move;
  - `publicApiSurface.test.ts` lists the new factories and result sets;
  - the conformance check holds the three table rows (§1.2) to the recorded typestructure.
- **Live tests** (`src/__tests__/integration/runtime/applicationJob/`, `…/applicationLog/`
  and `…/keywordDocumentation/`), run on premise and on cloud. Every name comes from the
  system, never from a literal:
  - **Definitions**, per type:
    - the first quick-search hit of the type: `getObject` and `getSource` answer `200`,
      with a `blue:blueSource` root and a JSON body;
    - on premise, a namespaced hit where the search returns one: the same;
    - an absent name that fits `nameMaxLength` (generated at run time, checked absent by
      quick search first): `404` for both reads;
    - APLO with a name one character over 20: the answer is recorded, its status asserted
      as `500` on cloud. On premise this is unverified, and the test records what it gets.
  - **Keyword documentation:**
    - `query` with the configured keyword (test-config key, default `SELECT`): `200`, a
      title other than "Not found", and at least one topic link;
    - `query` with a generated term that matches nothing: `200`, title "Not found";
    - `topic` with the first topic link of the hit list, sent with its `version`: `200`
      and that topic's title;
    - the same topic with no `version`, and with the other kind's link value: each page's
      text differs from the linked one (the goal's link-fidelity measurement, kept as a
      test);
    - `position` on a statement of a class source found at run time: the test asserts
      `200` and records the title. It is labelled as a measurement, and it is what can make
      the position form eligible later;
    - `Accept: application/xml`: `406`.
- **ERRATA** (`docs/usage/ERRATA.md`), one entry each, with Symptom, Cause, Rule,
  Workaround and Evidence:
  - a query with no hit answers `200` "Not found";
  - the topic form, which no discovery template announces, is what every topic link uses;
  - an unknown `version` (`1`, `6`) answers `500`;
  - an APLO name over 20 characters answers `500` "Data was lost while copying a value"
    on cloud.

### 3.4 Corpus

New cases under `corpus/adt/`:

- one per type per kind, for the object document and the source;
- for the keyword documentation: a hit-list page, a topic page and a "Not found" page per
  kind.

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
  namespaced names; the new `accept` option.
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
    `…/handleGetApplicationJobTemplate.ts`, registered in `ReadOnlyHandlersGroup`.
  - All four are in `readDefinitions.ts`, because the compact routes are their entries.
- **Long read.** `GetAbapKeywordDocumentation` goes into `LONG_TOOLS` (`src/lib/longTools.ts`)
  and `tools/long-handlers.json`, so it declares `background` and runs on an ABAP session
  of its own. `HandlerGet` and `HandlerSystem` are listed already, and their new type and
  action follow them with no `NOT_A_READ` entry. The three full definition tools are not
  long reads.
- **Compact entries:**
  - the three types go into `CompactObjectType` / `COMPACT_OBJECT_TYPES` and
    `compactMatrix.ts` (`get` only), each routed to its full tool;
  - `keyword_documentation` goes into `SYSTEM_ACTIONS` with
    `SYSTEM_ACTION_TOOLS.keyword_documentation = 'GetAbapKeywordDocumentation'`, and its
    `ACTION_WORDS` entry is "keyword_documentation (the ABAP keyword documentation)".
- **`-ro` sets.** The `-ro` sets take them through the existing groups and
  `compactReadOnlyTools.ts`: every new entry is a read.
- **Batch.** The full binaries serve no batch mode. The batch sentences of `HandlerGet` and
  `HandlerSystem` stay as they are, and `tools/batch-handlers.json` and the batch test show
  the new type and action are recordable, as the other reads of those tools are.
- **Access restrictions.** `--deny-actions` takes each new tool by name, and
  `HandlerGet.<TYPE>` and `HandlerSystem.keyword_documentation` as values, as it takes the
  existing ones.

### 4.2 Schemas

`GetAbapKeywordDocumentation`:

- `query?: string` (min 1): a word or phrase to search the documentation for.
- `topic?: string` (min 1): a topic name, as a documentation link of an earlier answer
  carries it.
- `version?: string` (min 1): the `version` that documentation link carries. It is taken
  only with `topic`.
- `language?: string` (min 1): the documentation's language. Without it, the system's
  default answers.
- `detail` (`DETAIL_SHAPE`).
- `background` (the long-read field).
- **Refinements**, refused by the schema before anything is sent:
  - exactly one of `query` and `topic`;
  - `version` without `topic`.
- **No `uri` argument.** The position form is eligible nowhere (§4.5), so no schema offers
  it. Its argument is added when a live test makes it eligible on a kind.

`GetApplicationLogDefinition` (`application_log_name`), `GetApplicationJobCatalog`
(`job_catalog_name`) and `GetApplicationJobTemplate` (`job_template_name`):

- The name is a string, min 1 and max the table's `nameMaxLength`: 20, 40 and 40. A longer
  name is refused by the schema before anything is sent. The max is the declared table
  value and no guess, and it keeps a call from reaching the `500` measured on cloud for an
  over-long APLO name.
- `part`: `source` (default) or `metadata`. Its own words: "source" the definition (JSON),
  "metadata" the ADT object document.
- `version`: `READ_VERSION_FIELD`, as the other `Get<Type>` tools take it (`readVersion.ts`).
- `detail`.

The compact entries take these arguments:

- the `HandlerGet` types: `object_name`, `part`, `version` and `detail`, through the target
  tool's own parse;
- `HandlerSystem` `keyword_documentation`: `query`, `topic`, `version`, `language`,
  `detail` and `background`. `query` is the existing property, and its words gain the
  action's sentence through `said()`.

The descriptions name nothing concrete (`toolDescriptionsCarryNoLiterals.test.ts`):

- every description is functional;
- each definition tool's description says it reads a definition, not log entries, job runs
  or job logs.

### 4.3 Calls

- **Keyword documentation:**
  - with `query`, the handler calls `getKeywordDocumentation(results).query({ query,
    language, version: undefined })`;
  - with `topic`, it calls `topic({ object: topic, language, version })`;
  - neither call sends `format`. For the query form, the body with `format=eclipse` and
    the body without it were byte-equal on cloud (after the host) and the same size on
    premise.
- **Definitions:** the handler calls the type's `getObject` (`part: metadata`) or
  `getSource` (`part: source`), with `version`. Each call sends one request.
- **Analyse.** Every call passes `analyseException`.

### 4.4 Answers per `detail`

Each tool states a `DetailTable` (`src/lib/detail`). The reading is selected before the call,
and its value is answered as it is.

`GetAbapKeywordDocumentation`:

| `detail` | Answer |
|---|---|
| `terse` (default) | Text, written by the listing writer: `# title <title>`, then the page text as one line, then `# links <count>` and a TSV row per link: `topic`, object, version, label, or `external`, URL, label |
| `medium`, `full` | JSON `{ title, text, links }`, the whole `docuPage` reading |
| `raw` | The HTML as sent |

- Every level holds every link the page carries (the goal's rule).
- A "Not found" page is a success at every level, and its title and text say so.
- A page the reading cannot read (`undefined`) is answered at every level as `raw` answers
  it.

Definition tools, `part: source`:

| `detail` | Answer |
|---|---|
| `terse`, `medium`, `full` | The parsed JSON (`jsonDocument`) as a JSON value, or the body as sent when it does not parse |
| `raw` | The body as sent |

Definition tools, `part: metadata`:

| `detail` | Answer |
|---|---|
| `terse` | JSON `{ name, type, description, packageName, language, masterLanguage, abapLanguageVersion, version, createdAt, changedAt? }` |
| `medium`, `full` | The whole `bluesMetadata` reading, user fields and links included |
| `raw` | The document as sent |

**Failures, at every level.** A non-`2xx` answer is answered on the existing failure path
(`answer` / `return_answer`): an error with SAP's status and SAP's message from the exception
document, the same whatever `detail` was asked for. The measured failure cases are these:

- `404` for an absent name;
- `406`;
- `500` for an unknown `version`, which comes as an HTML page with no exception document.
  Its message is whatever the existing failure path makes of a non-XML body. A unit test
  on the captured page pins it: that path is not changed here.

### 4.5 Availability

**Static: `available_in` and the eligibility table.**

All four full tools are `available_in: ['onprem', 'cloud']`.

`src/lib/supportReads/eligibility.ts` holds one row per form per kind. Each row is `eligible`
or not, and names the live test that measured it:

| Form | `onprem` | `cloud` | `legacy` |
|---|---|---|---|
| keyword documentation, query | eligible | eligible | not |
| keyword documentation, topic | eligible | eligible | not |
| keyword documentation, position | not | not | not |
| definition read APLO / SAJC / SAJT (each) | eligible | eligible | not |

How the table is used:

- A form that is not eligible on the stated kind is not offered:
  - the position form is in no schema;
  - on `legacy` the full tools are not registered (`available_in`);
  - the compact type values and the action are left out where the registration knows the
    stated environment (`statedEnvironment`, as `subResources.ts` reads it).
- **The guarantee is at call time.** A form that is not eligible on the stated kind is
  refused `support_read_not_eligible`, with no request: "this read is not served on this
  kind of system; nothing was sent".
- A unit test keeps the table, `available_in` and the schemas equal.

**Runtime: discovery.**

`src/lib/supportReads/served.ts` reads the discovery once per system key with
`utilDiscoveryTemplates`. It keeps the answer as `abapGit/availability.ts` keeps its own:

- one read is shared by concurrent callers;
- a failed or empty read is not kept and answers "not served";
- the connection-reset hook clears it.

What each form needs to be served:

| Form | Discovery must list |
|---|---|
| query | `/sap/bc/adt/docu/abap/langu` with a template declaring `query` |
| topic | `/sap/bc/adt/docu/abap/langu` |
| APLO | `/sap/bc/adt/applicationlog/objects` |
| SAJC | `/sap/bc/adt/applicationjob/catalogs` |
| SAJT | `/sap/bc/adt/applicationjob/templates` |

A form that is not served is refused `support_read_not_served`, with no request: "this
system's discovery does not list this read, or could not be read; nothing was sent".

The discovery read itself goes on the instance's connection. For the long read it goes on
the read's own session, as the long read's first request.

**No probing.** Nothing else is sent to decide availability.

### 4.6 Refusals

- **Schema refusals:** a name that is missing, empty or over its length; both or neither of
  `query` and `topic`; `version` without `topic`; an unknown `part` or `detail`.
- **`support_read_not_eligible`**, and **`support_read_not_served`**: new `ServerRefusal`
  codes in `src/lib/auth/serverRefusal.ts`, each with fixed words.
- **The existing refusals** apply as they do to every tool: `system_type_required`, a
  denied action, a `background` on a non-long call.
- **SAP's own answers** (§4.4) are failures, not refusals.

### 4.7 Tests

- **Unit tests:**
  - the schemas: the refinements, the name maxima, and that the position argument is
    absent;
  - the eligibility table against `available_in` and the compact enums;
  - `served.ts`: kept, shared, reset, and failing closed on an unreadable discovery, with a
    discovery double built from the three recorded discoveries. basis-740 lists the
    collection with no `query` template, so the query form is not served there;
  - the two refusals send nothing (a connection double counts requests);
  - each `DetailTable`, against the corpus cases of §3.4: every level, the link rule
    (every link present at `terse`, `medium` and `full`), the "Not found" page, an
    unreadable page;
  - the failure path at every level, for `404`, `406` and the HTML `500`;
  - the `LONG_TOOLS` / `tools/long-handlers.json` equality, and that a background run of
    `GetAbapKeywordDocumentation` answers a `run_handle`;
  - the compact routes: each new type and the action reach their full tool with the
    target's parse;
  - the `-ro` sets carry every new entry, and the tool counts match the docs.
- **On-the-wire tests:** the real adt-clients over a connection double, through each
  handler. They assert the exact request each call sends:
  - the URL and the encoded segment;
  - `query`, `object`, `language` and `version` present only when given, and no `format`;
  - the default `Accept`;
  - one request per call after the discovery read;
  - and how each answer is read.
- **Live tests** (`src/__tests__/integration/readOnly/system/` for the documentation, and
  `…/readOnly/support/` for the definitions), on premise and on cloud, with the
  `test-config.yaml.template` entries stating `available_in: [onprem, cloud]`. They are
  soft-mode tests, and one hard-mode run of each file before the release:
  - definitions: the first search hit of each type, both parts, every `detail`; an absent
    name answers the `404` failure;
  - documentation: a query (hits), a topic followed from that answer's first topic link
    with its `version` (its title is the link's label), and a no-hit query ("Not found",
    a success). It runs once in the call (`background: false`) and once in the background
    through `GetBackgroundRun`;
  - the compact entries: one call each, through `HandlerGet` and `HandlerSystem`.

### 4.8 Docs

- **`README.md`**: the feature list and the first-screen tool overview.
- **Generated**:
  - `docs/user-guide/AVAILABLE_TOOLS.md` and `AVAILABLE_TOOLS_READONLY.md`
    (`tools/generate-tools-docs.js`);
  - `compact/docs/AVAILABLE_TOOLS.md`;
  - `tools/tool-search.json` and the prompt listings, where their tests ask for them.
- **`docs/user-guide/HANDLERS_MANAGEMENT.md`**: the tool counts per binary and transport
  (core and core-ro +4, compact and compact-ro +0), the `HandlerSystem` action list and
  the `HandlerGet` type list.
- **`docs/user-guide/ACCESS_RESTRICTIONS.md`**: deny entries for the new tool, type and
  action, if the page lists entries by tool.
- **`docs/user-guide/BATCH_MODE.md`**: if it lists the recordable reads of `HandlerGet` and
  `HandlerSystem`.
- **`CLAUDE.md`'s "Cloud vs On-Prem"**: not changed by this work. The controller proposes
  a line to the owner.
- **`CHANGELOG.md`**: 24.3.0, with:
  - the tools, the types and the action;
  - what is not served (the position form, `legacy`);
  - the dependency versions.

### 4.9 Release

The release follows the order above. `mcp-abap-adt` takes `interfaces-adt`, `adt-strategies`
and `adt-clients` only once they are visible on the registry.

Before the tag:

- the full integration run on premise and on cloud;
- `npm run test:install`.

After publishing: `npm run release:verify`.

This goal, spec and plan are deleted before the tag.
