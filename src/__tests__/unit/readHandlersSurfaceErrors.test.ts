/**
 * Unit test (#159): readonly handlers must NOT mask a failed read as
 * `success:true` + null. When the underlying read throws (auth/network/404/5xx),
 * the handler must return a structured failure (isError:true).
 *
 * SAP-free via a mocked AdtClient. Domain and Class stand in for the whole
 * family of 18 handlers that share the identical read+readMetadata structure.
 */

const mockDomainRead = jest.fn();
const mockDomainReadMeta = jest.fn();
const mockClassRead = jest.fn();
const mockClassReadMeta = jest.fn();

jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getDomain: () => ({
      read: mockDomainRead,
      readMetadata: mockDomainReadMeta,
    }),
    getClass: () => ({
      read: mockClassRead,
      readMetadata: mockClassReadMeta,
    }),
  }),
}));

import { handleReadClass } from '../../handlers/class/readonly/handleReadClass';
import { handleReadDomain } from '../../handlers/domain/readonly/handleReadDomain';

const ctx = { connection: {}, logger: undefined } as any;

function payload(result: any) {
  const text =
    (result.content.find((c: any) => c.type === 'text') as any)?.text || '';
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

describe('readonly handlers surface read failures as isError (#159)', () => {
  beforeEach(() => {
    mockDomainRead.mockReset();
    mockDomainReadMeta.mockReset();
    mockClassRead.mockReset();
    mockClassReadMeta.mockReset();
  });

  it('ReadDomain: happy path returns success with data', async () => {
    mockDomainRead.mockResolvedValue({ readResult: { data: '<domain/>' } });
    mockDomainReadMeta.mockResolvedValue({
      metadataResult: { data: '<meta/>' },
    });

    const result = await handleReadDomain(ctx, { domain_name: 'ZD_OK' });

    expect(result.isError).toBe(false);
    const p = payload(result);
    expect(p.success).toBe(true);
    expect(p.source_code).toBe('<domain/>');
  });

  it('ReadDomain: a thrown read (e.g. expired token) → isError, NOT false success', async () => {
    const err: any = new Error('JWT token has expired');
    err.response = { status: 401 };
    mockDomainRead.mockRejectedValue(err);
    mockDomainReadMeta.mockRejectedValue(err);

    const result = await handleReadDomain(ctx, { domain_name: 'ZD_LOCKED' });

    expect(result.isError).toBe(true);
    expect(payload(result).success).not.toBe(true);
  });

  it('ReadDomain: a not-found (404) read → isError, NOT false success:true+null', async () => {
    const err: any = new Error("Domain 'ZD_NOPE' not found");
    err.response = { status: 404 };
    mockDomainRead.mockRejectedValue(err);
    mockDomainReadMeta.mockRejectedValue(err);

    const result = await handleReadDomain(ctx, { domain_name: 'ZD_NOPE' });

    expect(result.isError).toBe(true);
  });

  it('ReadClass: a thrown read → isError, NOT false success', async () => {
    const err: any = new Error('Request failed with status code 500');
    err.response = { status: 500 };
    mockClassRead.mockRejectedValue(err);
    mockClassReadMeta.mockRejectedValue(err);

    const result = await handleReadClass(ctx, { class_name: 'ZCL_BOOM' });

    expect(result.isError).toBe(true);
    expect(payload(result).success).not.toBe(true);
  });
});
