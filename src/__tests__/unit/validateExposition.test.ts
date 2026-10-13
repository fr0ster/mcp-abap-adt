import { validateExposition } from '../../lib/config/validateExposition';

describe('validateExposition', () => {
  it('accepts default [readonly, high]', () => {
    expect(() => validateExposition(['readonly', 'high'])).not.toThrow();
  });

  it('accepts [readonly]', () => {
    expect(() => validateExposition(['readonly'])).not.toThrow();
  });

  it('accepts [high] alone', () => {
    expect(() => validateExposition(['high'])).not.toThrow();
  });

  it('accepts empty array', () => {
    expect(() => validateExposition([])).not.toThrow();
  });

  // D56: the low set left the full binaries in 19.0.0; its word stops the
  // start with the sentence, verbatim, alone or beside any other set.
  it.each([[['low']], [['readonly', 'low']], [['high', 'low']]])(
    'refuses %j with D56’s sentence',
    (exposition) => {
      expect(() => validateExposition(exposition)).toThrow(
        new Error(
          'the low set is gone from mcp-abap-adt / -http / -sse; use mcp-abap-adt-compact (or -compact-http / -compact-sse)',
        ),
      );
    },
  );

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
