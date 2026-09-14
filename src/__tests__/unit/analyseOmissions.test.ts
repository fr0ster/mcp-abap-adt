import { join } from 'node:path';
import { analyseOmissions } from '../../../scripts/lib/analyseOmissions';

/**
 * `analyseOmissions` lives under `scripts/`, not `src/` — it is dev tooling,
 * not shipped code, and moving it out of `src/` keeps it (and its
 * `typescript` dependency, a devDependency) out of `dist/` and the published
 * tarball. Jest's `roots` is `<rootDir>/src`, so the test stays here where
 * jest discovers it; the module it imports does not.
 */
const fixture = (name: string) =>
  join(
    __dirname,
    '../../../scripts/lib/__fixtures__/analyseOmissions',
    `${name}.fixture.ts`,
  );

describe('analyseOmissions', () => {
  it('reports a call that omits options entirely as an offender', () => {
    const { offenders, inspected } = analyseOmissions([
      fixture('omitsOptions'),
    ]);
    expect(inspected).toBe(1);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain('no analyse passed');
  });

  it('inspects a call passing { analyse: undefined } and answers no', () => {
    const { offenders, inspected } = analyseOmissions([
      fixture('passesUndefined'),
    ]);
    expect(inspected).toBe(1);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain('no analyse passed');
  });

  it('answers unknown, not no, when options come from a function return', () => {
    const { offenders, inspected } = analyseOmissions([
      fixture('fromFunctionReturn'),
    ]);
    expect(inspected).toBe(1);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain('not provable from the source; inline it');
  });

  it('does not flag a call that actually carries analyse', () => {
    const { offenders, inspected } = analyseOmissions([
      fixture('carriesAnalyse'),
    ]);
    expect(inspected).toBe(1);
    expect(offenders).toHaveLength(0);
  });
});
