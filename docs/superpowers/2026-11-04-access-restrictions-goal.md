# Goal: access restrictions set when the server starts

## Goal

An administrator restricts what the model can do through this server by configuration, and
restarts the same server. No other binary is installed. A restriction that is not configured
does not exist: the server behaves as today, and SAP's authorization decides what is allowed.

Each restriction is optional:

1. **Denied actions.** A tool, or one action of a tool, is not registered when the server
   starts. The model does not see it and cannot call it.
2. **Allowed packages.** Objects are created, changed, deleted, activated and moved only in
   these packages. A package outside the list is not touched either.
3. **Allowed requests.** An object is written only through these transport requests. An object
   that sits in another request is not saved.
4. **Someone else's draft.** The server finds out whether the object has an unactivated change
   and whose it is: none, the caller's, or another user's, with its age. The consumer decides
   what happens: refuse, or write its own version.

5. **Table data.** The contents of a table or view are read only when the configuration allows
   it: either a list of tables whose data cannot be read, or a list of the only tables whose
   data can be. This covers every tool that answers a table's rows, the SQL query included.

Every check runs once, at the start of the handler, before its first call that changes
anything in SAP. The handler then either runs whole or is refused whole; nothing is checked
between its steps.

When both lists are configured, a write needs both: the object's package is allowed and its
request is allowed.

## What there is today (Measured)

- The ceiling is the binary: the full one or a `-ro` one. Nothing narrows a binary further.
- An object's three source versions, read through ADT (E19 on premise and the BTP trial, one
  user; E19 with two users):
  - After an activation, `active`, `inactive` and `workspace` answer the same text and one ETag
    (a UTC timestamp of 14 digits and `0011`).
  - A write gives the inactive version a new ETag (its write time, and `0001`). `active` stays
    on the last activated text. LOCK and UNLOCK change none of the three.
  - For the user who wrote, `workspace` answers the draft. For another user, `inactive` answers
    the draft and `workspace` the active text.
  - So, for the caller: `active` = `inactive` means no unactivated change; `inactive` ≠ `active`
    and `workspace` = `inactive` means the caller's draft; `workspace` = `active` ≠ `inactive`
    means another user's draft. The inactive ETag's timestamp is the draft's last write.
  - Another user's lock is not visible before locking: `lockedByEditor` stayed `false` while it
    was held. Only one's own LOCK answers it.
  - SAP does not protect a draft whose lock was released: a second user locked, wrote over it
    and activated, with no warning. The first user's change was lost.
- E19 and the trial send no HTTP `Date` header. The ETag timestamp matched UTC on both (offset
  0 s).

## Invariants

- **Nothing configured, nothing changes.** Every restriction is off unless configured. Then
  every tool, answer and listed schema is as today.
- **Denied actions are decided once, at the start.** A denied tool is not registered. No call
  checks a deny list.
- **The binary stays the ceiling.** A configuration only narrows what the binary offers. It
  never adds a tool.
- **The package and the request are SAP's.** The server reads an object's package and request
  from SAP, never from the model's arguments. When one cannot be read and a list is configured,
  the write is refused.
- **The checks run at the handler's start.** A handler is allowed or refused as a whole, before
  it changes anything; no check sits inside its steps (lock, write, activation).
- **The checks are a strategy.** One interface, given to the server by the host, decides every
  check at a handler's start. A shipped strategy applies the configured lists and the draft rule. An
  embedder can give its own.
- **The consumer decides about a draft.** The server gives the facts: whose draft, its age. The
  age limit and what happens on each side of it are the consumer's settings, with no default of
  the server's. The server keeps no state on its clock.
- **A mistake in the configuration stops the start.** An unknown tool or action, a malformed
  entry or an unreadable list is never ignored.

## Open for the spec

- The settings: their names and format, taking ARC-1's grammar where it fits (`Tool`,
  `Tool.action`, `Tool.glob*`; a package by name, `Z*` prefix, `ZFOO/**` subtree), and where
  each transport takes them at start (stdio configuration, http/sse start parameters).
- Which tools count as a write for the package and request checks: create, update, delete,
  activation, a move to another package, the transport tools, batch and the compact routes.
- How a create is checked, where the object has no package in SAP yet.
- How the server learns the request that holds an object, read at the handler's start.
- For table data: which tools answer rows; how the tables a SQL query reads are found, and
  what happens to a query whose tables cannot be found; whether a deny list and an allow list
  may be configured together.
- The semver of the release.
