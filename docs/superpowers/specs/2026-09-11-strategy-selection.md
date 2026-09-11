# What the strategies are actually keyed on

**Status:** rewritten 2026-09-11 after a correction that changed the axis.

An earlier draft of this table was keyed on the operation — a row for `create`,
a row for `delete`, a row for `activate`. That was wrong, and wrong in a way
that inflated the count: it produced fourteen rows where there are two or three
real choices.

**A result strategy is keyed on the transformation**: what the response has to
become so the handler can return it. Not on which member produced it, and not on
which object type it belongs to.

**An error strategy is keyed on the encoding principle**: how the refusal is
written into the answer. Also not on the operation — an activation and a
deletion encode differently, but a deletion and its pre-check encode the same
way, and a class create and a class read encode the same way as each other.

## The result axis: three transformations, and mostly one

| transformation | strategy | when |
|---|---|---|
| **hand the body through** | `verbatim` | the tool's answer carries the document as text. Source is obvious; **metadata is the same** — it is XML and the tools return JSON, but they put the XML in a JSON field as a string. `handleReadClass` has never parsed it. |
| **parse into named structure** | `structured` | only where a tool promises named fields out of the document: a check's message list, an activation's verdict, a node walk. |
| **there is no body** | `statusOnly` | a class create answers 200 with zero bytes; so does a successful write. The status is the whole answer. |

The first covers most of what the tools do. The eight media types and seven root
elements the corpus found in metadata demand nothing, because nothing promises
named fields out of them. They would matter the day a tool did, and that is a
change to the tool surface rather than to a strategy.

## What the consumer needs differs by direction, and that is the projection

This is the part that varies, and it varies by **read versus write**, not by
operation:

| | the result the consumer wants | what they want when it fails |
|---|---|---|
| **reading** | the payload — that is the whole point of the call | that it failed, and why |
| **writing** | a short confirmation. `SUCCESS` and nothing else | **everything.** What went wrong is the valuable half of a write |

So a write pairs a nearly empty result projection with the fullest error
strategy available, and a read pairs a full result with the same error strategy.
The asymmetry is in the projection, not in the reading.

`terseWrite` answers the string `'SUCCESS'`, never `undefined`: the adapter
cannot tell a write with nothing to add from a read that found nothing, and
reading the second as success is the masking defect this repository has removed
three times.

## The error axis: six encoding principles

Each is how a refusal is written into an answer, measured from the corpus.

| principle | strategy | documents |
|---|---|---|
| the HTTP status carries it, the document explains it | `analyseException` | `exc:exception` — a read, a create, a lock, a write, three of the five validations |
| a boolean attribute carries it, under 200 | `analyseActivation`, `analyseDeletion` | `activationExecuted`, `isDeleted`, `isDeletable` |
| a status attribute, then the messages | `analyseCheck` | `chkrun:status`, then `checkMessage` |
| a name verdict in a value block | `analyseValidation` | `CHECK_RESULT`, or `SEVERITY` + `SHORT_TEXT` |
| alerts on the thing that failed | `analyseUnitTest` | `aunit:runResult` |
| **nothing carries it** | none, deliberately | the package walkers: a missing package and an empty one answer the same sha256 |

`analyseAny` dispatches on the root element, for where the form is not known in
advance. Prefer a named one where it is: a dispatcher that meets an unrecognised
document answers `null`, and `null` from an `analyse` means "not a failure".

## How the two axes meet, in numbers

They are injected differently and that is why the counts differ so much.

**Result strategies are constructed, once.** 289 slots across 30 result sets,
filled from three readings. The slot name selects a projection, not a reading.

**`analyse` is passed per call.** 275 call sites in 174 handler files, and
two-thirds of them — 178 — take `analyseException`, because `read`, `create`,
`update`, `lock`, `unlock` and `readMetadata` all encode a refusal the same way.
The remaining third splits across four forms: `analyseDeletion` 35,
`analyseValidation` 23, `analyseActivation` 22, `analyseCheck` 17.

So the error side is the larger migration, and the most mechanical part of it is
larger still.

## Rows that are thin

- `where-used` has only ever answered one hit; no empty result, no refusal.
- `transport list` has only ever answered empty.
- A refused `create` — a name already taken, reaching the create endpoint rather
  than validation — is unrecorded for every family.
- No captured check message carries `chkrun:t100Key`, which adt-clients' parser
  reads, so that variant exists somewhere and is not here. Issue #200.
