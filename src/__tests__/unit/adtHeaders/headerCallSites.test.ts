import { join } from 'node:path';
import { headerCallSites } from '../../../../scripts/lib/headerCallSites';
import { globSync } from '../../helpers/platform';

/**
 * Every server call of a member that takes a header pair goes through the
 * one wrapper (`withAdtHeaders`), with the pair it hands: no handler sends a
 * pair of its own. The scan lives under `scripts/` (dev tooling, kept out of
 * `dist/`), as `analyseOmissions` does.
 */
const fixture = (name: string) =>
  join(
    __dirname,
    '../../../../scripts/lib/__fixtures__/headerCallSites',
    `${name}.fixture.ts`,
  );

describe('headerCallSites', () => {
  it('passes a call through the wrapper with its pair', () => {
    const { offenders, inspected } = headerCallSites([fixture('wrapped')]);
    expect(inspected).toBe(1);
    expect(offenders).toEqual([]);
  });

  it('reports a literal pair inside the wrapper', () => {
    const { offenders, inspected } = headerCallSites([fixture('literalPair')]);
    expect(inspected).toBe(1);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain('not the pair `withAdtHeaders` hands it');
  });

  it('reports a call outside the wrapper', () => {
    const { offenders, inspected } = headerCallSites([fixture('unwrapped')]);
    expect(inspected).toBe(1);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain('not the pair `withAdtHeaders` hands it');
  });

  it('reports an operation naming another member', () => {
    const { offenders } = headerCallSites([fixture('otherMember')]);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain(
      'names the operation of `getWhereUsedScope`',
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
    expect(inspected).toBeGreaterThan(200);
  });

  it('goes through withAdtHeaders with the pair it hands', () => {
    expect(offenders).toEqual([]);
  });
});
