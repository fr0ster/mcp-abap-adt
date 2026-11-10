# Goal: the business-data tools are opt-in

## Goal

No binary of the server offers a tool that reads business data unless the operator who
starts it has turned those tools on. The tools are `GetSqlQuery`, which runs a freestyle
ABAP SQL `SELECT`, and `GetTableContents`, which reads the rows of a table or CDS view.
Their compact form is `HandlerGetData`, one tool over both reads. All three read through
ADT's data preview.

By default, every tool set leaves them out: full, read-only, compact and compact read-only,
over stdio, Streamable HTTP and SSE. One explicit flag brings them back. It can be given on
the command line, in the environment or in the configuration file, in the precedence every
other parameter has.

The reason is SAP API Policy FAQ v1.3 (June 2026), Q33. The FAQ is informational and
non-binding. Q33 says that ADT APIs "are not intended for programmatic reading of application
tables or export of business data, SQL execution against SAP backend systems, … agentic AI
workflows operating on business data". Whether to turn the tools on is the customer's
decision. The server makes the safe choice the default and states the reason. It does not
make the decision for the customer.

## Invariants

- **Off means absent.** With the flag off, the data tools are not in any tool listing and
  cannot be called. They are not listed and then refused. A client sees them exactly as it
  sees any other tool a set does not serve.
- **One flag, one precedence.** The flag is one parameter row, read like every other row:
  the CLI over the environment over the configuration file. It is off when no form gives it,
  and a value that is not `true` or `false` stops the start. An explicit `false` in a
  higher-ranked form beats a `true` in a lower one.
- **The operator decides, not the client.** Only the configuration of the process turns
  the flag on. No request, header, tool argument or session state can turn it on. On
  Streamable HTTP and SSE the flag is a start parameter of the binary, like the system type.
- **One gate, in an existing mechanism.** The flag selects which groups a tool set
  serves, the way the transport already does. No second filter runs beside it, and the
  registration paths and the tool pages all read the same groups.
- **Nothing else changes.** With the flag on, every set serves exactly what it serves
  today. With the flag off, it serves that minus the data tools. The tools' names, schemas,
  descriptions and answers stay as they are.
- **Off for embedders too.** An embedder of the library serves the data tools only when it
  states so; nothing it builds by default carries them.
- **The reason is stated where the choice is made.** The flag's help, the README and the
  migration note cite FAQ Q33 and say that enabling the tools is the customer's decision.
  They give no legal reading of their own.
- **Static first.** The choice reaches the tool sets as a typed, required value. No cast,
  no `any`, no suppression comment and no regular expression in production code.
- **Proven, not assumed.** A unit test covers each precedence case, and each tool set with
  the flag on and off on every transport. A deliberate break proves each test is
  load-bearing. The live cases of the data tools keep running with the flag on.

## Out of scope

- Any other tool that can reach business data: the debugger's variable and AMDP table
  reads, memory snapshots, dumps, the gateway error log, traces, and the class and program
  runs. They are a separate, later task; the README names them, and they are not changed
  here.
- Changing what the data tools read or how they answer.
- A per-user or per-destination policy. The flag is per process.
