# Goal: the server writes program includes and table types

## Goal

A model working through mcp-abap-adt can create, change, activate and delete a **program
include** (`PROG/I`) and a **table type** (`TTYP/DA`), as it already can a program or a
structure, wherever the declared system type serves the operation. Today the server only reads
an include's source and a table type's metadata, though adt-clients 39 already carries both
objects' full lifecycle.

## What it covers

- **Program include (`PROG/I`)**: create, update its source, lock and unlock, activate,
  validate, the deletion check, delete, and read and update its metadata — on the system types
  whose type table lists each operation. On premise the table lists them all; ABAP cloud lists
  reading only, so on cloud the include stays read-only.
- **Table type (`TTYP/DA`)**: create, read and update its metadata, lock and unlock, activate,
  check, validate, the deletion check, delete, its versions and its transport — on premise and
  on ABAP cloud alike, as their type tables list.
- **Both tool sets**: the full set gets the tools; the compact set gets the two types as members
  of its existing handlers (`HandlerCreate`, `HandlerGet`, `HandlerUpdate`, `HandlerDelete`,
  `HandlerLock`, `HandlerUnlock`, `HandlerActivate`, `HandlerValidate`, `HandlerCheckRun`, the
  deletion check), not as new tools.
- **The read-only sets** serve only what reads.

## Invariants

These bind the spec and the plan; they come from the owner's standing rules.

- **The type table decides.** What a tool offers on a system type is exactly what that type's
  table lists for the object (`ADT_TYPES_ONPREM`, `ADT_TYPES_CLOUD`); nothing the system cannot
  serve is offered, and nothing it serves is withheld.
- **Source is text, metadata is XML.** An include's source is sent and answered as the source
  text; a table type, which has no source, is written through its metadata document, sent as
  given.
- **What can be read can be changed.** Every metadata document the server reads for these two
  objects, it can also write.
- **Compact stays minimal and single-call.** The two types join existing compact handlers; each
  compact create, update or delete is one call.
- **Only LOCK and UNLOCK are stateful.** Writes and activation go stateless.
- **A read-only set changes nothing.** No write, lock or activation reaches a `-ro` binary.
- **No guessing, no silent failure.** SAP's answer reaches the model as SAP sent it; a refusal is
  an error naming what was refused.
- **Static types first, no casts.** The adt-clients contract the server accepts types each member
  per system type; a member a type does not serve does not compile there.
- **Proved on a real system.** Each operation is measured live on S/4HANA (both objects) and on
  ABAP cloud (the table type; the include's reads), in local packages, with every object the run
  made deleted.

## Outside this goal

- **An include's main programs** (which programs include it). adt-clients has no endpoint for it;
  it is its own task, in adt-clients first.
- **SAP 7.40 (legacy).** Its type table lists the include's lifecycle; the legacy binaries are
  parked, so serving it there is recorded as debt for their return.
