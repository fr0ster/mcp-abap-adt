import * as fs from 'node:fs';
import * as https from 'node:https';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createServerListener, getProtocol } from '../../server/tlsUtils';
import { createSelfSignedCert } from './helpers/selfSignedCert';

let certDir: string;
let certPath: string;
let keyPath: string;

beforeAll(() => {
  const { cert, key, dir } = createSelfSignedCert();
  certDir = dir;
  certPath = cert;
  keyPath = key;
});

afterAll(() => {
  fs.rmSync(certDir, { recursive: true, force: true });
});

describe('createServerListener', () => {
  it('creates HTTPS server when tls config is provided', async () => {
    const app = express();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const server = createServerListener(app, {
      cert: certPath,
      key: keyPath,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const { port } = server.address() as AddressInfo;

    // Use node:https to make request with rejectUnauthorized: false
    const body = await new Promise<string>((resolve, reject) => {
      https
        .get(
          `https://127.0.0.1:${port}/test`,
          { rejectUnauthorized: false },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => resolve(data));
          },
        )
        .on('error', reject);
    });

    expect(JSON.parse(body)).toEqual({ ok: true });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('creates HTTP server when no tls config is provided', async () => {
    const app = express();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const server = createServerListener(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/test`);
    expect(res.status).toBe(200);

    const json = (await res.json()) as any;
    expect(json.ok).toBe(true);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('throws when cert file does not exist', () => {
    const app = express();
    expect(() =>
      createServerListener(app, {
        cert: '/nonexistent/cert.pem',
        key: keyPath,
      }),
    ).toThrow(/cert/i);
  });

  it('throws when key file does not exist', () => {
    const app = express();
    expect(() =>
      createServerListener(app, {
        cert: certPath,
        key: '/nonexistent/key.pem',
      }),
    ).toThrow(/key/i);
  });
});

describe('getProtocol', () => {
  it('returns https when tls config provided', () => {
    expect(getProtocol({ cert: 'a', key: 'b' })).toBe('https');
  });

  it('returns http when no tls config', () => {
    expect(getProtocol()).toBe('http');
    expect(getProtocol(undefined)).toBe('http');
  });
});
