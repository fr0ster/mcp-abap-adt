# Goal: stdio starts without the SAP system

## Goal

A stdio server (`mcp-abap-adt` and its siblings `-ro`, `-compact`, `-compact-ro`) can be
told to start without contacting its SAP system. Started so, it lists the tools of its
declared system type at once, and its connection is made by the first tool call that needs
one. While the system cannot be reached, a tool call answers that there is no connection,
names the cause, and the next call tries again. The process stays up, so a system started
later in the client's session is used without a reconnect by hand
(fr0ster/mcp-abap-adt#353, part 2).

## Invariants

- **Opt-in, explicit.** One flag turns the deferred logon on. Without it, the start is what
  it has been since 19.0.0: the logon at the start, before the MCP transport opens, and
  exit `1` when it fails.
- **Three forms, one precedence.** The flag is a CLI parameter, an environment variable
  and a configuration key. The parameter overrides the variable; the variable overrides the
  configuration. The precedence is the one the parameter table already gives every row.
- **No contact at the start.** With the flag, nothing is sent to the SAP system before the
  first tool call that needs a connection. The configuration is still checked at the start:
  a destination the start refuses today is refused the same way.
- **The tool set is the declared one.** The tools listed are those of the declared system
  type, the same list a start without the flag gives for the same type. The system kind is
  still required and is never derived from credentials or from the system.
- **No connection, said plainly.** A call that cannot reach the system answers that there
  is no connection, with the cause as the start line names it: an allowlisted code only.
  No URL, no host, no port, no user, no credential, no error message.
- **One attempt per call.** Each call that needs the connection, while there is none, makes
  at most one logon attempt; calls that arrive while one runs share it. No timer, no retry,
  no polling, no loop of any kind on the server's side.
- **One connector, one flow.** The instance keeps its one connection and its strictly
  sequential tool calls. The deferred logon is the same birth the start makes today, moved
  to the first call; it is not a second connection path.
- **A leftover session is taken up only on an explicit statement.** With the flag, the
  destination's leftover session is not taken up on its own. It is taken up only when the
  owner's explicit restore setting says so. Leftover sessions not taken up stay for the
  list and the logoff tools.
- **Static first.** No cast, no `any`, no `@ts-ignore`, no regular expression in
  production code. A runtime check stays only where the value comes from outside the type
  system: the parameters, the thrown value of a failed connect.
- **Proved, not assumed.** Unit tests pin the precedence and the deferred path, each shown
  load-bearing by a mutation. A live case against an unreachable system (a closed local
  port) needs no SAP system; a live case where the system becomes reachable mid-session
  runs against a real system on the owner's go.

## Out of scope

- The HTTP and SSE binaries: they log on per request already.
- Changing what a start without the flag does, or the words of its start line.
- A connection made in the background, a reconnect on a schedule, or a health check.
- The debugger's and the long reads' own connections: they keep their answers.
