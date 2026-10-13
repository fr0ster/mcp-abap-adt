# Integration Tests

The tests in this directory run the handlers against a real SAP system. They need
`tests/test-config.yaml` (copied from `tests/test-config.yaml.template`) and skip without it.

## Structure

```
integration/
├── high/        # the high tools, one directory per object type (create → update → activate → delete)
├── readOnly/    # the read-only tools (ATC, function, structure, system, transport)
├── debugger/    # the debugger tools
├── server/      # EmbeddableMcpServer against the system
└── helpers/     # configuration, sessions, shared objects, the testers
```

There is no `low/` directory: the low set left the full binaries in 19.0.0 (D56), and its suites
and `LowTester` were removed with it. The single-step operations it served — lock, a write under
the lock, unlock, check, validate, activate — are the compact binaries'. Their requests are tested
against an ADT stand-in in `src/__tests__/unit/lowToCompact.test.ts` and
`src/__tests__/unit/compactCoversLow.test.ts`, not here.

## Testers

- `HighTester` runs a high tool's workflow and its cleanup.
- `ReadOnlyTester` runs a read.
- `LambdaTester` runs workflow functions (lambdas) that receive the tester's context — see
  [`helpers/testers/README.md`](helpers/testers/README.md).

In soft mode (the default) a tester calls the handler functions directly. In hard mode
(`integration_hard_mode.enabled: true`) it spawns the server and calls its MCP tools by name, so a
test names the tool the full binary serves (`ActivateClass`, `DeleteClass`, …). An operation only
compact serves (a package delete, `HandlerDelete` PACKAGE) is not served by a full-binary hard
mode; such a call is reported as not found.

## Running

```bash
# All integration tests — save the full log
npm run test:integration 2>&1 | tee /tmp/integration-test.log

# The high tools only
npm run test:high

# One object type
npm test -- --testPathPatterns=integration/high/class

# With debug logs
DEBUG_TESTS=true npm test -- --testPathPatterns=integration/high/class
```

## Notes

1. **Cleanup.** `HighTester` and `LambdaTester` clean up in `afterEach`, even on failure, unless the
   YAML disables it (`skip_cleanup=true` or `cleanup_after=false`). A test that creates several
   objects deletes each of them.
2. **Errors.** Check `result.isError` before parsing an answer.
3. **Locks.** A lock a test takes is released by the test, and a refused release fails it
   (`helpers/rapFixtures.ts` shows the pattern).
4. **Shared objects** are created once with `npm run shared:setup` and checked with
   `npm run shared:check`.
