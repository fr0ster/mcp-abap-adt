# Support reads over ADT — goal

## What it is for

An agent that supports an ABAP system answers two kinds of question it cannot answer through
mcp-abap-adt today. The first is "what does this statement do": it needs the ABAP keyword
documentation of the system it works on, not one from the web for another release. The second
is "what is this application log object or application job": it needs the definitions behind
them. Both are served by ADT on cloud and on premise. With this change the agent reads them
through MCP, in every binary, the `-ro` ones included, because nothing here changes the system.

## The behaviour

- **ABAP keyword documentation** (`/sap/bc/adt/docu/abap/langu`). The agent can:
  - search it by a keyword and get the system's hit list, or the topic itself when the
    keyword names one;
  - read one topic by the name a hit list links to;
  - read the topic for a position in a source (the `uri` form of the discovery template).

  The language is the caller's. Measured on cloud: `language=DE` answered the same English
  page as `EN`, so whether another language is served depends on the system (unverified). Every hit and every link the page carries reaches the
  model, so the next call can follow it.
  - Measured on cloud and on premise: the query form answers `200`.
  - Measured on cloud: the topic form (`object=`) answers `200`. The hit list links only to
    that form, which the discovery template does not list. The `uri` form answers `200`, but
    for the position tried (a class source, line 1, column 1) it gave the documentation's
    start page, so what a position resolves to is unverified.
    The only media type served is `application/vnd.sap.adt.docu.v1+html`; any other `Accept`
    gets `406`.
  - Measured on cloud: a query with no hit answers `200` with a "Not found" page, not `404`.
    An unknown `version` value answers `500`.
  - Measured on cloud (SAP's `sap-perf-fesrec`): a page read for the first time took up to
    about 100 s on the server, and the same page asked again under 1 s. So no read may carry a
    timeout of the server's choosing, which the limits invariant below already says.
  - Unverified on premise: the topic form, the `uri` form, the no-hit answer and the
    `version` values.
- **Definitions of application log objects, application job catalogs and application job
  templates** (APLO, SAJC, SAJT). The agent can read each one's source and its metadata
  document, by name:
  - the source is the JSON definition: the subobjects of a log object, the class of a
    catalog, the catalog of a template;
  - the metadata document is the ADT object document: description, package, language and
    links.

  The tools state in their names and descriptions that they read definitions. They read no
  log entries, no job runs, no job logs and no spool. An agent that wants SLG1 or SM37 data
  learns from the description that these tools do not serve it.
  - Measured on cloud: all six reads (object and source of each type) answer `200`. An absent
    name answers `404`.
  - Measured on premise: the APLO and SAJC object reads answer `200`.
  - Unverified on premise: the SAJT object read and the three source reads.
  - Finding these objects needs no new tool. The interfaces-adt search tables list `APLO`,
    `SAJC` and `SAJT` on both variants, which is what `SearchObject` checks its type
    against. Measured on cloud and on premise: the quick search for each type answers `200`.
- **Tool sets.**
  - Full sets (core, core-ro, on stdio, HTTP and SSE):
    - one keyword-documentation tool;
    - one `Get<Type>` per definition type, with `part` set to `source` (the default) or
      `metadata`, as other `Get<Type>` tools take it.
  - Compact sets (compact, compact-ro):
    - the three definition types become `HandlerGet` object types, with the same two parts;
    - the keyword documentation is one more `HandlerSystem` action.

    So the compact tool count does not grow. The batch-mode sentence of each tool is decided
    in the spec.
  - All of these are reads, so every `-ro` binary carries them. None is a data tool: the
    keyword documentation is SAP's product text, and a definition is a repository object.
- **Answer forms.** Each tool takes `detail` like the other reads. `raw` answers the document
  as ADT sent it. What the other levels answer is set in the spec, as a reading in
  adt-strategies, never trimmed afterwards. See the open questions for the keyword
  documentation.
- **Availability per system kind, then per discovery.**
  - The definition tools are listed on `onprem` and `cloud`. The recorded 7.40 discovery
    lists none of the three collections, so they are not listed on `legacy`.
  - The keyword-documentation tool is listed on `onprem` and `cloud`. On `legacy`, see the
    open questions.
  - On every kind, a call is served only when the system's discovery lists the tool's
    collection (`/sap/bc/adt/docu/abap/langu`, `/sap/bc/adt/applicationlog/objects`,
    `/sap/bc/adt/applicationjob/catalogs`, `/sap/bc/adt/applicationjob/templates`).
    Otherwise it is refused as not served, with no request. The discovery answer is kept per
    system, as abapGit's is.
- **SAP's answer reaches the model as it is.** A `404`, `403`, `406` or `500` is SAP's
  verdict, returned like every other ADT answer. The no-hit page is answered as the page
  says it. Nothing is retried and nothing is substituted.

## Invariants

- **One adt-clients member, one request, one endpoint, no interpretation.** Each read is its
  own member:
  - the keyword-documentation query, topic and position forms are three members;
  - each definition type has an object member and a source member.

  A member sends the caller's parameters as given and answers through the result and
  analyse strategies it is handed. Readings and verdicts live in adt-strategies.
- **Addresses are built in one place.** An object's address comes from
  `src/endpoints/objects.ts`, with the name encoded. A namespaced name (`/NS/NAME`) reaches
  SAP as one path segment. The existing application-log members build their path by
  interpolating the raw name, so they move there as well.
- **No server-chosen limits.** The server sets no result count, size cut, page limit or
  timeout of its own on any of these reads. A hit list and a page are answered whole at the
  chosen `detail`.
- **On or off by system kind and by discovery, nothing else.** No probe beyond the discovery
  read, and no guess from credentials or the URL.
- **Every SAP claim is measured or marked unverified,** in the code comments, the docs and
  the tests. Each tool is pinned by unit tests and by live tests on every system kind that
  lists it.
- **Descriptions name nothing concrete.** No object, package or keyword example in a tool or
  parameter description.
- **Packages from the registry, in order.** Packages are published in this order:
  1. `@mcp-abap-adt/interfaces-adt`;
  2. `@mcp-abap-adt/adt-strategies` and `@mcp-abap-adt/adt-clients`;
  3. `mcp-abap-adt`.

  Each consumer builds only against the published version.

## Where it is built

- **interfaces-adt:**
  - the contracts of the new members and their options: the keyword-documentation reads,
    the application job catalog and template reads;
  - the existing `IApplicationLog` kept or aligned;
  - the media types.
- **adt-clients:**
  - the members, with their result sets and address records;
  - the application-log members moved onto encoded addresses;
  - unit tests and live tests on cloud and on premise;
  - ERRATA entries for the no-hit `200` and the topic form missing from discovery.
- **adt-strategies:** the readings behind each `detail` level that is not `raw`.
- **mcp-abap-adt 24.3.0:**
  - the full tools, the `HandlerGet` types, the `HandlerSystem` action and the discovery
    gate;
  - unit and live tests;
  - the docs: README feature list, `AVAILABLE_TOOLS*`, the compact pages,
    `HANDLERS_MANAGEMENT.md` tool counts, and the CHANGELOG.

## Out of scope

- SLG1 log entries and messages, SM37 jobs, steps and job logs, and SP01 spool. Their only
  online path is RFC function modules with an XMI logon, which has no cloud path. That is
  its own task after 24.3.0.
- Report variants and function-module test data.
- IMG and customizing search. Table reads are ruled out by the SAP API Policy.
- SM50 work processes: `403` on cloud, `405` on premise.
- SE61 general texts (DOCT).
- Writing, creating, locking or deleting any APLO, SAJC or SAJT object.

## Open questions

1. **What the keyword documentation answers at `terse`.**
   - The page is 125–175 KB of HTML, about 70% embedded images and 10% style. The topic
     `SELECT` measured 148 KB of HTML and about 10 KB of text.
   - Recommendation:
     - `raw`: the HTML as sent;
     - `terse`: the page's text plus a list of its links (each a topic name and its label),
       an adt-strategies reading;
     - `medium` and `full`: the same text with every link, the external ones included.
2. **The topic form (`object=`) is not in the discovery template.**
   - The hit list links only to it. Without it, the agent cannot open a hit.
   - Recommendation: take it as its own member, gated by the same collection. Measure it on
     premise with `probe-support-reads-goal.sh` before the spec. If it fails there, drop it
     on premise.
3. **`version`.**
   - The discovery template lists it, and the hit list's links carry `version=5`.
   - Measured on cloud:
     - `1` and `6` answer `500`, while `2`, `3`, `4`, `5` and `X` answer `200`;
     - the pages differ, and which language version each value selects is unverified;
     - without `version`, the hit list's page names ABAP for Cloud Development.
   - Recommendation: offer `version` only after the script has mapped its values on both
     kinds, as an enum of the measured values with each one's meaning. Until then, leave it
     out and let SAP's default answer.
4. **Legacy (7.40).**
   - The recorded discovery lists `/sap/bc/adt/docu/abap/langu` with the `uri` template only
     (no `query`, no `version`). Nothing is measured there, and legacy is RFC.
   - Recommendation: run the script on legacy in its window. List the tool on `legacy` only
     for the forms that answer `200`. Otherwise keep it off on `legacy` in 24.3.0.
5. **Tool names.**
   - `GetApplicationLogObject` would be found by a search for "application log" and then
     answer no log entries.
   - Recommendation: `GetApplicationLogDefinition`, `GetApplicationJobCatalog` and
     `GetApplicationJobTemplate`, with `HandlerGet` types `APPLICATION_LOG_DEFINITION`,
     `APPLICATION_JOB_CATALOG` and `APPLICATION_JOB_TEMPLATE`. Catalog and template are
     definitions by name already. The keyword tool would be `GetAbapKeywordDocumentation`,
     and the `HandlerSystem` action `keyword_documentation`.
