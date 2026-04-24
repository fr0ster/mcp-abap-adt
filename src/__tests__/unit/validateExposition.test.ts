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

  it('accepts [compact] alone', () => {
    expect(() => validateExposition(['compact'])).not.toThrow();
  });

  it('accepts empty array', () => {
    expect(() => validateExposition([])).not.toThrow();
  });

  it('rejects high + low as mutually exclusive', () => {
    expect(() => validateExposition(['high', 'low'])).toThrow(
      /mutually exclusive/i,
    );
  });

  it('rejects compact combined with readonly', () => {
    expect(() => validateExposition(['compact', 'readonly'])).toThrow(/alone/i);
  });

  it('rejects compact combined with high', () => {
    expect(() => validateExposition(['compact', 'high'])).toThrow(/alone/i);
  });

  it('rejects compact combined with low', () => {
    expect(() => validateExposition(['compact', 'low'])).toThrow(/alone/i);
  });
});
