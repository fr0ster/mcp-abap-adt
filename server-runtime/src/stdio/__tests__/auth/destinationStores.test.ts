import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import {
  assertMatchObject,
  assertThrows,
  rejectionOf,
} from '../../../../../src/__tests__/helpers/assertions';
import { keyShapeOf, storesFor } from '../../auth/destinationStores';

const URL_ = 'https://system.example.test';
const XSUAA_URL = 'https://xsuaa-system.example.test';

describe('destination stores', () => {
  let root: string;
  let keysDir: string;
  let sessionsDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dest-stores-'));
    keysDir = path.join(root, 'service-keys');
    sessionsDir = path.join(root, 'sessions');
    fs.mkdirSync(keysDir);
    fs.mkdirSync(sessionsDir);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const abapKey = (extra: Record<string, unknown> = {}) => ({
    url: URL_,
    abap: { url: URL_, client: '100' },
    uaa: {
      url: 'https://uaa.example.test',
      clientid: 'client-id',
      clientsecret: 'client-secret',
    },
    ...extra,
  });
  const xsuaaKey = {
    url: 'https://tenant.authentication.example.test',
    clientid: 'xs-client-id',
    clientsecret: 'xs-client-secret',
  };
  const writeKey = (name: string, body: unknown) =>
    fs.writeFileSync(path.join(keysDir, `${name}.json`), JSON.stringify(body));
  const writeSession = (name: string, lines: string[]) =>
    fs.writeFileSync(
      path.join(sessionsDir, `${name}.env`),
      `${lines.join('\n')}\n`,
    );
  const named = (name: string, unsafe = false) =>
    ({ kind: 'named', name, keysDir, sessionsDir, unsafe }) as const;

  describe('keyShapeOf', () => {
    it('root url, clientid, clientsecret is xsuaa', () => {
      writeKey('x', xsuaaKey);
      assert.equal(keyShapeOf(keysDir, 'x'), 'xsuaa');
    });
    it('a nested uaa is abap', () => {
      writeKey('x', abapKey());
      assert.equal(keyShapeOf(keysDir, 'x'), 'abap');
    });
    it('no key is abap', () => {
      assert.equal(keyShapeOf(keysDir, 'x'), 'abap');
    });
    it('refuses a name that is a path', () => {
      assertThrows(() => keyShapeOf(keysDir, '../x'));
    });
  });

  describe('envFile mode', () => {
    const mode = (p: string) =>
      ({ kind: 'envFile', path: p, source: '--env' }) as const;

    it('a missing file is refused naming the source and the path', () => {
      const missing = path.join(root, 'nope.env');
      assertThrows(
        () => storesFor(mode(missing)),
        new RegExp(
          `^--env: .*${missing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        ),
      );
    });

    it('answers a basic file as the default destination', async () => {
      const file = path.join(root, 'conn.env');
      fs.writeFileSync(
        file,
        [
          `SAP_URL=${URL_}`,
          'SAP_AUTH_TYPE=basic',
          'SAP_USERNAME=user-a',
          'SAP_PASSWORD=pass-a',
          '',
        ].join('\n'),
      );
      const s = storesFor(mode(file));
      assert.equal(s.urlKey, 'SAP_URL');
      const cfg = await s.serviceKeyStore.getConnectionConfig('default');
      assertMatchObject(cfg, {
        serviceUrl: URL_,
        authType: 'basic',
        username: 'user-a',
        password: 'pass-a',
      });
    });

    it('the session store reads the token of a jwt file of its format', async () => {
      const file = path.join(root, 'conn.env');
      fs.writeFileSync(
        file,
        `SAP_URL=${URL_}\nSAP_AUTH_TYPE=jwt\nSAP_JWT_TOKEN=tok-1\nSAP_ISSUED_FOR=${URL_}\nSAP_ISSUED_BY=issuer-record\n`,
      );
      const s = storesFor(mode(file));
      const session = await s.sessionStore.loadSession('default');
      assert.equal(session?.authorizationToken, 'tok-1');
    });

    it('a token without its binding keys is not of the store format: refused, record-format (auth-stores 5)', async () => {
      const file = path.join(root, 'conn.env');
      fs.writeFileSync(
        file,
        `SAP_URL=${URL_}\nSAP_AUTH_TYPE=jwt\nSAP_JWT_TOKEN=tok-1\n`,
      );
      const s = storesFor(mode(file));
      assertMatchObject(
        await rejectionOf(s.sessionStore.loadSession('default')),
        { code: 'STORAGE_ERROR', reason: 'record-format' },
      );
    });

    it('a renewed secret rewrites the three secret keys and leaves every other line', async () => {
      const file = path.join(root, 'conn.env');
      const before = [
        '# my comment',
        `SAP_URL=${URL_}`,
        'SAP_AUTH_TYPE=jwt',
        'SAP_JWT_TOKEN=old-token',
        '',
        '# means come next',
        'SAP_CLIENT=100',
        'MY_OWN_KEY=keep me  ',
        'SAP_EXPIRES_AT=1',
        'SAP_REFRESH_TOKEN=old-refresh',
        '',
      ].join('\n');
      fs.writeFileSync(file, before);
      const s = storesFor(mode(file));
      await s.sessionStore.saveSession('default', {
        authorizationToken: 'new-token',
        expiresAt: 4102444800000,
        refreshToken: 'new-refresh',
      });
      const after = fs.readFileSync(file, 'utf8');
      assert.ok(after.includes('SAP_JWT_TOKEN=new-token'));
      assert.ok(after.includes('SAP_REFRESH_TOKEN=new-refresh'));
      assert.match(after, /SAP_EXPIRES_AT=(?!1$)\S+/m);
      const rest = (t: string) =>
        t
          .split('\n')
          .filter(
            (l) =>
              !/^SAP_(JWT_TOKEN|EXPIRES_AT|REFRESH_TOKEN|ISSUED_FOR|ISSUED_BY)=/.test(
                l,
              ),
          )
          .join('\n');
      assert.equal(rest(after), rest(before));
    });
  });

  describe('named mode', () => {
    it('an ABAP key alone answers its url, client and the authorization_code grant', async () => {
      writeKey('x', abapKey());
      const s = storesFor(named('x'));
      assert.equal(s.urlKey, 'SAP_URL');
      assertMatchObject(await s.serviceKeyStore.getConnectionConfig('x'), {
        serviceUrl: URL_,
        sapClient: '100',
        authType: 'jwt',
        grantType: 'authorization_code',
      });
    });

    it('sessions/X.env wins field by field; the key fills the rest', async () => {
      writeKey('x', abapKey());
      writeSession('x', ['SAP_CLIENT=200']);
      const cfg = await storesFor(
        named('x'),
      ).serviceKeyStore.getConnectionConfig('x');
      assert.equal(cfg?.sapClient, '200');
      assert.equal(cfg?.serviceUrl, URL_);
    });

    it('no key, a file stating snc, is answered as snc', async () => {
      writeSession('x', [
        `SAP_URL=${URL_}`,
        'SAP_AUTH_TYPE=snc',
        'SAP_SNC_PARTNERNAME=p:placeholder',
      ]);
      const cfg = await storesFor(
        named('x'),
      ).serviceKeyStore.getConnectionConfig('x');
      assertMatchObject(cfg, {
        authType: 'snc',
        sncPartnerName: 'p:placeholder',
      });
    });

    it('an XSUAA key takes its url from XSUAA_MCP_URL and its client from the key', async () => {
      writeKey('x', xsuaaKey);
      writeSession('x', [`XSUAA_MCP_URL=${XSUAA_URL}`]);
      const s = storesFor(named('x'));
      assert.equal(s.urlKey, 'XSUAA_MCP_URL');
      assert.equal(
        (await s.serviceKeyStore.getConnectionConfig('x'))?.serviceUrl,
        XSUAA_URL,
      );
      assert.equal(
        (await s.serviceKeyStore.getAuthorizationConfig('x'))?.uaaClientId,
        'xs-client-id',
      );
    });

    it('with SAP_URL instead, an XSUAA destination answers no url', async () => {
      writeKey('x', xsuaaKey);
      writeSession('x', [`SAP_URL=${URL_}`]);
      const cfg = await storesFor(
        named('x'),
      ).serviceKeyStore.getConnectionConfig('x');
      assert.ok(!cfg?.serviceUrl);
    });

    describe('urlStore: where the connector URL is read', () => {
      // XsuaaServiceKeyStore answers the key's root url as serviceUrl unless
      // it contains "authentication"; the URL store must not depend on that.
      const keyUrls = [
        ['a UAA url', 'https://tenant.authentication.example.test'],
        ['a url without "authentication"', 'https://tenant.example.test'],
      ] as const;

      for (const [_label, keyUrl] of keyUrls) {
        it(
          format('XSUAA key with %s: answers XSUAA_MCP_URL', _label),
          async () => {
            writeKey('x', { ...xsuaaKey, url: keyUrl });
            writeSession('x', [`XSUAA_MCP_URL=${XSUAA_URL}`]);
            const s = storesFor(named('x'));
            assert.equal(
              (await s.urlStore.getConnectionConfig('x'))?.serviceUrl,
              XSUAA_URL,
            );
          },
        );
      }

      for (const [_label, keyUrl] of keyUrls) {
        it(
          format(
            'XSUAA key with %s and SAP_URL instead: answers no url, never the key url',
            _label,
          ),
          async () => {
            writeKey('x', { ...xsuaaKey, url: keyUrl });
            writeSession('x', [`SAP_URL=${URL_}`]);
            const cfg = await storesFor(
              named('x'),
            ).urlStore.getConnectionConfig('x');
            assert.equal(cfg?.serviceUrl, undefined);
          },
        );
      }

      for (const [_label, keyUrl] of keyUrls) {
        it(
          format(
            'XSUAA key with %s and no session file: answers no url',
            _label,
          ),
          async () => {
            writeKey('x', { ...xsuaaKey, url: keyUrl });
            const cfg = await storesFor(
              named('x'),
            ).urlStore.getConnectionConfig('x');
            assert.equal(cfg?.serviceUrl, undefined);
          },
        );
      }

      it('ABAP key: the url the key store answers (key, or SAP_URL over it)', async () => {
        writeKey('x', abapKey());
        assert.equal(
          (await storesFor(named('x')).urlStore.getConnectionConfig('x'))
            ?.serviceUrl,
          URL_,
        );
        writeSession('x', ['SAP_URL=https://other.example.test']);
        assert.equal(
          (await storesFor(named('x')).urlStore.getConnectionConfig('x'))
            ?.serviceUrl,
          'https://other.example.test',
        );
      });

      it('an --env file: its SAP_URL', async () => {
        const file = path.join(root, 'conn.env');
        fs.writeFileSync(file, `SAP_URL=${URL_}\nSAP_AUTH_TYPE=basic\n`);
        const s = storesFor({ kind: 'envFile', path: file, source: '--env' });
        assert.equal(
          (await s.urlStore.getConnectionConfig('default'))?.serviceUrl,
          URL_,
        );
      });
    });

    it('unsafe: a saved secret lands in sessions/X.env', async () => {
      writeKey('x', abapKey());
      const s = storesFor(named('x', true));
      await s.sessionStore.saveSession('x', {
        authorizationToken: 'tok-2',
        refreshToken: 'ref-2',
      });
      const file = path.join(sessionsDir, 'x.env');
      assert.equal(fs.existsSync(file), true);
      assert.ok(fs.readFileSync(file, 'utf8').includes('tok-2'));
    });

    it('not unsafe: no file is written, the secret is kept in memory', async () => {
      writeKey('x', abapKey());
      const s = storesFor(named('x', false));
      await s.sessionStore.saveSession('x', {
        authorizationToken: 'tok-3',
        refreshToken: 'ref-3',
      });
      assert.deepStrictEqual(fs.readdirSync(sessionsDir), []);
      assert.equal(
        (await s.sessionStore.loadSession('x'))?.authorizationToken,
        'tok-3',
      );
    });

    it('refuses a name that is a path before reading anything', () => {
      assertThrows(() => storesFor(named('../x')));
    });
  });
});
