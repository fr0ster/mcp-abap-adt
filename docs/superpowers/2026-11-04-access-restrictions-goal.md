# Goal: access restrictions set when the server starts

## Goal

An administrator restricts what the model can do through this server by configuration, and
restarts the same server. No other binary is installed. A restriction that is not configured
does not exist: the server behaves as today, and SAP's authorization decides what is allowed.

Each restriction is optional:

1. **Denied actions.** A tool, or one action of a tool, is not registered when the server
   starts. The model does not see it and cannot call it.
2. **Allowed packages.** A call that names a package in its arguments (a create, a move, a
   package tool) runs only when that package is in the list.
3. **Allowed requests.** A call that names a transport request in its arguments runs only when
   that request is in the list.
4. **A draft tool.** A read tool in the system set answers whether an object has an
   unactivated change and whose it is: none, the caller's, or another user's, with its age. It
   is not a restriction and not a check of other tools: the model calls it when it wants to
   know, and decides what to do. SAP itself lets the first writer win.

5. **Table data.** The contents of a table or view are read only when the configuration allows
   it: either a list of tables whose data cannot be read, or a list of the only tables whose
   data can be. It covers the tools that name the table in their arguments. A free SQL query
   is not analysed: it is allowed or not as an action (item 1).

Every check runs once, at the start of the handler, before its first call that changes
anything in SAP. The handler then either runs whole or is refused whole; nothing is checked
between its steps.

When both lists are configured, each name the call gives is checked against its own list.

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
  every tool, answer and listed schema is as today, except the draft tool, which is always
  there: the model decides whether to call it.
- **Denied actions are decided once, at the start.** A denied tool is not registered. No call
  checks a deny list.
- **The binary stays the ceiling.** A configuration only narrows what the binary offers. It
  never adds a tool.
- **The checks read the arguments.** A package or request given in the call's arguments is
  checked against its list, as given. One not given is not checked, and the call runs; SAP may
  then refuse it. The server makes no call to SAP to find an object's package or request. How
  an entry is matched is the strategy's: a `ZFOO/**` entry may be matched by reading the
  package tree, if the strategy chooses to.
- **The checks run at the handler's start.** A handler is allowed or refused as a whole, before
  it changes anything; no check sits inside its steps (lock, write, activation).
- **The checks are a strategy.** One interface, given to the server by the host, decides every
  check at a handler's start. Two strategies are shipped, both applying the configured lists:
  a simple one, which matches a package by name and prefix only, and one that also matches a
  `ZFOO/**` entry by reading the package tree from SAP. An embedder can give its own.
- **The model decides about a draft.** The draft tool answers facts only: whose draft and its
  age. No setting, limit or check of the server's acts on a draft.
- **The checks are formal.** They read the call's own target: the tool, the object, its package
  and request, the table it names. They do not analyse code. A class written to read what is
  denied, or to create objects elsewhere, is a matter for SAP's authorization, not this server.
- **A denied action the binary does not have is ignored.** Denying a tool or action that is not
  registered in this binary changes nothing, so one list fits every binary.
- **An absent configuration is no restriction.** A list that is not given, or a list file that
  does not exist, restricts nothing, and the server starts as today.
- **A malformed entry stops the start.** A list that is there but cannot be parsed is never
  ignored.

## Open for the spec

- The settings: their names and format, taking ARC-1's grammar where it fits (`Tool`,
  `Tool.action`, `Tool.glob*`; a package by name, a `Z*` prefix or a `ZFOO/**` subtree), and
  where
  each transport takes them at start (stdio configuration, http/sse start parameters).
- Which tools count as a write for the package and request checks: create, update, delete,
  activation, a move to another package, the transport tools, batch and the compact routes.
- Which arguments of which tools name a package or a request.
- For table data: which tools name a table whose rows they answer; whether a deny list and an
  allow list may be configured together.
- The draft tool: its name, arguments and answer; which object types have versions to compare
  (source-based objects, and whether XML metadata does too); where it sits in the compact set.
- The semver of the release.
