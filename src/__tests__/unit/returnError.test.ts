import { AxiosError } from 'axios';
import { return_error } from '../../lib/utils';

const textOf = (r: any): string => r.content[0].text;

describe('return_error emits a bare message (#155)', () => {
  it('returns a string input verbatim, with no prefix', () => {
    const result = return_error('Object name is required');
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Object name is required');
  });

  it('returns an Error message with no prefix', () => {
    const result = return_error(new Error('Domain ZD_NOPE not found'));
    expect(textOf(result)).toBe('Domain ZD_NOPE not found');
  });

  it('never emits a service prefix', () => {
    for (const input of ['plain', new Error('boom'), 12345, null]) {
      expect(textOf(return_error(input))).not.toMatch(
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
    expect(textOf(return_error(err))).toContain('Resource not found');
  });

  it('keeps DNS diagnostics for ENOTFOUND', () => {
    const err = new AxiosError('getaddrinfo ENOTFOUND sap.example.com');
    (err as any).code = 'ENOTFOUND';
    const text = textOf(return_error(err));
    expect(text).toContain('DNS resolution failed');
    expect(text).toContain('sap.example.com');
  });
});
