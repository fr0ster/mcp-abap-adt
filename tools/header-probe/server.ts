/**
 * The server the probe runs on: the stdio server, started from the server's
 * own destination configuration — its flags, the `.env` / YAML / destination
 * it reads, the auth broker, the logon and the system information — and
 * logged off at the end. The probe works on that server's connection, in its
 * main flow, as a tool call does.
 */

import type { AbapConnection } from '@mcp-abap-adt/connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { browserCallbackStrategy } from '@mcp-abap-adt/lib/auth';
import { readStartupConfig } from '@mcp-abap-adt/lib/config';
import { fullToolSet, registryOf } from '@mcp-abap-adt/lib/tool-set';
import { AuthBrokerFactory, promptLogger } from '../../server/src/auth';
import {
  coreParameters,
  readCoreConfig,
} from '../../server/src/config/coreParameters';
import { hydrateSystemContextFromEnvFile } from '../../server/src/config/envFileContext';
import {
  effectiveConnectionType,
  effectiveMessageServer,
  effectiveSystemType,
  factoryConfigFrom,
} from '../../server/src/launcher';
import { StdioServer } from '../../server/src/StdioServer';

const silent: ILogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

/** The stdio server with one more door: a send on its connection, in its turn. */
export class ProbeServer extends StdioServer {
  /** `send` on the instance's connection, in the main flow, as a tool call sends. */
  onConnection<T>(
    send: (connection: AbapConnection) => Promise<T>,
  ): Promise<T> {
    return this.onMainConnection(new AbortController().signal, send);
  }
}

/** Why the server could not start, in words that name parameters only. */
export class StartRefused extends Error {}

/**
 * The server for `argv` — the server's own flags (`--env`, `--env-path`,
 * `--mcp`, `--conf`, `--system-type`, …) — connected to its destination.
 */
export async function startProbeServer(
  argv: readonly string[],
  loud: (line: string) => void,
): Promise<{ server: ProbeServer; destination: string }> {
  let refused: string | undefined;
  const config = readStartupConfig(
    coreParameters(fullToolSet, 'header:discovery'),
    argv,
    process.env,
    {
      stderr: (line) => {
        refused = line;
      },
      exit: () => {},
    },
    (args, env, yaml) => readCoreConfig(args, env, yaml, fullToolSet),
  );
  if (config === undefined)
    throw new StartRefused(refused ?? 'the configuration was refused');
  // As the launcher: the env file's context joins the environment first.
  hydrateSystemContextFromEnvFile(config.envFile ?? config.envFilePath);
  const connectionType = effectiveConnectionType(config, process.env);
  const systemType = effectiveSystemType(config, process.env);
  if (connectionType) process.env.SAP_CONNECTION_TYPE = connectionType;
  if (systemType) process.env.SAP_SYSTEM_TYPE = systemType;
  const effective = {
    ...config,
    connectionType,
    systemType,
    ...effectiveMessageServer(config, process.env),
  };
  const factory = new AuthBrokerFactory(
    factoryConfigFrom(effective, {
      browserStrategy: browserCallbackStrategy,
      browserUnavailable: 'the header probe opens no browser',
      promptLogger: promptLogger(loud, silent),
      logger: silent,
    }),
  );
  const destination = factory.defaultDestination;
  if (!destination)
    throw new StartRefused(
      'no destination: pass the server flags --mcp=<destination>, --env=<name> or --env-path=<file>',
    );
  if (systemType === undefined)
    throw new StartRefused(
      'the SAP system type is required: --system-type, SAP_SYSTEM_TYPE or system-type (YAML)',
    );
  const server = new ProbeServer(registryOf(fullToolSet, 'stdio'), factory, {
    sentenceFor: (error) => factory.sentenceFor(error),
  });
  await server.connectAtStart(destination);
  return { server, destination };
}
