import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
      expect(keyShapeOf(keysDir, 'x')).toBe('xsuaa');
    });
    it('a nested uaa is abap', () => {
      writeKey('x', abapKey());
      expect(keyShapeOf(keysDir, 'x')).toBe('abap');
    });
    it('no key is abap', () => {
      expect(keyShapeOf(keysDir, 'x')).toBe('abap');
    });
    it('refuses a name that is a path', () => {
      expect(() => keyShapeOf(keysDir, '../x')).toThrow();
    });
  });

  describe('envFile mode', () => {
    const mode = (p: string) =>
      ({ kind: 'envFile', path: p, source: '--env' }) as const;

    it('a missing file is refused naming the source and the path', () => {
      const missing = path.join(root, 'nope.env');
      expect(() => storesFor(mode(missing))).toThrow(
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
      expect(s.urlKey).toBe('SAP_URL');
      const cfg = await s.serviceKeyStore.getConnectionConfig('default');
      expect(cfg).toMatchObject({
        serviceUrl: URL_,
        authType: 'basic',
        username: 'user-a',
        password: 'pass-a',
      });
    });

    it('the session store reads the token of a jwt file', async () => {
      const file = path.join(root, 'conn.env');
      fs.writeFileSync(
        file,
        `SAP_URL=${URL_}\nSAP_AUTH_TYPE=jwt\nSAP_JWT_TOKEN=tok-1\n`,
      );
      const s = storesFor(mode(file));
      const session = await s.sessionStore.loadSession('default');
      expect(session?.authorizationToken).toBe('tok-1');
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
      expect(after).toContain('SAP_JWT_TOKEN=new-token');
      expect(after).toContain('SAP_REFRESH_TOKEN=new-refresh');
      expect(after).toMatch(/SAP_EXPIRES_AT=(?!1$)\S+/m);
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
      expect(rest(after)).toBe(rest(before));
    });
  });

  describe('named mode', () => {
    it('an ABAP key alone answers its url, client and the authorization_code grant', async () => {
      writeKey('x', abapKey());
      const s = storesFor(named('x'));
      expect(s.urlKey).toBe('SAP_URL');
      expect(await s.serviceKeyStore.getConnectionConfig('x')).toMatchObject({
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
      expect(cfg?.sapClient).toBe('200');
      expect(cfg?.serviceUrl).toBe(URL_);
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
      expect(cfg).toMatchObject({
        authType: 'snc',
        sncPartnerName: 'p:placeholder',
      });
    });

    it('an XSUAA key takes its url from XSUAA_MCP_URL and its client from the key', async () => {
      writeKey('x', xsuaaKey);
      writeSession('x', [`XSUAA_MCP_URL=${XSUAA_URL}`]);
      const s = storesFor(named('x'));
      expect(s.urlKey).toBe('XSUAA_MCP_URL');
      expect(
        (await s.serviceKeyStore.getConnectionConfig('x'))?.serviceUrl,
      ).toBe(XSUAA_URL);
      expect(
        (await s.serviceKeyStore.getAuthorizationConfig('x'))?.uaaClientId,
      ).toBe('xs-client-id');
    });

    it('with SAP_URL instead, an XSUAA destination answers no url', async () => {
      writeKey('x', xsuaaKey);
      writeSession('x', [`SAP_URL=${URL_}`]);
      const cfg = await storesFor(
        named('x'),
      ).serviceKeyStore.getConnectionConfig('x');
      expect(cfg?.serviceUrl).toBeFalsy();
    });

    describe('urlStore: where the connector URL is read', () => {
      // XsuaaServiceKeyStore answers the key's root url as serviceUrl unless
      // it contains "authentication"; the URL store must not depend on that.
      const keyUrls = [
        ['a UAA url', 'https://tenant.authentication.example.test'],
        ['a url without "authentication"', 'https://tenant.example.test'],
      ] as const;

      it.each(keyUrls)(
        'XSUAA key with %s: answers XSUAA_MCP_URL',
        async (_label, keyUrl) => {
          writeKey('x', { ...xsuaaKey, url: keyUrl });
          writeSession('x', [`XSUAA_MCP_URL=${XSUAA_URL}`]);
          const s = storesFor(named('x'));
          expect((await s.urlStore.getConnectionConfig('x'))?.serviceUrl).toBe(
            XSUAA_URL,
          );
        },
      );

      it.each(keyUrls)(
        'XSUAA key with %s and SAP_URL instead: answers no url, never the key url',
        async (_label, keyUrl) => {
          writeKey('x', { ...xsuaaKey, url: keyUrl });
          writeSession('x', [`SAP_URL=${URL_}`]);
          const cfg = await storesFor(named('x')).urlStore.getConnectionConfig(
            'x',
          );
          expect(cfg?.serviceUrl).toBeUndefined();
        },
      );

      it.each(keyUrls)(
        'XSUAA key with %s and no session file: answers no url',
        async (_label, keyUrl) => {
          writeKey('x', { ...xsuaaKey, url: keyUrl });
          const cfg = await storesFor(named('x')).urlStore.getConnectionConfig(
            'x',
          );
          expect(cfg?.serviceUrl).toBeUndefined();
        },
      );

      it('ABAP key: the url the key store answers (key, or SAP_URL over it)', async () => {
        writeKey('x', abapKey());
        expect(
          (await storesFor(named('x')).urlStore.getConnectionConfig('x'))
            ?.serviceUrl,
        ).toBe(URL_);
        writeSession('x', ['SAP_URL=https://other.example.test']);
        expect(
          (await storesFor(named('x')).urlStore.getConnectionConfig('x'))
            ?.serviceUrl,
        ).toBe('https://other.example.test');
      });

      it('an --env file: its SAP_URL', async () => {
        const file = path.join(root, 'conn.env');
        fs.writeFileSync(file, `SAP_URL=${URL_}\nSAP_AUTH_TYPE=basic\n`);
        const s = storesFor({ kind: 'envFile', path: file, source: '--env' });
        expect(
          (await s.urlStore.getConnectionConfig('default'))?.serviceUrl,
        ).toBe(URL_);
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
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.readFileSync(file, 'utf8')).toContain('tok-2');
    });

    it('not unsafe: no file is written, the secret is kept in memory', async () => {
      writeKey('x', abapKey());
      const s = storesFor(named('x', false));
      await s.sessionStore.saveSession('x', {
        authorizationToken: 'tok-3',
        refreshToken: 'ref-3',
      });
      expect(fs.readdirSync(sessionsDir)).toEqual([]);
      expect((await s.sessionStore.loadSession('x'))?.authorizationToken).toBe(
        'tok-3',
      );
    });

    it('refuses a name that is a path before reading anything', () => {
      expect(() => storesFor(named('../x'))).toThrow();
    });
  });
});
