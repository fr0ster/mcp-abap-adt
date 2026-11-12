/**
 * The login callback port is one an identity provider has registered: it
 * stays 1-65535, and 0 — which the HTTP and SSE listener ports accept — is
 * refused.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readCoreConfig } from '../config/coreParameters';

describe('the login callback port', () => {
  it('stays 1-65535: 0 is refused', () => {
    assert.throws(
      () => readCoreConfig(['--browser-auth-port=0'], {}, null),
      /between 1 and 65535/,
    );
  });
});
