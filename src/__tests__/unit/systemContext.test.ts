import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import {
  getStatedSystemContext,
  getSystemContext,
  resetSystemContextCache,
  systemContextFromConfiguration,
} from '../../lib/systemContext';
import { assertMatchObject } from '../helpers/assertions';

/**
 * The process context the configuration states. It sends nothing: the cloud
 * lookup is the request's (requestSystemResolution.ts), and the per-request
 * order lives in the request scope.
 */
describe('systemContextFromConfiguration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetSystemContextCache();
    process.env = { ...originalEnv };
    delete process.env.SAP_MASTER_SYSTEM;
    delete process.env.SAP_RESPONSIBLE;
    delete process.env.SAP_USERNAME;
    delete process.env.SAP_LANGUAGE;
  });

  after(() => {
    process.env = originalEnv;
  });

  it('reads SAP_MASTER_SYSTEM and SAP_RESPONSIBLE into the process context', () => {
    process.env.SAP_MASTER_SYSTEM = 'SYSTEM_FROM_CONFIG';
    process.env.SAP_RESPONSIBLE = 'USER_FROM_CONFIG';
    assertMatchObject(systemContextFromConfiguration(), {
      masterSystem: 'SYSTEM_FROM_CONFIG',
      responsible: 'USER_FROM_CONFIG',
    });
    assert.equal(getSystemContext().masterSystem, 'SYSTEM_FROM_CONFIG');
  });

  it('SAP_USERNAME is no responsible here: the login standing in is a host rule (responsible-rules), not lib', () => {
    process.env.SAP_USERNAME = 'USER_FROM_LOGON';
    systemContextFromConfiguration();
    assert.equal(getStatedSystemContext().responsible, undefined);
    assert.equal(getSystemContext().responsible, undefined);
  });

  it('SAP_RESPONSIBLE is the stated responsible', () => {
    process.env.SAP_USERNAME = 'USER_FROM_LOGON';
    process.env.SAP_RESPONSIBLE = 'USER_FROM_CONFIG';
    systemContextFromConfiguration();
    assert.equal(getStatedSystemContext().responsible, 'USER_FROM_CONFIG');
  });

  it('states nothing when nothing is configured', () => {
    assert.equal(systemContextFromConfiguration(), undefined);
    assert.deepStrictEqual(getSystemContext(), {});
  });
});
