import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { headerCallSites } from '../../../../scripts/lib/headerCallSites';
import { globSync } from '../../helpers/platform';
import { repositoryRoot } from '../../helpers/repoRoot';
import { assertEquals } from '../../integration/helpers/liveAssert';

/**
 * Every server call of a member that takes a header pair goes through the
 * one wrapper (`withAdtHeaders`), with the pair it hands: no handler sends a
 * pair of its own. The scan lives under `scripts/` (dev tooling, kept out of
 * `dist/`), as `analyseOmissions` does.
 */
const fixture = (name: string) =>
  join(
    repositoryRoot(__dirname),
    'scripts/lib/__fixtures__/headerCallSites',
    `${name}.fixture.ts`,
  );

describe('headerCallSites', () => {
  it('passes a call through the wrapper with its pair', () => {
    const { offenders, inspected } = headerCallSites([fixture('wrapped')]);
    assert.equal(inspected, 1);
    assertEquals(offenders, []);
  });

  it('reports a literal pair inside the wrapper', () => {
    const { offenders, inspected } = headerCallSites([fixture('literalPair')]);
    assert.equal(inspected, 1);
    assert.equal(offenders.length, 1);
    assert.ok(offenders[0].includes('not the pair `withAdtHeaders` hands it'));
  });

  it('reports a call outside the wrapper', () => {
    const { offenders, inspected } = headerCallSites([fixture('unwrapped')]);
    assert.equal(inspected, 1);
    assert.equal(offenders.length, 1);
    assert.ok(offenders[0].includes('not the pair `withAdtHeaders` hands it'));
  });

  it('reports an operation naming another member', () => {
    const { offenders } = headerCallSites([fixture('otherMember')]);
    assert.equal(offenders.length, 1);
    assert.ok(
      offenders[0].includes('names the operation of `getWhereUsedScope`'),
    );
  });
});

describe('every server call of a header-taking member', () => {
  const files = globSync('src/**/*.ts').filter(
    (file) => !file.includes('__tests__'),
  );
  const { offenders, inspected } = headerCallSites(files);

  it('was found: the scan resolved the members', () => {
    // 200-odd call sites across the handlers and lib; a run that resolved
    // nothing would find none and pass.
    assert.ok(inspected > 200);
  });

  it('goes through withAdtHeaders with the pair it hands', () => {
    assertEquals(offenders, []);
  });
});
