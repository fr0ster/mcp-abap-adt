# Configuration

How a binary reads its parameters: CLI, then environment, then YAML — each binary from its
**own table** (19.0.0). An option of another binary is in none of its forms; its CLI and YAML
forms stop the start, naming the binary that serves it. Its environment variable is not read
(an environment is inherited); `MCP_TRANSPORT` is the one environment variable refused.

## Components

### The machinery (`authParameters.ts`)

A `ParameterTable` is `{ program, rows, removed }`. Each `Parameter` row names a parameter in
its forms — `cli` (and `cliAliases`), `env`, `yaml` (a dotted key for a nested one, `http.port`)
— with its `kind` (`string`, `flag`, `port`, `enum`, `list`, `custom`), its `default`, its help
`section` and sentence. Each `RemovedParameter` names forms that are not this binary's (exact CLI
names, CLI prefixes, top-level YAML keys, and the env names of a parameter that is gone) and the words that refuse them.

- `readParameters(table, argv, env, yaml)` — every row, CLI beating env beating YAML; a removed
  parameter's CLI or YAML form (or a gone parameter's env name) is refused first. A refusal is a
  `ParameterRefusal` carrying its `words`; a row reader's throw that is not one gets fixed words,
  never its message. Config file faults are refused naming the path and the kind: "cannot be
  read", "cannot be written", "is not valid YAML" (a parse failure, with its line).
- `parameterSource(table, key, …)` — the form a value came from, as a refusal names it.
- `validateYamlParameters(table, yaml)` — the config file's refusals: removed keys, secret-looking
  keys, invalid values.
- `parametersHelp(table)` / `generateHelp(table, { description, sections })` — the help text.
- `parametersTemplate(table)` — the `--conf` template, nested by the dotted keys.

### The shared rows

In every binary's table: `CONF_ROW` (`--conf` / `--config`), `STATE_IDLE_ROW`
(`--state-idle-minutes` / `MCP_STATE_IDLE_MINUTES` / `state-idle-minutes`, the idle bound on held
state), and `SYSTEM_TYPE_ROW` (`--system-type` / `SAP_SYSTEM_TYPE`, required), which is
`@mcp-abap-adt/responsible-rules`' with the rules that read it. In http's and sse's: `tlsRows('http' | 'sse')` (`--tls-cert` / `--tls-key` / `--tls-ca`,
`MCP_TLS_*`), read with `tlsConfigOf(values)`.

The shared removed parameters: `transportRemoved('stdio' | 'http' | 'sse')` (`--transport`,
`MCP_TRANSPORT`, YAML `transport`, with the sentence of the binary that serves it of `TRANSPORT_GONE`),
`SSE_OPTIONS_REMOVED`, `HTTP_OPTIONS_REMOVED`, `TLS_OPTIONS_REMOVED`,
`DESTINATION_OPTIONS_REMOVED`, and the tool set's `expositionRemoved(transport)`: the binary
fixes its tool set (`binaries.ts`), so `--exposition` and YAML `exposition` stop the start
with `expositionGoneWords`, one sentence per word, naming the binary of the same transport that
serves what the words asked for. A removed parameter's `words(form, value)` receives the value the
form carried.

### The config file (`yamlConfig.ts`) and the start (`startup.ts`)

`loadYamlConfig(table, path)`, `validateYamlConfig(table, config)`,
`generateYamlConfigTemplate(table)`, `generateConfigTemplateIfNeeded(table, path)`,
`parseConfigArg(argv)`, `readConfigFile(table, argv)`. `readStartupConfig(table, argv, env,
edges, read)` is a launcher's first step: the config file (its template written when missing, the
start ending `0`), then the table; a `ParameterRefusal` is written to stderr as `[MCP] <words>`
and the start ends `1`.

### The tables

| Binary | Table | Reader | Config |
|---|---|---|---|
| `mcp-abap-adt` | `CORE_PARAMETERS` (`@mcp-abap-adt/core`) | `readCoreConfig` | `CoreConfig` |
| `mcp-abap-adt-http` | `HTTP_PARAMETERS` (`@mcp-abap-adt/http`) | `readHttpConfig` | `HttpConfig` |
| `mcp-abap-adt-sse` | `SSE_PARAMETERS` (`@mcp-abap-adt/sse`) | `readSseConfig` | `SseConfig` |

`IServerConfig` holds the shared rows' fields; each package's config extends it.

```typescript
import { readCoreConfig } from '@mcp-abap-adt/core';

const config = readCoreConfig(process.argv.slice(2), process.env);
// config.mcpDestination, config.envFile, config.envFileSource, config.stateIdleMinutes, …
```

Environment variables and `.env` carry secrets and the session; YAML is configuration only, and
the validator refuses a secret- or session-looking key.

## Usage with AuthBrokerFactory

The launcher of `@mcp-abap-adt/core` maps a `CoreConfig` to an `IAuthBrokerFactoryConfig`
(`factoryConfigFrom`), passing the browser strategy explicitly. See
`server/src/auth/brokerFactory/UNIFIED_BROKER_LOGIC.md`.
