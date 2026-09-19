import type { IAdtError } from '@mcp-abap-adt/interfaces';
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
    if (!response.ok) throw new Error('expected the success');
    expect(response.getResult()).toEqual({ value: { some: 'value' } });
  });

  it('okResponse throws when asked for the error', () => {
    const response = okResponse('success');
    // `getError` is not on `IAdtSuccess`'s contract at all — narrowing on
    // `.ok` can only ever land in the success branch here, which has no
    // `getError` to call. The double still carries one (a defensive throw),
    // so narrow on ITS presence instead: `in` narrows to the union member
    // that declares the property, which for `getError` is `IAdtFailure`.
    if (!('getError' in response)) {
      throw new Error('expected the double to carry getError');
    }
    expect(() => response.getError()).toThrow(
      'asked for the error of a success',
    );
  });

  it('refusedResponse carries its message and origin', () => {
    const response = refusedResponse('Something went wrong');
    expect(response.ok).toBe(false);
    if (response.ok) throw new Error('expected the refusal');
    expect(response.getError()).toEqual({
      message: 'Something went wrong',
      origin: 'refusal',
    });
  });

  it('refusedResponse throws when asked for the result', () => {
    const response = refusedResponse('failure');
    // Same shape as the `getError`-on-success case above, mirrored: `getResult`
    // is not on `IAdtFailure`'s contract, so narrow on the double actually
    // carrying it rather than on `.ok`.
    if (!('getResult' in response)) {
      throw new Error('expected the double to carry getResult');
    }
    expect(() => response.getResult()).toThrow(
      'asked for the result of a failure',
    );
  });

  it('refusedResponse accepts extra fields', () => {
    const response = refusedResponse('Error', {
      request: { method: 'GET', url: '/data' },
      // Wider than `Partial<IAdtError>` on purpose: the point of the test is
      // that `extra` spreads through untouched, and an object literal cannot
      // carry an unknown field into that parameter without saying so.
      extra: 'field',
    } as Partial<IAdtError>);
    expect(response.ok).toBe(false);
    if (response.ok) throw new Error('expected the refusal');
    expect(response.getError()).toEqual({
      message: 'Error',
      origin: 'refusal',
      request: { method: 'GET', url: '/data' },
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
    const client = refusingClient('Network error', {
      request: { method: 'GET', url: '/adt' },
    });
    const factory = (client as any).getAnything;
    const member = factory();
    const result = await member.deleteClass();
    expect(result.ok).toBe(false);
    expect(result.getError()).toEqual({
      message: 'Network error',
      origin: 'refusal',
      request: { method: 'GET', url: '/adt' },
    });
  });

  it('records a call with no options as carriedAnalyse: false', async () => {
    const seen = recordAnalyse();
    await (seen.client as any).getDomain().lock({ domainName: 'ZD' });
    expect(seen.last?.analyse).toBeUndefined();
    expect(seen.last?.carriedAnalyse).toBe(false);
  });

  it('records a call with empty options as carriedAnalyse: false', async () => {
    const seen = recordAnalyse();
    await (seen.client as any).getDomain().lock({ domainName: 'ZD' }, {});
    expect(seen.last?.analyse).toBeUndefined();
    expect(seen.last?.carriedAnalyse).toBe(false);
  });

  it('records a call with { analyse: undefined } as carriedAnalyse: true', async () => {
    const seen = recordAnalyse();
    await (seen.client as any)
      .getDomain()
      .lock({ domainName: 'ZD' }, { analyse: undefined });
    expect(seen.last?.analyse).toBeUndefined();
    expect(seen.last?.carriedAnalyse).toBe(true);
  });

  it('distinguishes no options from options with analyse: undefined', async () => {
    const seen = recordAnalyse();

    // First call: no options object at all
    await (seen.client as any).getDomain().lock({ domainName: 'ZD' });
    const noOptions = seen.calls[0];
    expect(noOptions.analyse).toBeUndefined();
    expect(noOptions.carriedAnalyse).toBe(false);

    // Second call: options object with analyse: undefined
    await (seen.client as any)
      .getDomain()
      .lock({ domainName: 'ZD' }, { analyse: undefined });
    const withUndefined = seen.calls[1];
    expect(withUndefined.analyse).toBeUndefined();
    expect(withUndefined.carriedAnalyse).toBe(true);

    // Both have undefined analyse but different carriedAnalyse
    expect(noOptions.carriedAnalyse).not.toBe(withUndefined.carriedAnalyse);
  });

  it('records options as only argument with analyse correctly', async () => {
    const seen = recordAnalyse();
    const marker = () => null;
    // This mimics the list member pattern: options as the sole argument
    await (seen.client as any).getTransport().list({ analyse: marker });
    expect(seen.last?.analyse).toBe(marker);
    expect(seen.last?.carriedAnalyse).toBe(true);
  });

  it('records a call with analyse in a multi-argument context', async () => {
    const seen = recordAnalyse();
    const marker = () => null;
    await (seen.client as any)
      .getDomain()
      .delete({ domainName: 'ZD' }, { analyse: marker });
    expect(seen.last?.analyse).toBe(marker);
    expect(seen.last?.carriedAnalyse).toBe(true);
    expect(seen.countOf('delete')).toBe(1);
  });

  it('recordAnalyse counts multiple calls to the same member', async () => {
    const seen = recordAnalyse();
    await (seen.client as any).getDomain().lock({ domainName: 'ZD' });
    await (seen.client as any).getClass().lock({ objectName: 'ZC' });
    expect(seen.countOf('lock')).toBe(2);
  });
});
