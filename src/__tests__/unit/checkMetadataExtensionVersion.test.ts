/**
 * Unit tests for CheckMetadataExtension version handling.
 *
 * Regression for the "notProcessed / Error while reading the object ... from the
 * database" bug: an active-only DDLX must be checked against the *active* version.
 * The DDLX checkruns endpoint does NOT fall back to active when there is no genuine
 * inactive version, so checking version=inactive on an activated object errors.
 *
 * The low handler must:
 *  - default to checking the 'active' version
 *  - thread an explicit version through to client.getMetadataExtension().check(cfg, version)
 */

const checkMock = jest.fn();

jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getMetadataExtension: () => ({
      check: checkMock,
    }),
  }),
}));

import { handleCheckMetadataExtension as handleLow } from '../../handlers/ddlx/low/handleCheckMetadataExtension';

const PROCESSED_XML = `<?xml version="1.0" encoding="utf-8"?><chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun"><chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:triggeringUri="/sap/bc/adt/ddic/ddlx/sources/zc_ddlx" chkrun:status="processed" chkrun:statusText="Object ZC_DDLX has been checked"/></chkrun:checkRunReports>`;

function makeContext() {
  return {
    connection: {} as any,
    logger: undefined,
  } as any;
}

describe('CheckMetadataExtension version threading', () => {
  beforeEach(() => {
    checkMock.mockReset();
    checkMock.mockResolvedValue({ checkResult: { data: PROCESSED_XML } });
  });

  it("defaults to checking the 'active' version", async () => {
    await handleLow(makeContext(), { name: 'ZC_DDLX' });

    expect(checkMock).toHaveBeenCalledTimes(1);
    const [config, version] = checkMock.mock.calls[0];
    expect(config).toEqual({ name: 'ZC_DDLX' });
    expect(version).toBe('active');
  });

  it("threads an explicit version='inactive' through to the client", async () => {
    await handleLow(makeContext(), { name: 'ZC_DDLX', version: 'inactive' });

    const [, version] = checkMock.mock.calls[0];
    expect(version).toBe('inactive');
  });

  it("threads an explicit version='active' through to the client", async () => {
    await handleLow(makeContext(), { name: 'ZC_DDLX', version: 'active' });

    const [, version] = checkMock.mock.calls[0];
    expect(version).toBe('active');
  });
});
