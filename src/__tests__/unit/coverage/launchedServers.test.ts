/**
 * Launched servers under the refusal stop (plan C2 Step 4a): a real child
 * of the stdio binary (from the build, `npm run build` first) against the
 * ADT stand-in. The parent logs on with the same credential before each
 * launch, reads every answer of the child, and on a credential refusal
 * latches the marker, stops the child, and launches and sends nothing more.
 * A credential the child renews (`401`, refreshed, resent, `200`) latches
 * nothing.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import {
  brokerBase,
  factoryConfig,
  recordingLogins,
  silentLogger,
} from '../../../../server-runtime/src/stdio/__tests__/helpers/factoryFixture';
import {
  type TokenEndpoint,
  tokenEndpoint,
} from '../../../../server-runtime/src/stdio/__tests__/helpers/loginStand';
import { AuthBrokerFactory } from '../../../../server-runtime/src/stdio/auth/brokerFactory';
import {
  type AdtStandIn,
  adtStandIn,
  basicOf,
  isLogoff,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { launchGuarded } from '../../integration/helpers/launchedServers';
import {
  credentialRefused,
  guardedTestConnection,
  REFUSED_AFTER_MARKER,
} from '../../integration/helpers/refusalGuard';
import { launchStdio } from '../../integration/helpers/testers/hardMode';

jest.setTimeout(180_000);

const USER = 'LAUNCH_USER';
const PASSWORD = 'launch-password';

let stand: AdtStandIn;
let base: string;
let runDir: string;
const cleanups: Array<() => void> = [];

beforeEach(async () => {
  stand = await adtStandIn();
  base = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'launched-servers-')),
  );
  runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'launched-run-'));
  process.env.MCP_ABAP_ADT_COVERAGE_RUN = runDir;
});

afterEach(async () => {
  await stand.close();
  delete process.env.MCP_ABAP_ADT_COVERAGE_RUN;
  fs.rmSync(base, { recursive: true, force: true });
  fs.rmSync(runDir, { recursive: true, force: true });
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** The ADT request a tool call sends, not the logon or the system's identity. */
const isToolRequest = (request: StandInRequest): boolean =>
  !isLogoff(request.url) &&
  !request.url.startsWith('/sap/bc/adt/core/discovery') &&
  !request.url.startsWith('/sap/bc/adt/core/http/systeminformation');

describe('launched servers', () => {
  it('a terminal refusal answer stops every later launch and send', async () => {
    const envFile = path.join(base, 'basic.env');
    fs.writeFileSync(
      envFile,
      [
        `SAP_URL=${stand.url}`,
        'SAP_CLIENT=100',
        'SAP_AUTH_TYPE=basic',
        'SAP_CONNECTION_TYPE=http',
        `SAP_USERNAME=${USER}`,
        `SAP_PASSWORD=${PASSWORD}`,
        '',
      ].join('\n'),
    );
    const settings = {
      url: stand.url,
      client: '100',
      authType: 'basic' as const,
      username: USER,
    };
    const logOn = jest.fn(async () => {
      const own = guardedTestConnection(
        settings,
        new BasicAuthProvider(USER, PASSWORD),
        { kind: 'onprem' },
      );
      await own.connect();
    });
    const launch = jest.fn(() =>
      launchStdio({
        set: 'full',
        kind: 'onprem',
        args: [`--env-path=${envFile}`, `--auth-broker-path=${base}`],
      }),
    );
    const server = await launchGuarded({ logOn, launch });
    try {
      expect(logOn).toHaveBeenCalledTimes(1);
      const ok = await server.call('GetAdtTypes', {});
      expect(ok.isError).toBe(false);
      expect(credentialRefused()).toBe(false);

      // The system now refuses the basic credential: the child cannot renew it.
      stand.refuse(true);
      const refused = await server.call('GetAdtTypes', {});
      expect(refused.isError).toBe(true);
      expect(credentialRefused()).toBe(true);

      const sent = stand.requests.length;
      await expect(server.call('GetAdtTypes', {})).rejects.toThrow(
        REFUSED_AFTER_MARKER,
      );
      await expect(launchGuarded({ logOn, launch })).rejects.toThrow(
        REFUSED_AFTER_MARKER,
      );
      expect(logOn).toHaveBeenCalledTimes(1);
      expect(launch).toHaveBeenCalledTimes(1);
      expect(stand.requests.length).toBe(sent);
    } finally {
      await server.close();
    }
  });

  it("a renewing credential's success does not latch", async () => {
    const tokens: TokenEndpoint = await tokenEndpoint();
    try {
      // A destination whose token renews through its refresh token: the
      // session file holds tokens issued by a first, in-process login.
      const broker = brokerBase('launched-renewing');
      const envFile = broker.writeFile('renewing.env', [
        `SAP_URL=${stand.url}`,
        'SAP_AUTH_TYPE=jwt',
        'SAP_CONNECTION_TYPE=http',
        'SAP_GRANT_TYPE=authorization_code',
        `SAP_UAA_URL=${tokens.url}`,
        'SAP_UAA_CLIENT_ID=client-id',
        'SAP_UAA_CLIENT_SECRET=client-secret',
      ]);
      cleanups.push(() => broker.remove());
      const first = new AuthBrokerFactory(
        factoryConfig(broker, recordingLogins(), {
          envFile: { path: envFile, source: '--env-path' },
          renewal: 'refresh-then-login',
          logger: silentLogger,
        }),
      );
      const provider = await first.getProvider('default');
      const settings = await first.settingsFor('default');
      // The parent's own logon with the same credential.
      const logOn = async (): Promise<void> => {
        const own = guardedTestConnection(settings, provider, {
          kind: 'onprem',
        });
        await own.connect();
      };
      const server = await launchGuarded({
        logOn,
        launch: async () => {
          // The tokens the first login obtained, written for the child.
          await first.settle();
          return launchStdio({
            set: 'full',
            kind: 'onprem',
            args: [
              `--env-path=${envFile}`,
              `--auth-broker-path=${broker.root}`,
              '--renewal=refresh-only',
              '--browser=none',
            ],
          });
        },
      });
      try {
        const grantsBefore = tokens.grants.length;
        stand.answerOnce(isToolRequest, 401);
        const answer = await server.call('GetAdtTypes', {});
        expect(answer.isError).toBe(false);
        expect(tokens.grants.slice(grantsBefore)).toEqual(['refresh_token']);
        expect(credentialRefused()).toBe(false);
        // Never the basic credential of the other case: the child's token.
        expect(
          stand.requests.some(
            (r) => r.authorization === basicOf(USER, PASSWORD),
          ),
        ).toBe(false);
      } finally {
        await server.close();
      }
    } finally {
      await tokens.close();
    }
  });
});
