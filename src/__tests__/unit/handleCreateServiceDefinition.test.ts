/**
 * Unit test: CreateServiceDefinition writes the source body.
 * Regression guard — the create() POST only registers the shell (metadata),
 * so the handler must run a follow-up update() to persist the
 * `define service … { … }` source; otherwise the object is created empty.
 * SAP-free via a mocked AdtClient.
 */

const mockValidate = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockActivate = jest.fn();

jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getServiceDefinition: () => ({
      validate: mockValidate,
      create: mockCreate,
      update: mockUpdate,
      activate: mockActivate,
    }),
  }),
}));

import { handleCreateServiceDefinition } from '../../handlers/service_definition/high/handleCreateServiceDefinition';

const ctx = { connection: {}, logger: undefined } as any;

describe('CreateServiceDefinition — source body is written (regression)', () => {
  beforeEach(() => {
    for (const m of [mockValidate, mockCreate, mockUpdate, mockActivate]) {
      m.mockReset();
    }
    mockValidate.mockResolvedValue({});
    mockCreate.mockResolvedValue({ createResult: { status: 201 } });
    mockUpdate.mockResolvedValue({ updateResult: { status: 200 } });
    mockActivate.mockResolvedValue({ activateResult: { data: '' } });
  });

  it('calls update() with the source_code after create()', async () => {
    const src = 'define service ZSD provider contracts { expose zi_x; }';
    const result = await handleCreateServiceDefinition(ctx, {
      service_definition_name: 'zsd',
      package_name: '$TMP',
      source_code: src,
      activate: false,
    } as any);

    expect((result as any).isError).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      serviceDefinitionName: 'ZSD',
      sourceCode: src,
      transportRequest: undefined,
    });
  });

  it('does not call update() when no source_code is given', async () => {
    await handleCreateServiceDefinition(ctx, {
      service_definition_name: 'zsd',
      package_name: '$TMP',
      activate: false,
    } as any);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
