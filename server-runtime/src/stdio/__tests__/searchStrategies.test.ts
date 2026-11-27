/**
 * The stdio launcher builds its server with `SearchSource`'s shipped
 * strategies (DO22, DO24): the context `SearchSource` runs in carries
 * `skipSapAnswers` and `substringLineMatch`. The server is built by the
 * launcher itself (`launch`, on an in-memory transport); the handler is
 * replaced by one recording the context it is called in.
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, it, mock } from 'node:test';
import { browserCallbackStrategy } from '@mcp-abap-adt/lib/auth';
import {
  skipSapAnswers,
  substringLineMatch,
} from '@mcp-abap-adt/lib/embeddable';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  type AdtStandIn,
  adtStandIn,
} from '../../../../src/__tests__/helpers/adtStandIn';
import * as searchSourceHandler from '../../../../src/handlers/system/readonly/handleSearchSource';
import { resetProcessLatchForTests } from '../../../../src/lib/activeTools';
import { readCoreConfig } from '../config/coreParameters';
import { launch } from '../launcher.js';

const seen: HandlerContext[] = [];
// handleSearchSource replaced on the module that defines it (the search
// group reads it at call time); its other names
// stay real.
mock.method(
  searchSourceHandler,
  'handleSearchSource',
  async (context: HandlerContext) => {
    seen.push(context);
    return { isError: false, content: [{ type: 'text', text: 'recorded' }] };
  },
);

let standIn: AdtStandIn;
let root: string;
const savedEnv = { ...process.env };
beforeEach(async () => {
  resetProcessLatchForTests();
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'strategies-')));
  standIn = await adtStandIn();
  delete process.env.SAP_SYSTEM_TYPE;
  delete process.env.MCP_ENV_PATH;
});
afterEach(async () => {
  await standIn.close();
  fs.rmSync(root, { recursive: true, force: true });
  process.env = { ...savedEnv };
});

const BOUND_CASES: ReadonlyArray<{
  readonly argv: readonly string[];
  readonly bound: number | undefined;
}> = [
  { argv: [], bound: undefined },
  { argv: ['--batch-parts-per-envelope=300'], bound: 300 },
];

for (const { argv: boundArgv, bound } of BOUND_CASES) {
  it(`the stdio launcher passes the shipped strategies to its server, the envelope bound ${bound ?? 'none'} included`, async () => {
    seen.length = 0;
    const envFile = path.join(root, 'strategies.env');
    fs.writeFileSync(
      envFile,
      [
        `SAP_URL=${standIn.url}`,
        'SAP_CLIENT=100',
        'SAP_AUTH_TYPE=basic',
        'SAP_CONNECTION_TYPE=http',
        'SAP_USERNAME=STRATEGY_USER',
        'SAP_PASSWORD=strategy-password',
        '',
      ].join('\n'),
    );
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const processLike = Object.assign(new EventEmitter(), {
      stdin: new EventEmitter(),
    });
    await launch(
      readCoreConfig(
        [
          `--env-path=${envFile}`,
          `--auth-broker-path=${root}`,
          '--system-type=onprem',
          ...boundArgv,
        ],
        process.env,
        null,
      ),
      {
        toolSet: fullToolSet,
        program: 'mcp-abap-adt',
        version: '0.0.0-test',
        packageName: '@mcp-abap-adt/core',
      },
      {
        browserStrategy: browserCallbackStrategy,
        stderr: () => {},
        exit: () => {},
        processLike,
        platform: 'linux',
        transport: serverSide,
      },
    );
    const client = new Client({ name: 'stdio-strategies', version: '1.0.0' });
    await client.connect(clientSide);
    try {
      const answer = await client.callTool({
        name: 'SearchSource',
        arguments: { query: 'x', packages: ['Z'], background: false },
      });
      console.log('ANSWER', JSON.stringify(answer).slice(0, 300));
      assert.equal(seen.length, 1);
      assert.equal(seen[0]?.sapAnswerStrategy, skipSapAnswers);
      assert.equal(seen[0]?.lineMatchStrategy, substringLineMatch);
      assert.equal(seen[0]?.partsPerEnvelope, bound);
    } finally {
      await client.close();
    }
  });
}
