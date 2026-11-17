import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { basename, join } from 'node:path';
import { describe, it } from 'node:test';
import { analyseOmissions } from '../../../scripts/lib/analyseOmissions';
import { globSync, tsxCommand } from '../helpers/platform';
import { repositoryRoot } from '../helpers/repoRoot';
import { assertEquals } from '../integration/helpers/liveAssert';

/**
 * `analyseOmissions` lives under `scripts/`, not `src/` — it is dev tooling,
 * not shipped code, and moving it out of `src/` keeps it (and its
 * `typescript` dependency, a devDependency) out of `dist/` and the published
 * tarball. The test stays under `src/__tests__`, where the test build
 * finds it; the module it imports does not.
 */
const fixture = (name: string) =>
  join(
    repositoryRoot(__dirname),
    'scripts/lib/__fixtures__/analyseOmissions',
    `${name}.fixture.ts`,
  );

describe('analyseOmissions', () => {
  it('reports a call that omits options entirely as an offender', () => {
    const { offenders, inspected } = analyseOmissions([
      fixture('omitsOptions'),
    ]);
    assert.equal(inspected, 1);
    assert.equal(offenders.length, 1);
    assert.ok(offenders[0].includes('no analyse passed'));
  });

  it('inspects a call passing { analyse: undefined } and answers no', () => {
    const { offenders, inspected } = analyseOmissions([
      fixture('passesUndefined'),
    ]);
    assert.equal(inspected, 1);
    assert.equal(offenders.length, 1);
    assert.ok(offenders[0].includes('no analyse passed'));
  });

  it('answers unknown, not no, when options come from a function return', () => {
    const { offenders, inspected } = analyseOmissions([
      fixture('fromFunctionReturn'),
    ]);
    assert.equal(inspected, 1);
    assert.equal(offenders.length, 1);
    assert.ok(offenders[0].includes('not provable from the source; inline it'));
  });

  it('does not flag a call that actually carries analyse', () => {
    const { offenders, inspected } = analyseOmissions([
      fixture('carriesAnalyse'),
    ]);
    assert.equal(inspected, 1);
    assert.equal(offenders.length, 0);
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
    assert.equal(fixtures.length, 12);
  });

  it('inspects nothing when given nothing, and the script turns that into a failure', () => {
    // The module reports the fact; the script decides it is a failure. Both
    // halves are asserted, because the module answering `inspected: 0` is
    // correct and the script exiting 0 on it would not be.
    assertEquals(analyseOmissions([]), { offenders: [], inspected: 0 });

    const run = (pattern: string) =>
      spawnSync(...tsxCommand(['scripts/check-analyse.ts', pattern]), {
        encoding: 'utf8',
      });

    const noMatch = run('src/handlers/**/handleNoSuchThing*.ts');
    assert.equal(noMatch.status, 2);
    assert.ok(noMatch.stderr.includes('no files matched'));

    const noCalls = run('src/__tests__/fixtures/analyse/../../helpers/*.ts');
    assert.equal(noCalls.status, 2);
    assert.ok(noCalls.stderr.includes('no call accepted an analyse'));
  });

  for (const file of fixtures) {
    it(`${file} produces the verdict its name claims`, () => {
      const expected = basename(file).split('-')[0]; // yes | no | unknown
      const { offenders, inspected } = analyseOmissions([file]);
      assert.equal(inspected, 1);
      if (expected === 'yes') {
        assertEquals(offenders, []);
        return;
      }
      assert.equal(offenders.length, 1);
      // The two failures are reported differently on purpose: one says a
      // strategy is missing, the other says it cannot be proved from the
      // source. A change that collapses them loses the instruction to the
      // author.
      assert.ok(
        offenders[0].includes(
          expected === 'no'
            ? 'no analyse passed'
            : 'not provable from the source',
        ),
      );
    });
  }
});
