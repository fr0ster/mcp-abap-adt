import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as https from 'node:https';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import {
  createServerListener,
  getProtocol,
} from '../../../lib/httpTransport/tlsUtils';
import { assertThrows } from '../../helpers/assertions';
import { createSelfSignedCert } from './helpers/selfSignedCert';

let certDir: string;
let certPath: string;
let keyPath: string;

before(() => {
  const { cert, key, dir } = createSelfSignedCert();
  certDir = dir;
  certPath = cert;
  keyPath = key;
});

after(() => {
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

    // Closed in `finally`: a failing assertion must not leave the listener
    // open, or the file never ends (node:test waits for it).
    try {
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

      assert.deepStrictEqual(JSON.parse(body), { ok: true });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('creates HTTP server when no tls config is provided', async () => {
    const app = express();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const server = createServerListener(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    // Closed in `finally`: a failing assertion must not leave the listener
    // open, or the file never ends (node:test waits for it).
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/test`);
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      assert.equal(json.ok, true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('throws when cert file does not exist', () => {
    const app = express();
    assertThrows(
      () =>
        createServerListener(app, {
          cert: '/nonexistent/cert.pem',
          key: keyPath,
        }),
      /cert/i,
    );
  });

  it('throws when key file does not exist', () => {
    const app = express();
    assertThrows(
      () =>
        createServerListener(app, {
          cert: certPath,
          key: '/nonexistent/key.pem',
        }),
      /key/i,
    );
  });
});

describe('getProtocol', () => {
  it('returns https when tls config provided', () => {
    assert.equal(getProtocol({ cert: 'a', key: 'b' }), 'https');
  });

  it('returns http when no tls config', () => {
    assert.equal(getProtocol(), 'http');
    assert.equal(getProtocol(undefined), 'http');
  });
});
