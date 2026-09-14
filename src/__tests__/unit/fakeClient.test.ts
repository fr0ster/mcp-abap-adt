import {
  fakeClientOf,
  okResponse,
  reading,
  recordAnalyse,
  refusedResponse,
  refusingClient,
} from '../helpers/fakeClient';

describe('fakeClient helpers', () => {
  it('okResponse carries its value', () => {
    const response = okResponse({ some: 'value' });
    expect(response.ok).toBe(true);
    expect(response.getResult()).toEqual({ value: { some: 'value' } });
  });

  it('refusedResponse carries its message and origin', () => {
    const response = refusedResponse('Something went wrong');
    expect(response.ok).toBe(false);
    expect(response.getError()).toEqual({
      message: 'Something went wrong',
      origin: 'refusal',
    });
  });

  it('refusedResponse accepts extra fields', () => {
    const response = refusedResponse('Error', {
      request: 'data',
      extra: 'field',
    });
    expect(response.getError()).toEqual({
      message: 'Error',
      origin: 'refusal',
      request: 'data',
      extra: 'field',
    });
  });

  it('reading builds an object with value, raw, and status', () => {
    const result = reading({ id: 1 });
    expect(result).toEqual({
      value: { id: 1 },
      raw: '[object Object]',
      status: 200,
    });
  });

  it('reading uses custom raw and status', () => {
    const result = reading({ id: 1 }, '<xml />', 201);
    expect(result).toEqual({
      value: { id: 1 },
      raw: '<xml />',
      status: 201,
    });
  });

  it('fakeClientOf answers a named member', async () => {
    const members = {
      getDomain: async () => okResponse({ name: 'ZD' }),
    };
    const client = fakeClientOf(members);
    const factory = (client as any).getAnything;
    expect(typeof factory).toBe('function');
    const member = factory();
    const result = await member.getDomain();
    expect(result.ok).toBe(true);
    expect(result.getResult()).toEqual({ value: { name: 'ZD' } });
  });

  it('fakeClientOf falls back to undefined for unnamed members', async () => {
    const members = {
      getDomain: async () => okResponse({ name: 'ZD' }),
    };
    const client = fakeClientOf(members);
    const factory = (client as any).getSomethingElse;
    const member = factory();
    const result = await member.getTable();
    expect(result.ok).toBe(true);
    expect(result.getResult()).toEqual({ value: undefined });
  });

  it('refusingClient refuses whatever it is asked', async () => {
    const client = refusingClient('Network error', { request: 'GET /adt' });
    const factory = (client as any).getAnything;
    const member = factory();
    const result = await member.deleteClass();
    expect(result.ok).toBe(false);
    expect(result.getError()).toEqual({
      message: 'Network error',
      origin: 'refusal',
      request: 'GET /adt',
    });
  });

  it('recordAnalyse reports the analyse the caller passed', async () => {
    const seen = recordAnalyse();
    const marker = () => null;
    await (seen.client as any)
      .getDomain()
      .delete({ domainName: 'ZD' }, { analyse: marker });
    expect(seen.last).toBe(marker);
    expect(seen.countOf('delete')).toBe(1);
  });

  it('recordAnalyse reports undefined when the caller passed none', async () => {
    const seen = recordAnalyse();
    await (seen.client as any).getDomain().lock({ domainName: 'ZD' });
    expect(seen.last).toBeUndefined();
  });

  it('recordAnalyse counts multiple calls to the same member', async () => {
    const seen = recordAnalyse();
    await (seen.client as any).getDomain().lock({ domainName: 'ZD' });
    await (seen.client as any).getClass().lock({ objectName: 'ZC' });
    expect(seen.countOf('lock')).toBe(2);
  });
});
