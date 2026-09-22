import { spawnSync } from 'node:child_process';
import { basename, join } from 'node:path';
import { analyseOmissions } from '../../../scripts/lib/analyseOmissions';
import { globSync, spawnOptionsForNpx } from '../helpers/platform';

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

/**
 * The controls, as files rather than a ritual.
 *
 * Every verdict `carriesAnalyse` reaches has been wrong at least once — it
 * read only inline literals, then only types, then left to right, then
 * ignored `undefined`, then followed a `let`. Each fix was checked by hand
 * with a `sed` and a revert; none of them was protected until now. One tiny
 * module per case, under `src/__tests__/fixtures/analyse/`, named for the
 * verdict it must produce — the name is itself part of the assertion below.
 * They import the real `@mcp-abap-adt/adt-clients` type so the checker
 * resolves real signatures, not a hand-rolled stand-in.
 */
describe('analyseOmissions — the twelve verdict fixtures', () => {
  const fixtures = globSync('src/__tests__/fixtures/analyse/*.ts');

  it('has a fixture for every verdict, and finds them all', () => {
    // A glob that matched nothing would make every assertion below vacuous.
    expect(fixtures).toHaveLength(12);
  });

  it('inspects nothing when given nothing, and the script turns that into a failure', () => {
    // The module reports the fact; the script decides it is a failure. Both
    // halves are asserted, because the module answering `inspected: 0` is
    // correct and the script exiting 0 on it would not be.
    expect(analyseOmissions([])).toEqual({ offenders: [], inspected: 0 });

    const run = (pattern: string) =>
      spawnSync('npx', ['tsx', 'scripts/check-analyse.ts', pattern], {
        ...spawnOptionsForNpx,
        encoding: 'utf8',
      });

    const noMatch = run('src/handlers/**/handleNoSuchThing*.ts');
    expect(noMatch.status).toBe(2);
    expect(noMatch.stderr).toContain('no files matched');

    const noCalls = run('src/__tests__/fixtures/analyse/../../helpers/*.ts');
    expect(noCalls.status).toBe(2);
    expect(noCalls.stderr).toContain('no call accepted an analyse');
  }, 20000);

  it.each(fixtures)('%s produces the verdict its name claims', (file) => {
    const expected = basename(file).split('-')[0]; // yes | no | unknown
    const { offenders, inspected } = analyseOmissions([file]);
    expect(inspected).toBe(1);
    if (expected === 'yes') {
      expect(offenders).toEqual([]);
      return;
    }
    expect(offenders).toHaveLength(1);
    // The two failures are reported differently on purpose: one says a
    // strategy is missing, the other says it cannot be proved from the
    // source. A change that collapses them loses the instruction to the
    // author.
    expect(offenders[0]).toContain(
      expected === 'no' ? 'no analyse passed' : 'not provable from the source',
    );
  });
});
