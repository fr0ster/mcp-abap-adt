# MCP ABAP ADT - Development Guide

## Testing

### Integration Tests

Integration tests run against a real SAP system. Two modes:

- **Soft mode** (default, `integration_hard_mode.enabled: false`): calls handlers directly, no MCP subprocess.
- **Hard mode** (`integration_hard_mode.enabled: true`): spawns full MCP server via stdio, calls tools through MCP protocol.

**Strategy**: Run soft mode for mass regression testing. Use hard mode only for targeted verification of recent changes.

```bash
# Soft mode (mass run)
npm test

# Hard mode (targeted, in test-config.yaml set integration_hard_mode.enabled: true)
npm test -- --testPathPatterns=<specific-test>
```

### available_in

Every handler's `TOOL_DEFINITION` must have `available_in` field:

```typescript
available_in: ['onprem', 'cloud'] as const,
```

Values: `'onprem'` | `'cloud'` | `'legacy'`. Tools without `available_in` are NOT registered and invisible in hard mode.

### Cloud vs On-Prem

- Programs and Function Groups are NOT available on ABAP Cloud (`available_in: ['onprem']` or `['onprem', 'legacy']`)
- Runtime profiling (class-based) and dumps work on both cloud and onprem
- `RuntimeRunProgramWithProfiling` is onprem-only (no programs on cloud)
