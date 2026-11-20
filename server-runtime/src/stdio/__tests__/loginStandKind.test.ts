/**
 * The login stand states the system kind its case gives, whatever the
 * credential (the owner's rule: nothing is derived from the authorization).
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type Stand, stand } from './helpers/loginStand';

let saved: string | undefined;
let s: Stand | undefined;

beforeEach(() => {
  saved = process.env.SAP_SYSTEM_TYPE;
  delete process.env.SAP_SYSTEM_TYPE;
});

afterEach(async () => {
  await s?.close();
  s = undefined;
  if (saved === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = saved;
});

describe('the login stand takes the kind it is given, whatever the credential', () => {
  it('a JWT credential with onprem stated is on premise', async () => {
    s = await stand({ kind: 'onprem', auth: 'jwt' });
    assert.equal(process.env.SAP_SYSTEM_TYPE, 'onprem');
  });

  it('a basic credential with cloud stated is cloud', async () => {
    s = await stand({ kind: 'cloud', auth: 'basic' });
    assert.equal(process.env.SAP_SYSTEM_TYPE, 'cloud');
  });
});
