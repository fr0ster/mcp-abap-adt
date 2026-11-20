import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import { assertThrows } from '../helpers/assertions';
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
    assert.equal(response.ok, true);
    if (!response.ok) throw new Error('expected the success');
    assert.deepStrictEqual(response.getResult(), { value: { some: 'value' } });
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
    assertThrows(() => response.getError(), 'asked for the error of a success');
  });

  it('refusedResponse carries its message and origin', () => {
    const response = refusedResponse('Something went wrong');
    assert.equal(response.ok, false);
    if (response.ok) throw new Error('expected the refusal');
    assert.deepStrictEqual(response.getError(), {
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
    assertThrows(
      () => response.getResult(),
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
    assert.equal(response.ok, false);
    if (response.ok) throw new Error('expected the refusal');
    assert.deepStrictEqual(response.getError(), {
      message: 'Error',
      origin: 'refusal',
      request: { method: 'GET', url: '/data' },
      extra: 'field',
    });
  });

  it('reading builds an object with value, raw, and status', () => {
    const result = reading({ id: 1 });
    assert.deepStrictEqual(result, {
      value: { id: 1 },
      raw: '[object Object]',
      status: 200,
    });
  });

  it('reading uses custom raw and status', () => {
    const result = reading({ id: 1 }, '<xml />', 201);
    assert.deepStrictEqual(result, {
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
    assert.equal(typeof factory, 'function');
    const member = factory();
    const result = await member.getDomain();
    assert.equal(result.ok, true);
    assert.deepStrictEqual(result.getResult(), { value: { name: 'ZD' } });
  });

  it('fakeClientOf falls back to an empty reading for unnamed members', async () => {
    const members = {
      getDomain: async () => okResponse({ name: 'ZD' }),
    };
    const client = fakeClientOf(members);
    const factory = (client as any).getSomethingElse;
    const member = factory();
    const result = await member.getTable();
    assert.equal(result.ok, true);
    assert.deepStrictEqual(result.getResult(), {
      value: reading(undefined, '', 200),
    });
  });

  it('refusingClient refuses whatever it is asked', async () => {
    const client = refusingClient('Network error', {
      request: { method: 'GET', url: '/adt' },
    });
    const factory = (client as any).getAnything;
    const member = factory();
    const result = await member.deleteClass();
    assert.equal(result.ok, false);
    assert.deepStrictEqual(result.getError(), {
      message: 'Network error',
      origin: 'refusal',
      request: { method: 'GET', url: '/adt' },
    });
  });

  it('records a call with no options as carriedAnalyse: false', async () => {
    const seen = recordAnalyse();
    await (seen.client as any).getDomain().lock({ domainName: 'ZD' });
    assert.equal(seen.last?.analyse, undefined);
    assert.equal(seen.last?.carriedAnalyse, false);
  });

  it('records a call with empty options as carriedAnalyse: false', async () => {
    const seen = recordAnalyse();
    await (seen.client as any).getDomain().lock({ domainName: 'ZD' }, {});
    assert.equal(seen.last?.analyse, undefined);
    assert.equal(seen.last?.carriedAnalyse, false);
  });

  it('records a call with { analyse: undefined } as carriedAnalyse: true', async () => {
    const seen = recordAnalyse();
    await (seen.client as any)
      .getDomain()
      .lock({ domainName: 'ZD' }, { analyse: undefined });
    assert.equal(seen.last?.analyse, undefined);
    assert.equal(seen.last?.carriedAnalyse, true);
  });

  it('distinguishes no options from options with analyse: undefined', async () => {
    const seen = recordAnalyse();

    // First call: no options object at all
    await (seen.client as any).getDomain().lock({ domainName: 'ZD' });
    const noOptions = seen.calls[0];
    assert.equal(noOptions.analyse, undefined);
    assert.equal(noOptions.carriedAnalyse, false);

    // Second call: options object with analyse: undefined
    await (seen.client as any)
      .getDomain()
      .lock({ domainName: 'ZD' }, { analyse: undefined });
    const withUndefined = seen.calls[1];
    assert.equal(withUndefined.analyse, undefined);
    assert.equal(withUndefined.carriedAnalyse, true);

    // Both have undefined analyse but different carriedAnalyse
    assert.notEqual(noOptions.carriedAnalyse, withUndefined.carriedAnalyse);
  });

  it('records options as only argument with analyse correctly', async () => {
    const seen = recordAnalyse();
    const marker = () => null;
    // This mimics the list member pattern: options as the sole argument
    await (seen.client as any).getTransport().list({ analyse: marker });
    assert.equal(seen.last?.analyse, marker);
    assert.equal(seen.last?.carriedAnalyse, true);
  });

  it('records a call with analyse in a multi-argument context', async () => {
    const seen = recordAnalyse();
    const marker = () => null;
    await (seen.client as any)
      .getDomain()
      .delete({ domainName: 'ZD' }, { analyse: marker });
    assert.equal(seen.last?.analyse, marker);
    assert.equal(seen.last?.carriedAnalyse, true);
    assert.equal(seen.countOf('delete'), 1);
  });

  it('recordAnalyse counts multiple calls to the same member', async () => {
    const seen = recordAnalyse();
    await (seen.client as any).getDomain().lock({ domainName: 'ZD' });
    await (seen.client as any).getClass().lock({ objectName: 'ZC' });
    assert.equal(seen.countOf('lock'), 2);
  });
});
