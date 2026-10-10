# Configuration

How the server reads its parameters: CLI, then environment, then YAML.

## Components

### ServerConfigManager
The one entry point: loads the YAML file named by `--config`, parses the
command line and the environment, and answers an `IServerConfig`.

```typescript
import { ServerConfigManager } from '@mcp-abap-adt/lib/config';

const config = await new ServerConfigManager().getConfig();
// config.mcpDestination, config.envFile, config.envFileSource, config.transport, …
```

### authParameters
The auth and connection parameters in one table (`AUTH_PARAMETERS`): each
row's CLI, environment and YAML forms. The argument parser, the YAML loader
and validator, the `--config` template and the help text all read it.
Environment variables and `.env` carry secrets and the session; YAML is
configuration only, and the validator refuses a secret- or session-looking key.

### ArgumentsParser
Parses the command line and the environment for `ServerConfigManager`.

## Usage with AuthBrokerFactory

The launcher of `@mcp-abap-adt/core` maps an `IServerConfig` to an
`IAuthBrokerFactoryConfig` (`factoryConfigFrom`), passing the browser strategy
explicitly:

```typescript
import { AuthBrokerFactory } from '@mcp-abap-adt/core/auth';
import { browserCallbackStrategy } from '@mcp-abap-adt/lib/auth';

const factory = new AuthBrokerFactory({
  mcpDestination: config.mcpDestination,
  unsafe: config.unsafe ?? false,
  browser: config.browser ?? 'system',
  browserStrategy: browserCallbackStrategy,
});
const settings = await factory.settingsFor(destination);
const credential = await factory.getProvider(destination);
```
