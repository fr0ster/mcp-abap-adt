/**
 * `@mcp-abap-adt/core` keeps every name it exported before its code moved to
 * `@mcp-abap-adt/server-runtime` (19.2.0): an importer of `@mcp-abap-adt/core`,
 * `/launcher` or `/auth` sees no change.
 *
 * The lists below are written from 19.1.0's published `dist` (`index.d.ts`,
 * `launcher.d.ts`, `auth/index.d.ts`), values and types apart. Values are read
 * from the loaded modules; types (and values again) from the TypeScript
 * checker over core's sources, so a type that stops being re-exported fails
 * here too, not only in a type-check.
 *
 * And the one export that is not a plain re-export: core's `StdioServer`
 * answers core's version when it is constructed without one, whatever version
 * the runtime has.
 */
jest.mock('../../../server-runtime/src/runtimeVersion', () => ({
  RUNTIME_VERSION: '0.0.0-runtime',
}));

import * as path from 'node:path';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import * as runtime from '@mcp-abap-adt/server-runtime/stdio/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as ts from 'typescript';
import * as auth from '../auth/index';
import { CORE_VERSION } from '../coreVersion';
import * as core from '../index';
import * as launcher from '../launcher';

/** 19.1.0's `@mcp-abap-adt/core` (`dist/index.d.ts`). */
const CORE_19_1_0 = {
  values: [
    'AUTH_DEBUG_ROW',
    'CORE_PARAMETERS',
    'CORE_ROWS',
    'ENV_FILE_CONTEXT_KEYS',
    'LOGIN_TIMEOUT_ROW',
    'MAX_LOGIN_TIMEOUT_SECONDS',
    'MESSAGE_SERVER_ROWS',
    'StdioServer',
    'coreParameters',
    'destinationSource',
    'getPlatformPaths',
    'hydrateSystemContextFromEnvFile',
    'parseLoginTimeout',
    'readCoreConfig',
    'resolveEnvFilePath',
    'statedLoginTimeout',
  ],
  types: ['CoreConfig', 'StdioServerOptions'],
};

/** 19.1.0's `@mcp-abap-adt/core/launcher` (`dist/launcher.d.ts`). */
const LAUNCHER_19_1_0 = {
  values: [
    'AUTH_DEBUG_WARNING',
    'coreHelp',
    'effectiveConnectionType',
    'effectiveMessageServer',
    'effectiveSystemType',
    'factoryConfigFrom',
    'launch',
    'launcherFailedLine',
    'main',
    'startCloudWithoutSystemInformationWords',
    'startConnectionWords',
    'startLookupFailedWords',
    'startSystemTypeRequiredWords',
    'startSystemUserUnknownWords',
    'stateLoggerForTransport',
  ],
  types: ['LauncherDeps', 'LauncherOptions', 'StdioLauncherEdges'],
};

/** 19.1.0's `@mcp-abap-adt/core/auth` (`dist/auth/index.d.ts`). */
const AUTH_19_1_0 = {
  values: [
    'AUTH_TYPES',
    'AuthBrokerFactory',
    'BROWSER_NAMES',
    'BrowserChoiceError',
    'DestinationRefusal',
    'GRANTS',
    'HINTS',
    'JWT_NONE_HINT',
    'RECORD_FORMAT_HINT',
    'REFRESH_ONLY_SENTENCE',
    'RENEWAL_MODES',
    'SHUTDOWN_SENTENCE',
    'UnsupportedAuthenticationError',
    'browserFor',
    'browserOf',
    'destinationFailureOf',
    'destinationFailureWords',
    'destinationSource',
    'promptLogger',
    'serverLogin',
    'serverSentence',
    'vetMeans',
  ],
  types: [
    'AuthType',
    'BrowserChoice',
    'BrowserMapping',
    'BrowserName',
    'DestinationFailureOptions',
    'IAuthBrokerFactory',
    'IAuthBrokerFactoryConfig',
    'IDestinations',
    'LoginStrategyOptions',
    'RenewalMode',
    'ServerLoginContext',
    'ServerState',
    'SettleReport',
    'VettedAuthentication',
  ],
};

const SRC = path.resolve(__dirname, '..');
const ENTRIES = [
  ['@mcp-abap-adt/core', 'index.ts', core, CORE_19_1_0],
  ['@mcp-abap-adt/core/launcher', 'launcher.ts', launcher, LAUNCHER_19_1_0],
  ['@mcp-abap-adt/core/auth', 'auth/index.ts', auth, AUTH_19_1_0],
] as const;

/** Every name each entry's source exports, as the TypeScript checker reads it. */
function checkedExports(): Map<string, string[]> {
  const configFile = ts.getParsedCommandLineOfConfigFile(
    path.resolve(SRC, '..', 'tsconfig.test.json'),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
      },
    },
  );
  if (!configFile) throw new Error('server/tsconfig.test.json not read');
  const files = ENTRIES.map(([, file]) => path.join(SRC, file));
  const program = ts.createProgram(files, configFile.options);
  const checker = program.getTypeChecker();
  const names = new Map<string, string[]>();
  for (const file of files) {
    const source = program.getSourceFile(file);
    const symbol = source && checker.getSymbolAtLocation(source);
    if (!symbol) throw new Error(`no module symbol for ${file}`);
    names.set(
      file,
      checker.getExportsOfModule(symbol).map((s) => s.name),
    );
  }
  return names;
}

describe('@mcp-abap-adt/core keeps every name 19.1.0 exported', () => {
  describe.each(ENTRIES)('%s', (_name, _file, loaded, before) => {
    it.each(before.values)('exports the value %s', (name) => {
      expect(loaded).toHaveProperty(name);
      expect((loaded as Record<string, unknown>)[name]).toBeDefined();
    });
  });

  // One program for the three entries: the checker follows each re-export
  // into server-runtime's sources through tsconfig.test.json's paths.
  const checked = checkedExports();
  describe.each(ENTRIES)(
    '%s, as the checker reads it',
    (_name, file, _l, before) => {
      const exported = checked.get(path.join(SRC, file)) ?? [];
      it.each([...before.values, ...before.types])('exports %s', (name) => {
        expect(exported).toContain(name);
      });
    },
  );
});

async function versionAnswered(server: {
  start(destination: undefined, transport: InMemoryTransport): Promise<void>;
  close?(): Promise<void>;
}): Promise<string | undefined> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'exports-test', version: '1.0.0' });
  await Promise.all([
    server.start(undefined, serverSide),
    client.connect(clientSide),
  ]);
  try {
    return client.getServerVersion()?.version;
  } finally {
    await client.close();
  }
}

describe("core's StdioServer answers core's version", () => {
  it('the runtime version module is mocked to another value', async () => {
    const server = new runtime.StdioServer(
      new CompositeHandlersRegistry([]),
      undefined,
    );
    expect(await versionAnswered(server)).toBe('0.0.0-runtime');
    expect(CORE_VERSION).not.toBe('0.0.0-runtime');
  });

  it('without a version: CORE_VERSION', async () => {
    const server = new core.StdioServer(
      new CompositeHandlersRegistry([]),
      undefined,
    );
    expect(await versionAnswered(server)).toBe(CORE_VERSION);
  });

  it('with a version: that version', async () => {
    const server = new core.StdioServer(
      new CompositeHandlersRegistry([]),
      undefined,
      { version: '9.9.9-given' },
    );
    expect(await versionAnswered(server)).toBe('9.9.9-given');
  });

  it('is the runtime StdioServer underneath', () => {
    const server = new core.StdioServer(
      new CompositeHandlersRegistry([]),
      undefined,
    );
    expect(server).toBeInstanceOf(runtime.StdioServer);
  });
});
