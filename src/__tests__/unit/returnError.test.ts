import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AxiosError } from 'axios';
import { pageText } from '../../handlers/system/readonly/handleGetServiceBindingPreviewUrl';
import { extractAdtErrorMessage, return_error } from '../../lib/utils';

const textOf = (r: any): string => r.content[0].text;

describe('return_error emits a bare message (#155)', () => {
  it('returns a string input verbatim, with no prefix', () => {
    const result = return_error('Object name is required');
    assert.equal(result.isError, true);
    assert.equal(textOf(result), 'Object name is required');
  });

  it('returns an Error message with no prefix', () => {
    const result = return_error(new Error('Domain ZD_NOPE not found'));
    assert.equal(textOf(result), 'Domain ZD_NOPE not found');
  });

  it('never emits a service prefix', () => {
    for (const input of ['plain', new Error('boom'), 12345, null]) {
      assert.doesNotMatch(
        textOf(return_error(input)),
        /\bMcpError:\s|\bMCP error -?\d+: |(?:^|\s)(?:Error|ADT error): /,
      );
    }
  });

  it('extracts the ADT response body from an AxiosError', () => {
    const err = new AxiosError('Request failed with status code 404');
    (err as any).response = {
      status: 404,
      statusText: 'Not Found',
      data: '<exc:exception>Resource not found</exc:exception>',
    };
    assert.ok(textOf(return_error(err)).includes('Resource not found'));
  });

  // Since @mcp-abap-adt/connection 25 an HTTP failure is not the axios
  // error: an Error with SAP's answer as `response`, `status` and `code`, and
  // no `config`, `request` or `isAxiosError`.
  const connectionFailure = (
    message: string,
    facts: { code?: string; status?: number; response?: unknown },
  ): Error => Object.assign(new Error(message), facts);

  it("extracts the ADT response body from the connection's HTTP failure", () => {
    const err = connectionFailure('Request failed with status code 404', {
      code: 'ERR_BAD_REQUEST',
      status: 404,
      response: {
        status: 404,
        statusText: 'Not Found',
        headers: {},
        data: '<exc:exception>Resource not found</exc:exception>',
      },
    });
    assert.ok(textOf(return_error(err)).includes('Resource not found'));
  });

  it("says a refused connection by the connection's failure code", () => {
    const err = connectionFailure('The request failed: ECONNREFUSED', {
      code: 'ECONNREFUSED',
    });
    assert.ok(textOf(return_error(err)).includes('Connection refused'));
  });

  it('keeps DNS diagnostics for ENOTFOUND', () => {
    const err = new AxiosError('getaddrinfo ENOTFOUND sap.example.com');
    (err as any).code = 'ENOTFOUND';
    const text = textOf(return_error(err));
    assert.ok(text.includes('DNS resolution failed'));
    assert.ok(text.includes('sap.example.com'));
  });
});

// No cut of the server's (#391, the owner): SAP's text reaches the answer
// whole, however long.
describe('an error text is never truncated', () => {
  const long = `${'a'.repeat(4990)}THE_END`;

  it('return_error keeps a long SAP body whole', () => {
    const err = Object.assign(
      new Error('Request failed with status code 500'),
      {
        code: 'ERR_BAD_RESPONSE',
        status: 500,
        response: { status: 500, statusText: 'Error', headers: {}, data: long },
      },
    );
    assert.ok(textOf(return_error(err)).includes('THE_END'));
  });

  it('extractAdtErrorMessage keeps a long body whole', () => {
    assert.equal(extractAdtErrorMessage({ response: { data: long } }), long);
  });

  it("the service binding preview reads a long error page's text whole", () => {
    assert.ok(
      pageText(`<html><body>${long}</body></html>`).endsWith('THE_END'),
    );
  });
});
