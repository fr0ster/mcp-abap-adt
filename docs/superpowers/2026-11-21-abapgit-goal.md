# abapGit — goal

## What it is for

An agent working through mcp-abap-adt changes ABAP objects in a package. When that
package's history lives in git, the agent today has to stop and hand the work to a person
with Eclipse ADT or SAP GUI to link, pull, stage, commit and push it. Both systems already
serve abapGit through ADT (`/sap/bc/adt/abapgit/…`), and `@mcp-abap-adt/adt-clients`
already speaks part of it. With this change, the agent can run the whole git loop on a
package through MCP: find the repository, link it, pull it, see what changed, stage it,
commit and push it, and read what went wrong.

## The behaviour

- **The whole loop, as each system serves it.** The agent can do each of these as its own
  tool call:
  - list the linked repositories and read one;
  - check an external repository before linking it, and on cloud read its branches;
  - link a package to a repository, and unlink it;
  - pull, and on cloud read the objects a pull would modify;
  - read the repository's files and its checks, and on cloud its status (the run state the
    repository list carries);
  - stage (read what changed and choose what to commit), then commit and push;
  - on onprem, switch the branch;
  - read the error log of a pull or a push.

  Each operation is offered exactly where the system's abapGit handler serves it. The
  measured route sets differ: cloud is SAP's own `CL_ABAPGIT_RES_*`; onprem is the
  open-source abapGit ADT backend installed as Z objects. Nothing is offered that the
  system does not serve, and nothing it serves is left out.
- **Availability comes from the system.** abapGit is served only when the system's
  discovery lists `/sap/bc/adt/abapgit/repos`. The abapGit tools are always listed, with no
  request to SAP; a call on a system without the backend, for example an onprem system
  without the open-source abapGit ADT backend, is refused as not served.
- **Full and compact.** The full set has a tool per operation. The compact set exposes the
  same operations in its own shape. Both follow the existing tool rules: functional
  descriptions, typed schemas, result strategies.
- **Reads in `-ro`, writes outside it.** These go in the `-ro` binaries:
  - list and read repositories, with their status;
  - check an external repository;
  - read what changed for staging, files, checks and modified objects;
  - read the error log.

  Link, unlink, pull, push, branch switch and, on cloud, reading a branch's details (SAP links
  the repository and removes the link to answer it) change the system or the remote
  repository, so they are not in `-ro`.
- **Access restrictions hold.** Link and pull write objects the allowed packages and requests
  cannot bound (SAP's import overwrites objects in subpackages and in other packages, and
  creates tasks), so they are refused while any `allowed-packages` or `allowed-requests` entry
  is configured. Every other write is checked against the repository's package, read from
  SAP's repository list, and fails closed when it cannot be read. With no restriction
  configured, everything is served. Each operation can be denied through `--deny-actions` like
  any other tool.
- **Long operations end on SAP's answer; nothing runs on the server's clock.** A pull or a
  push can take long, and there is no timeout. On cloud, SAP runs pull and push as its own
  background job, which no route can cancel: the caller follows its status in the repository
  list. On onprem, link, pull and push are SAP's synchronous writes and end on SAP's answer;
  a caller's cancel does not cut them. How such a write may run in the background follows the
  existing background-run rules.
- **Any git host.** The remote repository can be on any git host reachable from the SAP system
  over HTTPS.
- **Git credentials stay secret.** A user, password or token for the remote repository
  reaches SAP's abapGit request and nothing else: not a log line, not a tool answer, not an
  error text, not a background-run record.
- **SAP's answer reaches the model as it is.** A conflict, an authorisation refusal or a
  failed check is SAP's verdict, returned like every other ADT answer. The server does not
  retry, merge or resolve anything. **For an abapGit call that carries git credentials, and
  for the error log**, SAP's verdict reaches the model as structure and facts only: the
  status, the object lists, and SAP's message class and number. SAP's text, bodies, headers
  and exception fields are dropped before any log, answer or background-run record, so no
  credential SAP might echo can reach them.

## Where it is built

- **adt-clients first:** a minor release that adds the operations `AdtAbapGitClient` lacks
  (stage, push, checks, files, status, branch info, branch switch, pull v2 / modified
  objects), each pinned by unit tests and by live tests on the system that serves it. It is
  published to the registry before the server builds on it.
- **mcp-abap-adt:** the tools, the access checks, the background runs, and the docs. That
  means the README first screen and the feature lists, the tool references, the access
  restrictions page, and the CHANGELOG highlights. Each tool is pinned by unit tests and by
  live tests on onprem and cloud. Ships in 24.2.0.

## What it needs that is not in the code

- A git repository for the live tests that the tests may link, pull, commit and push to on
  both systems, together with its credentials kept in the sessions folder, never in a
  repository.
- On each system, a package of our own that the tests link and unlink.
