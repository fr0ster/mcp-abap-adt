# Raw ADT wire corpus

Real responses from a real SAP system, recorded byte for byte, so the result and
error strategies (`docs/superpowers/specs/2026-09-08-result-error-strategies-design.md`)
can be written against documents someone has actually seen. Writing a parser first
and meeting the document later is how the transport-tree parser broke in #168.

46 cases, 55 exchanges. Captured by `scripts/capture-adt-corpus.ts` against the
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
| `delete-success` | delete the scratch class, unlocked | 200 twice: `isDeletable="true"`, then `isDeleted="true"` |
| `read-table-metadata-structure` | read metadata of `ZMCP_SHR_RTABL` | 200, `blueSource` document |
| `read-package-contents-structure` | contents of `ZMCP_SHR_PKG` | 200, `asx:abap` with populated `OBJECT_TYPES` |
| `read-object-tree-structure` | walk `ZMCP_SHR_PKG`, depth 2 | 200 × 8, one root call then one per object type |
| `read-where-used-list-structure` | where-used on `ZBP_MCP_SHR_I_ROOT` | 200, `usageReferenceResult numberOfResults="1"` |
| `read-transport-list-structure` | transport requests for the current user | 200, `tm:root` with no children, an empty list |
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

## Create is not one shape either, and one create answers nothing

| family | status | body |
|---|---|---|
| class | **200** | **0 bytes, no content-type** |
| domain | **201 Created** | 1878 bytes, `domains.v2+xml` |
| data element | **201 Created** | 1345 bytes, `dataelements.v2+xml` |

A class create answers nothing at all: the outcome is the status and there is no
document to read. The two DDIC creates answer the full metadata of what they
made. A single "create" result strategy would be wrong for one of them whichever
way it was written.

A successful source write is the same: `PUT .../source/main` answers **200 with
zero bytes**. The corpus previously held only the refused write (423), so
nothing recorded that a write that works says nothing.

## Metadata is not one shape

Eight families read off one system, and they answered eight different media
types and seven different root elements:

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

A reading proved against a table says nothing about a class. The one shared root
is DDIC's generic envelope, and even there the media types differ — which is
what a reading would have to dispatch on.

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

The families do not answer validation the same way, measured here rather than
taken from anyone's notes:

| family | name taken | name free |
|---|---|---|
| class | **400** `exc:exception` `InvalidClifName` | 200 `CHECK_RESULT` `X` |
| domain | **400** `exc:exception` `InvalidObjName` | 200 `CHECK_RESULT` `X` |
| table | **400** `exc:exception` `InvalidObjName` | 200 `CHECK_RESULT` `X` |
| DDL | **200** `SEVERITY` `ERROR` + `SHORT_TEXT` | 200 `SEVERITY` `OK` |
| function group | **200** `SEVERITY` `ERROR` + `SHORT_TEXT` | — |

Three refuse with the status; two answer 200 with the refusal in the body. The
discriminator in the second kind is the **value** of `SEVERITY`, not its
presence: a free name answers `OK`.

One name in these fixtures is worth explaining. The taken-domain case uses
`MANDT`, one of SAP's own. An invented `Z` name answers "free", and reading that
as "taken" would have invented a masking defect that is not there — which is
what the first attempt did before the name was checked.

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

## Regenerating

```bash
npx tsx scripts/capture-adt-corpus.ts --env ~/.config/mcp-abap-adt/sessions/trial.env
npx tsx scripts/capture-adt-corpus.ts --only read-where-used-list-structure   # top up
```

The script creates one scratch class, exercises it and removes it in a `finally`.
It never writes to the 29 polygon objects. It never runs an auth command: if the
session is dead it stops at `connect()` and says so.
