import { validateExposition } from '../../lib/config/validateExposition';

describe('validateExposition', () => {
  it('accepts default [readonly, high]', () => {
    expect(() => validateExposition(['readonly', 'high'])).not.toThrow();
  });

  it('accepts [readonly, low]', () => {
    expect(() => validateExposition(['readonly', 'low'])).not.toThrow();
  });

  it('accepts [readonly]', () => {
    expect(() => validateExposition(['readonly'])).not.toThrow();
  });

  it('accepts [high] alone', () => {
    expect(() => validateExposition(['high'])).not.toThrow();
  });

  it('accepts [low] alone', () => {
    expect(() => validateExposition(['low'])).not.toThrow();
  });

  it('accepts empty array', () => {
    expect(() => validateExposition([])).not.toThrow();
  });

  it('rejects high + low as mutually exclusive', () => {
    expect(() => validateExposition(['high', 'low'])).toThrow(
      /mutually exclusive/i,
    );
  });

  // `compact` is not served from here any more: the facade is
  // `@mcp-abap-adt/compact`, its own command. The value is still recognised, and
  // refused with that pointer — a configuration asking for a tool list it will not
  // get should fail at startup rather than start with tools missing.
  it.each([
    ['compact'],
    ['compact', 'readonly'],
    ['compact', 'high'],
    ['compact', 'low'],
  ])('refuses %j and names the package that serves it', (...exposition) => {
    expect(() => validateExposition(exposition as never)).toThrow(
      /@mcp-abap-adt\/compact/,
    );
  });
});
