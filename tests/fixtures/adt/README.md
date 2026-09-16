# Raw ADT wire corpus

Real responses from a real SAP system, recorded byte for byte, so the result and
error strategies (`docs/superpowers/specs/2026-09-08-result-error-strategies-design.md`)
can be written against documents someone has actually seen. Writing a parser first
and meeting the document later is how the transport-tree parser broke in #168.

**What this is: a catalogue of response variants.** One endpoint answers
differently depending on the state it is asked about — a name that is free or
taken, an object locked or not, a package populated, empty or absent, a source
that compiles or does not. Those are not contradictions to be resolved; they are
the variants a strategy has to survive. The corpus exists to enumerate them, and
a gap here is a state nobody has seen the answer for, not a disagreement.

So read the coverage table below as: which endpoint, in which state, answered
what. Where an endpoint has one row, one state has been observed and the others
are unknown.

48 cases, 61 exchanges. Captured by `scripts/capture-adt-corpus.ts` against the
ABAP trial system, package `ZMCP_SHR_PKG` and its 29 restored polygon objects.

## Layout

Each exchange is two files:

- `<case>--<NN>-<tag>.body.{xml,txt,json}` — the response body, unparsed.
- `<case>--<NN>-<tag>.json` — the sidecar: request method, url, **params**,
  caller headers, request body, and the response status and headers.

`_run-<timestamp>.json` is a run manifest: every case, its outcome and its
exchange count. A case recorded as `skipped` was never attempted; one recorded as
`completed` with zero exchanges was attempted and produced nothing.

Two runs built this corpus. The first captured nineteen cases and was cut short
before its own cleanup, which is why the manifest feature exists at all; it
predates that feature and left no manifest. The second topped the corpus up and
re-captured the nodestructure cases so they would carry `params`. Four bodies
from the first run were scrubbed of the SAP user id afterwards with a literal
substitution, the same one the recorder now performs during capture.

Read `request.effectiveUrl` in the sidecar, not `request.url`. `makeAdtRequest`
takes the query string as a separate `params` option and much of adt-clients uses
it, so the bare url does not identify the request. All twelve nodestructure
exchanges address the same endpoint and differ only in `params`.

## What is not verbatim

- **Request headers are the caller's, not the wire's.** The connection adds the
  default Accept, `sap-adt-connection-id`, the stateful-session headers, the CSRF
  token and Authorization below the interception point. That is also why no
  credential can appear here: the recorder never sees one.
- **The SAP user id is replaced with `SAPUSER01`.** SAP writes it into ordinary
  answer text, so it is substituted rather than dropped, an error strategy still
  has to see that a user name sits there. This makes the body a few bytes shorter
  than the recorded `content-length`. Do not assert on `content-length`.
- The CSRF handshake and the 403-retry are invisible here. They happen inside
  `makeAdtRequest`, below the interceptor.

## Normal cases

| Case | What provoked it | What came back |
|---|---|---|
| `read-class-source-text` | read `ZBP_MCP_SHR_I_ROOT` | 200, `text/plain`, ABAP source |
| `read-function-module-source-text` | read `Z_MCP_SHR_FM` in `ZMCP_SHR_FGRP` | 200, `text/plain`, ABAP source |
| `check-success-verdict` | check the active `ZBP_MCP_SHR_I_ROOT` | 200, `chkrun:checkReport status="processed"`, no messages |
| `activation-success-verdict` | activate the scratch class with valid source | 200, `chkl:properties activationExecuted="true"`, no `msg` children |
| `activation-nothing-to-activate` | activate the same class again, with nothing left to do | 200, `activationExecuted="false"`, `generationExecuted="true"`, **no `msg` children** — the attribute alone is not a refusal |
| `delete-success` | delete the scratch class, unlocked | 200 twice: `isDeletable="true"`, then `isDeleted="true"` |
| `read-table-metadata-structure` | read metadata of `ZMCP_SHR_RTABL` | 200, `blueSource` document |
| `read-package-contents-structure` | contents of `ZMCP_SHR_PKG` | 200, `asx:abap` with populated `OBJECT_TYPES` |
| `read-object-tree-structure` | walk `ZMCP_SHR_PKG`, depth 2 | 200 × 8, one root call then one per object type |
| `read-where-used-list-structure` | where-used on `ZBP_MCP_SHR_I_ROOT` | 200, `usageReferenceResult numberOfResults="1"` |
| `read-transport-search-configurations` | the saved transport searches this system holds | 200, `configurations:configurations`, one `configuration` addressed by an `atom:link href` |
| `read-transport-list-structure` | transport requests for the saved search above | 200, `tm:root` → `tm:workbench` → `tm:modifiable` → one `tm:request` |
| `lock-success` | lock the scratch class | 200, `asx:abap` carrying the lock handle |
| `unlock-success` | unlock with a valid handle | 200, **zero-byte body** |

## Refusals

| Case | What provoked it | How SAP refused |
|---|---|---|
| `refusal-object-not-found` | read class `ZMCP_BLD_NOPE_CLS99` | **404**, `exc:exception`, `type id="ExceptionResourceNotFound"` |
| `refusal-package-not-found-tree` | read package `ZMCP_BLD_NOPKG9X` | **404**, `exc:exception`, same type, different message class |
| `refusal-lock-held-by-other` | second LOCK while the first is held | **403**, `exc:exception`, `ExceptionResourceNoAccess` |
| `refusal-write-not-locked` | PUT source with a garbage lock handle | **423**, `exc:exception`, `ExceptionResourceInvalidLockHandle` |
| `refusal-check-nonexistent-object` | check a class that does not exist | **200**, `status="notProcessed"`, reason in `statusText` |
| `refusal-syntax-check` | check hypothetical broken source | **200**, `status="processed"` plus a `checkMessage type="E"` |
| `refusal-activation-fails` | activate the class after saving broken source | **200**, `activationExecuted="false"` plus `msg type="E"` |
| `refusal-delete-refused` | delete the class while still locked | **200** twice, `isDeletable="false"` then `isDeleted="false"` |
| `refusal-package-not-found-contents-empty` | contents of `ZMCP_BLD_NOPKG9X` | **200**, zero-byte body, no content-type |
| `refusal-package-not-found-objectslist-empty` | nodestructure on the same | **200**, zero-byte body |
| `refusal-package-not-found-hierarchy-direct` | hierarchy walk on the same | **200**, zero-byte body |
| `read-empty-package-contents` | both walkers on `ZMCP_BLD_PKG01`, which **exists and is empty** | **200**, zero-byte body |

## Coverage: endpoint by state

27 endpoints so far. Fifteen of them have exactly one observed state — that is
where the corpus is thin, not where it is wrong.

**Two or more states observed**

| endpoint | states seen |
|---|---|
| `/oo/classes/<obj>/source/main` | read, written, refused unlocked (423), absent (404) |
| `/repository/nodestructure` | populated, empty package, absent package, eight tree levels |
| `/oo/classes/<obj>` | locked, lock refused (403), unlocked, written |
| `/checkruns` | clean, syntax error, object absent |
| `/activation` | activated, refused |
| `/deletion/delete` | deleted, refused |
| `/deletion/check` | deletable, not deletable |
| `/oo/validation/objectname` | name free, name taken (400) |
| `/ddic/tables/validation` | name free, name taken (400) |
| `/ddic/ddl/validation` | name free, name taken (200 + `SEVERITY`) |
| `/packages/<obj>` | read, absent (404) |

**One state observed — the thin part**

`/ddic/domains/validation` (taken only) · `/functions/validation` (taken only) ·
`/oo/classes` create · `/ddic/domains` create · `/ddic/dataelements` create ·
`/cts/transportrequests` (empty list only) ·
`/repository/informationsystem/usageReferences` (one hit only) · and the seven
metadata reads, one object each.

## A delete is one request on adt-clients 18, not two

The chain used to be `POST /deletion/check` then `POST /deletion/delete`. On 18
the member sends the delete alone. Both documents are still here, under their
own case names rather than as steps of a chain that no longer exists:

| case | document |
|---|---|
| `deletion-check-allows` | `del:checkResponse`, `isDeletable="true"` |
| `refusal-deletion-check-refuses` | `del:checkResponse`, `isDeletable="false"` |
| `delete-success` | `del:deletionResult`, `isDeleted="true"` |
| `refusal-delete-refused` | `del:deletionResult`, `isDeleted="false"` |

`/deletion/check` is still a live endpoint and its document is a distinct shape,
so a handler that wants the verdict before deleting still has something to read.

## Create: three variants, one of which is silence

| family | status | body |
|---|---|---|
| class | **200** | **0 bytes, no content-type** |
| domain | **201 Created** | 1878 bytes, `domains.v2+xml` |
| data element | **201 Created** | 1345 bytes, `dataelements.v2+xml` |

Three endpoints, three answers. A class create answers nothing at all, so the
outcome is the status; the DDIC creates answer the full metadata of what they
made. A create strategy has to cope with a body that may not be there. Thirteen
more families are unrecorded, and a refused create — a name already taken,
reaching the endpoint rather than the validation — is unrecorded for all of
them.

A successful source write is the same: `PUT .../source/main` answers **200 with
zero bytes**. The corpus previously held only the refused write (423), so
nothing recorded that a write that works says nothing.

## Metadata: one variant per family, eight families

Eight families read off one system. Each negotiates its own media type, and
seven distinct root elements came back:

| family | media type | root |
|---|---|---|
| class | `oo.classes.v4+xml` | `class:abapClass` |
| function group | `functions.groups.v3+xml` | `group:abapFunctionGroup` |
| function module | `functions.fmodules.v3+xml` | `fmodule:abapFunctionModule` |
| DDL | `ddlSource+xml` | `ddl:ddlSource` |
| service definition | `ddic.srvd.v1+xml` | `srvd:srvdSource` |
| package | `packages.v2+xml` | `pak:package` |
| structure | `structures.v2+xml` | `blue:blueSource` |
| behavior definition | `blues.v1+xml` | `blue:blueSource` |

A reading proved against a table has not been proved against a class. The one
shared root is DDIC's generic envelope, and even there the media types differ —
which is what a reading would dispatch on. Only the active version of each has
been read; inactive, and an object that does not exist, are unrecorded.

The function group is worth a note: asking for `functions.groups.v2+xml`, the
value of the constant named `ACCEPT_FUNCTION_GROUP`, gets a **406** from this
system, which serves v3. The client's own read sends `*/*`, and so does the
capture.

## Validation is not a check run

Two different questions, two different documents, and the word "check" appears
in both — which is what makes them easy to confuse.

**`validate`** asks whether a **name** is admissible for an object of this type
in this package. It never looks at source. Endpoints are per family:
`/oo/validation/objectname`, `/ddic/domains/validation`,
`/ddic/tables/validation`, `/ddic/ddl/validation`, `/functions/validation`.
The element `CHECK_RESULT` belongs to this document.

**`check`** asks whether **source** is correct. One endpoint for everything:
`POST /checkruns`. The document is `chkrun:checkRunReports`.

Each family answers the same question in its own way, measured here rather than
taken from anyone's notes:

| family | name taken | name free |
|---|---|---|
| class | **400** `exc:exception` `InvalidClifName` | 200 `CHECK_RESULT` `X` |
| domain | **400** `exc:exception` `InvalidObjName` | 200 `CHECK_RESULT` `X` |
| table | **400** `exc:exception` `InvalidObjName` | 200 `CHECK_RESULT` `X` |
| DDL | **200** `SEVERITY` `ERROR` + `SHORT_TEXT` | 200 `SEVERITY` `OK` |
| function group | **200** `SEVERITY` `ERROR` + `SHORT_TEXT` | — |

Three answer a taken name with the status; two answer 200 with the verdict in the body. The
discriminator in the second kind is the **value** of `SEVERITY`, not its
presence: a free name answers `OK`.

One name in these fixtures is worth explaining. The taken-domain case uses
`MANDT`, one of SAP's own. An invented `Z` name answers "free", and reading that
as "taken" would have invented a masking defect that is not there — which is
what the first attempt did before the name was checked.

## A unit test run: three exchanges, and the answer is in a header

| step | answer |
|---|---|
| `POST /abapunit/runs` | **201, zero bytes.** The run id is in the `Location` header and nowhere else |
| `GET /abapunit/runs/<id>` | `aunit:run`, `progress status="FINISHED"` — **identical whether the run passed or failed** |
| `GET /abapunit/results/<id>` | `aunit:runResult`; a method that failed carries `alerts` |

Two things follow. A result strategy is handed the whole answer rather than the
body because here the body is empty and the answer is a header. And the status
document reports progress, not verdict — reading pass/fail from it would call
every completed run a success.

The alert itself is the same pair as everywhere else:

```xml
<alert kind="failedAssertion" severity="critical">
  <title>Critical Assertion Error: 'deliberate failure for the corpus'</title>
  <details><detail text="True expected"/></details>
  <stack><stackEntry adtcore:uri=".../includes/testclasses#start=8,0;end=8,0"/></stack>
</alert>
```

ABAP Unit grades on its own scale — `critical`, `fatal`, `tolerable` — which the
reading maps onto the usual letters.

## What a strategy can rest on: a severity and a sentence

Every refusal that carries anything at all carries those two. The forms differ
in how much they add and in whether the severity is stated or has to be
supplied, but the reduction holds:

| form | severity | how |
|---|---|---|
| activation `msg` | `type="E"` | read |
| checkrun `checkMessage` | `chkrun:type="E"` | read |
| deletion `del:message` | `del:type="E"` | read |
| validation | `SEVERITY=ERROR` | read, normalised `ERROR` → `E` |
| `exc:exception` | — | **supplied**: the document is the refusal, the status is the verdict |
| checkrun, not processed | — | **supplied**: `status != "processed"`, reason in `statusText` |
| unit test `alert` | `severity="critical"` | read, normalised `critical`/`fatal` → `E`, `tolerable` → `W` |
| the package walkers | — | nothing to reduce: empty body |

`src/lib/adtRefusal.ts` makes that the contract. Every reading returns a
non-empty `messages`, each entry a normalised letter and the sentence. The two
forms that state no severity get one, because a caller who has to ask which
carriers happened to include one is back to handling five shapes.

Everything above that line is enrichment and may be absent: the T100 key and its
placeholders, a `code`, a line and a URI.

## Where the text comes from: SAP's own messages, rendered

Before the fields, the more useful question — **is the text a message from SAP,
or prose the ADT layer wrote?** Across the seventeen refusals captured, it is
SAP's own message every time. Nothing here looks invented by the HTTP layer.

What differs is whether the carrier keeps the message's **identity** or only its
rendered text.

**The proof is a text that appears twice.** "Resource CLASS ZMCP_BLD_NOPE_CLS99
does not exist." arrives in two documents:

| case | carrier | identity kept |
|---|---|---|
| `refusal-object-not-found` | `exc:exception/message` | **`SADT_RESOURCE` / `002`**, with `V1=CLASS`, `V2=<name>` |
| `refusal-check-nonexistent-object` | `chkrun:statusText` | none — the sentence alone |

Same SAP message, two carriers, and only one of them says which message it is.

**Every key the corpus has is a real ABAP message class.**

| key | message | seen in |
|---|---|---|
| `OO` / `002` | "Class & already exists" | class validation |
| `SWB_TOOL` / `016` | "& with the name & already exists" | domain and table validation — `V1` is the object type |
| `SWB_TOOL` / `025` | "Error while importing object & from the database" | package read |
| `SADT_RESOURCE` / `002` | "Resource & & does not exist." | object read |
| `SADT_RESOURCE` / `026` | "Resource & & is not locked (invalid lock handle: &)" | write without a lock |
| `EU` / `510` | "User & is currently editing &" | lock held |

`SWB_TOOL/016` serving both a domain and a table, with the object type in `V1`,
is the placeholder mechanism in plain view: one message, two renderings.

**Texts that arrive with no identity anywhere in the corpus.** "Data definition
X already exists", "Function group X already exists", "You are already editing
X", "Object X has been checked". Each is almost certainly a T100 message too —
compare "Class X already exists", which *does* come with `OO/002` — but the
carriers that deliver them do not say so, so from the wire alone they cannot be
told from prose.

**One family genuinely is not T100.** Syntax findings —
`Type "STRONG_BUT_NOT_A_REAL_TYPE" is unknown.` — carry
`code="MESSAGE(GTH)"` instead. That is the ABAP compiler's own identifier, not a
message class and number, and it arrives identically from an activation and from
a check run.

**What this means for a strategy.** Keep the sentence always, because it is the
only thing every carrier has. Keep the identity where it exists, because it is
the only thing a caller can match on without reading English — and note that
`IAdtError` has `code`, `adtType` and `namespace` but no home for a T100 key, so
carrying `SADT_RESOURCE/026` needs a decision. Never assume a carrier that
dropped the identity had none to give.

## What carries the error, field by field

This is the question the corpus exists to answer for error handling: **not how
many errors there are, but in what fields the information arrives.** Six forms,
and they carry very different amounts.

| form | sentence | severity | classification | message key | location |
|---|---|---|---|---|---|
| `exc:exception` | `message` | — (the status is the verdict) | `type@id` | **`T100KEY-ID` + `T100KEY-NO` + `V1..V3`** | — |
| activation `msg` | `shortText/txt` | `type` (`E`) | `code` | — | `line`, `href` |
| checkrun `checkMessage` | `chkrun:shortText` | `chkrun:type` | `chkrun:code` | not in our sample | `chkrun:uri` |
| checkrun, no message | `chkrun:statusText` | — | `chkrun:status` | — | — |
| deletion `del:message` | `del:text` | `del:type` (`S`/`E`) | — | — | — |
| validation `SEVERITY` | `SHORT_TEXT` | `SEVERITY` (`OK`/`ERROR`) | — | — | — |
| the walkers | — | — | — | — | — |

**Only `exc:exception` gives the full SAP triple.** A worked example:

```xml
<type id="ExceptionResourceInvalidLockHandle"/>
<message lang="EN">Resource CLASS ZMCP_BLD_ANSCH01 is not locked (invalid lock handle: ZZ_INVALID_LOCK_HANDLE_0001)</message>
<entry key="T100KEY-ID">SADT_RESOURCE</entry>
<entry key="T100KEY-NO">026</entry>
<entry key="T100KEY-V1">CLASS</entry>
<entry key="T100KEY-V2">ZMCP_BLD_ANSCH01</entry>
<entry key="T100KEY-V3">ZZ_INVALID_LOCK_HANDLE_0001</entry>
```

Message class, message number, and the placeholders that were substituted into
the sentence. From those the message can be rebuilt in any language, and matched
on without reading English. Note `T100KEY-NO` is `"026"` — zero-padded, and a
parser that coerces numeric text turns it into `26`, a key no system knows.

**Everywhere else it degrades.** Activation and check runs give a severity, a
sentence and a `code` shaped like `MESSAGE(GTH)` — useful, but not a T100
number. Deletion and validation give a severity and a sentence and nothing
machine-readable at all. A check that never ran gives a sentence in an
attribute, with no severity anywhere. The package walkers give nothing.

**One variant is known to exist and is not here.** adt-clients' check-run parser
reads `chkrun:t100Key` with `msgid`/`msgno`, so some check message somewhere
carries the key. None of ours does. That is a gap in the catalogue, tracked in
issue #200.

## The five refusal shapes

Where an error strategy should look differs by document. A message with
`type="E"` is the right signal in exactly one of the four.

**1. The HTTP status carries it.** `exc:exception`, always with a non-2xx status.
`type id` is a stable machine-readable code, `message` is the sentence,
`properties` holds the T100 message key and sometimes a `LONGTEXT` of SAPscript
HTML. Four cases.

**2. A boolean attribute carries it, under HTTP 200.** Activation answers
`chkl:properties activationExecuted="true|false"`. Deletion answers
`del:isDeleted="true|false"`, its pre-check `del:isDeletable="true|false"`.
Reading these as success because the status was 200 is the masking defect this
design exists to remove.

Do not key on the presence of `del:message` here. A *successful* delete still
carries one, with `del:type="S"` and an empty `del:text`. The attribute is the
verdict; `del:type` only explains it.

**Activation is the exception to its own rule, and the exception is
measured.** `activationExecuted="false"` with **no `msg` children at all**
does not mean SAP declined — it means SAP had nothing to activate. Activating
an already-active class answers exactly that
(`activation-nothing-to-activate`), and so does activating a function group
straight after creating one, because a function group is created active:
`adtcore:version="active"` stands on its metadata before any activation is
asked for. Both measured on trial, 2026-09-16. When SAP does have work, it
answers `activationExecuted="true"` in the same request — activation is not
deferred behind a 200 here. So the verdict is: `false` **plus** a `msg` of
type `E` is the refusal, and `false` alone is a no-op. Deletion's attribute
carries no such exception.

**3. Two attributes, then the messages.** `chkrun:checkReport` needs two
decisions from one document. `chkrun:status="notProcessed"` means the check never
ran at all and `chkrun:statusText` says why; there is no message list to inspect.
`status="processed"` means it ran, and only then does a
`chkrun:checkMessage chkrun:type="E"` mean the object is broken. This is the one
place where "a message with type E" is the correct signal, and it is only correct
after the status check.

**5. A name verdict in an `asx:abap` block.** Validation, for the families that
answer 200. `SEVERITY` other than `OK` is the refusal and `SHORT_TEXT` is the
sentence. Do not reach for this reading on a check-run document, or the other
way round.

**4. Nothing carries it.** The three package walkers answer HTTP 200 with a
zero-byte body and no content-type when the package does not exist. An existing
but empty package answers **identically**, same sha256. There is no signal in the
response, so no strategy can recover one. Only the extra existence round trip
that `GetPackageTree` already pays can tell the two apart. This settles the open
question about whether `GetPackageContents` and `GetObjectsList` should pay it.

## Moving this out

The readings in `src/lib/adtRefusal.ts` and this corpus are meant to leave
together, into a package of their own in the adt-clients repository, with this
file as the documentation of why the readings look the way they do.

**What makes that cheap, and is maintained deliberately:**

- `adtRefusal.ts` imports `fast-xml-parser` and nothing else. No MCP type, no
  handler, no config, nothing from this repository.
- The corpus is plain files. No generator, no build step.
- The fixture location is spelled once, in `src/lib/adtCorpus.ts`. Every test
  asks that module. Moving the corpus is one edit, not one per test file.

**What goes:** `src/lib/adtRefusal.ts`, `src/lib/adtCorpus.ts`,
`tests/fixtures/adt/` entire, `src/__tests__/unit/adtRefusalReadings.test.ts`,
`adtRefusalCorpus.test.ts`, `adtMetadataShapes.test.ts`, and this README.

**What stays:** `src/lib/answer.ts` and its tests. That is the MCP adapter —
it turns an answer into an `McpResult`, which is this server's business and not
a strategy's. `answerFromCorpus.test.ts` stays with it and keeps reading the
corpus from wherever it ends up.

**What has to be decided before it is published:** the fixtures carry this
system's own object names — `ZMCP_SHR_*`, `ZADT_BLD_*`, `ZMCP_BLD_*` — and its
package names. They are this project's test polygon rather than anyone's
business data, and the SAP user id is already a placeholder, so nothing here is
sensitive. But they are noise in a public package, and renaming them would break
the byte-for-byte promise that makes the corpus worth having. Renaming, or
keeping them and saying why, is a decision for the move.

## Regenerating

```bash
npx tsx scripts/capture-adt-corpus.ts --env ~/.config/mcp-abap-adt/sessions/trial.env
npx tsx scripts/capture-adt-corpus.ts --only read-where-used-list-structure   # top up
```

The script creates one scratch class, exercises it and removes it in a `finally`.
It never writes to the 29 polygon objects. It never runs an auth command: if the
session is dead it stops at `connect()` and says so.
