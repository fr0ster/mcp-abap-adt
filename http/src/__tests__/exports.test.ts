/**
 * `@mcp-abap-adt/http` keeps every name it exported before its code moved to
 * `@mcp-abap-adt/server-runtime` (19.2.0): an importer of `@mcp-abap-adt/http`
 * or `/launcher` sees no change.
 *
 * The lists below are written from 19.1.0's published `dist` (`index.d.ts`,
 * `launcher.d.ts`), values and types apart. Values are read from the loaded
 * modules; types (and values again) from the TypeScript checker over http's
 * sources, so a type that stops being re-exported fails here too, not only in
 * a type-check.
 *
 * And the one export that is not a plain re-export: http's
 * `StreamableHttpServer` answers http's version when it is constructed without
 * one, whatever version the runtime has.
 */
jest.mock('../../../server-runtime/src/runtimeVersion', () => ({
  RUNTIME_VERSION: '0.0.0-runtime',
}));

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import type { IHttpApplication } from '@mcp-abap-adt/lib/embeddable';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import * as runtime from '@mcp-abap-adt/server-runtime/http/server';
import express from 'express';
import * as ts from 'typescript';
import { HTTP_VERSION } from '../httpVersion';
import * as http from '../index';
import * as launcher from '../launcher';

/** 19.1.0's `@mcp-abap-adt/http` (`dist/index.d.ts`). */
const HTTP_19_1_0 = {
  values: [
    'HTTP_PARAMETERS',
    'HTTP_ROWS',
    'StreamableHttpServer',
    'httpParameters',
    'readHttpConfig',
  ],
  types: ['HttpConfig', 'StreamableHttpServerOptions'],
};

/** 19.1.0's `@mcp-abap-adt/http/launcher` (`dist/launcher.d.ts`). */
const LAUNCHER_19_1_0 = {
  values: ['httpHelp', 'launch', 'main'],
  types: ['HttpLauncherDeps', 'HttpLauncherOptions'],
};

const SRC = path.resolve(__dirname, '..');
const ENTRIES = [
  ['@mcp-abap-adt/http', 'index.ts', http, HTTP_19_1_0],
  ['@mcp-abap-adt/http/launcher', 'launcher.ts', launcher, LAUNCHER_19_1_0],
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
  if (!configFile) throw new Error('http/tsconfig.test.json not read');
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

describe('@mcp-abap-adt/http keeps every name 19.1.0 exported', () => {
  describe.each(ENTRIES)('%s', (_name, _file, loaded, before) => {
    it.each(before.values)('exports the value %s', (name) => {
      expect(loaded).toHaveProperty(name);
      expect((loaded as Record<string, unknown>)[name]).toBeDefined();
    });
  });

  // One program for both entries: the checker follows each re-export into
  // server-runtime's sources through tsconfig.test.json's paths.
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

/** The version the server's `/health` answers. */
async function versionAnswered(server: {
  registerRoutes(app: IHttpApplication): void;
}): Promise<string | undefined> {
  const app = express();
  server.registerRoutes(app as unknown as IHttpApplication);
  const listener: Server = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  try {
    const { port } = listener.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/mcp/health`);
    const body = (await res.json()) as { version?: string };
    return body.version;
  } finally {
    await new Promise<void>((resolve) => listener.close(() => resolve()));
  }
}

describe("http's StreamableHttpServer answers http's version", () => {
  it('the runtime version module is mocked to another value', async () => {
    const server = new runtime.StreamableHttpServer(
      new CompositeHandlersRegistry([]),
    );
    expect(await versionAnswered(server)).toBe('0.0.0-runtime');
    expect(HTTP_VERSION).not.toBe('0.0.0-runtime');
  });

  it('without a version: HTTP_VERSION', async () => {
    const server = new http.StreamableHttpServer(
      new CompositeHandlersRegistry([]),
    );
    expect(await versionAnswered(server)).toBe(HTTP_VERSION);
  });

  it('with a version: that version', async () => {
    const server = new http.StreamableHttpServer(
      new CompositeHandlersRegistry([]),
      { version: '9.9.9-given' },
    );
    expect(await versionAnswered(server)).toBe('9.9.9-given');
  });

  it('is the runtime StreamableHttpServer underneath', () => {
    const server = new http.StreamableHttpServer(
      new CompositeHandlersRegistry([]),
    );
    expect(server).toBeInstanceOf(runtime.StreamableHttpServer);
  });
});
