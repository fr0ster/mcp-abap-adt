# Support reads over ADT — goal

## What it is for

An agent that supports an ABAP system answers two kinds of question it cannot answer through
mcp-abap-adt today. The first is "what does this statement do": it needs the ABAP keyword
documentation of the system it works on, not one from the web for another release. The second
is "what is this application log object or application job": it needs the definitions behind
them. ADT served both on the cloud and on-premise systems measured. With this change the agent
reads them through MCP, in every binary, the `-ro` ones included, because nothing here changes
the system.

## The behaviour

- **ABAP keyword documentation** (`/sap/bc/adt/docu/abap/langu`). The agent can use three
  forms:
  - the **query form**: search by a keyword and get the system's page for it, a hit list or
    the topic itself;
  - the **topic form** (`object=`): read one topic by the name a link carries;
  - the **position form** (`uri=`): read the topic for a position in a source.

  The language is the caller's; without it, SAP's default answers. A link on a page carries a topic name and a `version`. The
  topic form takes both and sends `version` as the link gave it, so the agent can follow a
  link to the page it points to (see "`version` is passed as a link carries it").

  Measured on cloud and on premise:
  - each of the three forms answered `200`;
  - the topic form is in neither discovery template, but every topic link on the pages read
    uses it;
  - asked with `Accept: application/xml`, the query form answered `406`, naming
    `application/vnd.sap.adt.docu.v1+html` as the accepted type; no other media type was
    tried;
  - a query with no hit answered `200` with a page titled "Not found", not `404`;
  - for the one position tried (a class source, line 1, column 1), the position form
    answered the documentation's start page. Whether a position inside a statement answers
    its topic is unverified.

  Measured on cloud only:
  - `language=DE` answered the same English page as `EN`. Whether another language is
    served depends on the system (unverified).
  - SAP's `sap-perf-fesrec` showed a first read of a page taking up to about 100 s on the
    server, and the same page asked again under 1 s.
- **Definitions of application log objects, application job catalogs and application job
  templates** (APLO, SAJC, SAJT). The agent can read each one's source and its metadata
  document, by name.

  The tools state in their names and descriptions that they read definitions. They read no
  log entries, no job runs, no job logs and no spool. An agent that wants SLG1 or SM37 data
  learns from the description that these tools do not serve it.

  Measured on cloud and on premise, one object of each type per kind:
  - the source and the metadata document both answered `200`, namespaced names included
    (on premise);
  - the source was a JSON document: a header, plus the subobjects (APLO), the class (SAJC)
    or the catalog name (SAJT);
  - the metadata document was an ADT object document with a description, language and
    links.

  The fields of other objects of these types are unverified.

  An absent name, both the object document and the source:
  - Measured on cloud and on premise, with a 7-character name: `404` for all three types.
  - Measured on cloud, with a 21-character name: `404` for SAJC and SAJT. APLO answered
    `500` "Application Server Error", "Data was lost while copying a value". That a name
    longer than the type's name field causes it is inferred, not verified. The answer
    reaches the model as SAP's failure, like any other.
  - The 21-character name on premise is measured for the template object document only:
    `404`.

  Finding these objects needs no new tool. The interfaces-adt search tables list `APLO`,
  `SAJC` and `SAJT` on both variants, and `SearchObject` checks its type against those
  tables. Measured on cloud and on premise: the quick search for each type answered `200`
  with hits.
- **Tool sets.**
  - Full sets (core, core-ro, on stdio, HTTP and SSE):
    - `GetAbapKeywordDocumentation`, a long read (it may run in the background, as the
      listed long reads do): measured on cloud, a first read of a page took up to about
      100 s on SAP's side;
    - `GetApplicationLogDefinition`, `GetApplicationJobCatalog` and
      `GetApplicationJobTemplate`, each with `part` set to `source` (the default) or
      `metadata`, as other `Get<Type>` tools take it. They are plain reads, like every other
      `Get<Type>`: each definition read took under 1 s on SAP's side on both kinds
      (measured, `sap-perf-fesrec`).

    The name `GetApplicationLogDefinition` says that it reads a definition, so a search for
    application logs does not take it for SLG1 data.
  - Compact sets (compact, compact-ro):
    - `HandlerGet` object types `APPLICATION_LOG_DEFINITION`, `APPLICATION_JOB_CATALOG`
      and `APPLICATION_JOB_TEMPLATE`, with the same two parts;
    - `HandlerSystem` action `keyword_documentation`.

    `HandlerGet` and `HandlerSystem` are long reads already, and the new types and action
    follow their tool as it is. So the compact tool count does not grow. The batch-mode
    sentence of each tool is decided in the spec.
  - All of these are reads, so every `-ro` binary carries them. None is a data tool: the
    keyword documentation is SAP's product text, and a definition is a repository object.
- **Answer forms.** Each tool takes `detail` like the other reads:
  - `raw` answers the document as ADT sent it;
  - for the keyword documentation, every level keeps every link the page carries: each
    topic link with its topic name, `version` and label, and each external link with its
    URL and label;
  - `terse` is the page's text and those links;
  - what `medium` and `full` add is set in the spec;
  - every level other than `raw` is a reading in adt-strategies, never trimmed afterwards.
- **Availability.** Three things decide it, kept apart:
  1. **Eligibility per system kind and per form, decided at development time from
     measurements.**
     - Each form is eligible on a kind only after a live read on that kind met that form's
       own condition. A `200` alone is not enough.
     - The conditions:
       - query form: a keyword with hits answers its hit list or its topic, with text;
       - topic form: a topic name answers that topic's page, with text;
       - position form: a position inside a statement answers that statement's topic, not
         the start page;
       - each definition read: an existing name answers its document, and an absent name
         that fits the type's name field answers `404`, for both the object document and
         the source.
     - A tool is listed on a kind (`available_in`) when at least one of its forms is
       eligible there.
     - A form not eligible on the kind of the system reached is refused as not served,
       with no request, whatever discovery says. Which forms are eligible on which kind is
       a static table in the code, beside its live tests.
     - As measured:
       - on `onprem` and `cloud`, the query form and the topic form are eligible;
       - on `onprem` and `cloud`, the three definition reads are eligible;
       - the position form is eligible nowhere yet, since the one position tried answered
         the start page; its live test has to show a statement's topic first;
       - on `legacy`, no definition read is eligible: the recorded 7.40 discovery lists
         none of their collections;
       - the keyword documentation is off on `legacy` in 24.3.0: no form of it is measured
         there.
  2. **The runtime gate, from the system's discovery alone.** An eligible form is served
     only when the discovery of the system reached lists what that form needs. Otherwise it
     is refused as not served, with no request. Each form needs:
     - the query form: the collection with its `query` template;
     - the position form: the collection with its `uri` template;
     - the topic form: the collection, since no template announces it;
     - a definition read: its collection (`/sap/bc/adt/applicationlog/objects`,
       `/sap/bc/adt/applicationjob/catalogs` or `/sap/bc/adt/applicationjob/templates`).

     The discovery answer is kept per system, as abapGit's is.
  3. **No runtime probing.** Nothing is sent to find out whether a form works. The
     measurements behind step 1 are made during development, by the live tests.

- **Access restrictions hold.** Each new tool, and each new `HandlerSystem` action and
  `HandlerGet` type, can be denied through `--deny-actions` like any other.

## Invariants

- **SAP's answer reaches the model as it is, at every `detail`.**
  - A non-`2xx` answer reaches the model as a failure, with SAP's status and SAP's message
    (its exception document's text), whatever level was asked for.
  - No level turns a failure into a success or a success into a failure.
  - A `200` "Not found" page is a success at every level. Its text says there is no hit,
    as SAP wrote it; the server adds no verdict of its own.
  - Nothing is retried and nothing is substituted.
- **One adt-clients member, one request, one endpoint, no interpretation.** Each form of the
  keyword documentation is its own member, and so is each definition read. A member sends
  the caller's parameters as given and answers through the result and analyse strategies it
  is handed. Readings and verdicts live in adt-strategies.
- **A name reaches SAP as one path segment.** A namespaced name (`/NS/NAME`) is encoded.
  Measured on premise: the `%2f`-encoded names answered `200`. This holds for the existing
  application-log members too.
- **`version` is passed as a link carries it.**
  - The discovery templates list `version`. On the pages read, the topic links carried
    `version=5` on cloud and `version=X` on premise, whether or not the page itself was
    asked with a `version`.
  - Measured on cloud for three topics and on premise for three topics: the page without
    `version` differed from the page with `5` and from the one with `X`, and those two
    differed from each other. So a link is followed only by sending its `version`.
  - Measured on both kinds: `1` and `6` answered `500`, while `2`, `3`, `4`, `5` and `X`
    answered `200`.
  - What each value selects is unverified. The parameter is described as "the `version` a
    documentation link carries", with no meaning of its own.
  - Without it, SAP's default answers.
- **No server-chosen limits.** The server sets no result count, size cut, page limit or
  timeout of its own on any of these reads. A page or a document is answered whole at the
  chosen `detail`.
- **Every SAP claim is measured or marked unverified,** in the code comments, the docs and
  the tests. Each tool is pinned by unit tests, and by live tests on every system kind that
  lists it.
- **Descriptions name nothing concrete.** No object, package or keyword example in a tool or
  parameter description.
- **Packages from the registry, in order.** Packages are published in this order:
  1. `@mcp-abap-adt/interfaces-adt`;
  2. `@mcp-abap-adt/adt-strategies` and `@mcp-abap-adt/adt-clients`;
  3. `mcp-abap-adt`.

  Each consumer builds only against the published version.

## Packages touched

- `@mcp-abap-adt/interfaces-adt`: the contracts.
- `@mcp-abap-adt/adt-clients`: the members.
- `@mcp-abap-adt/adt-strategies`: the readings.
- `mcp-abap-adt` 24.3.0: the tools and their docs.

The breakdown within each package is the spec's.

## Out of scope

- SLG1 log entries and messages, SM37 jobs, steps and job logs, and SP01 spool.
  - The research found no ADT collection or feed for them on either kind, and RFC-enabled
    function modules for them on both.
  - Whether another online path exists is unverified.
  - Reading them over RFC is its own task after 24.3.0.
- Report variants and function-module test data.
- IMG and customizing search. The research found no ADT path for it, and reading the
  tables is excluded by the SAP API Policy (FAQ Q33).
- SM50 work processes. Measured: `403` on cloud, `405` on premise.
- SE61 general texts (DOCT).
- Writing, creating, locking or deleting any APLO, SAJC or SAJT object.
- The keyword documentation on `legacy`: it belongs to the legacy live-coverage task. That
  task measures each form against its condition from "Availability".
