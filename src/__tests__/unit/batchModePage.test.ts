/**
 * `docs/user-guide/BATCH_MODE.md` lists exactly the eligibility table
 * (`tools/batch-handlers.json`): the region between its markers is the
 * rendering of `renderEligibility`. A table changed without the page goes
 * red here; `WRITE_BATCH_MODE_PAGE=1 npm test -- src/__tests__/unit/batchModePage.test.ts`
 * writes the region first (refused under CI).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  PAGE_END,
  PAGE_START,
  renderEligibility,
} from '../helpers/batchModePage';

const PAGE = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  'user-guide',
  'BATCH_MODE.md',
);

function region(page: string): string {
  const start = page.indexOf(PAGE_START);
  const end = page.indexOf(PAGE_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${PAGE} holds no ${PAGE_START} … ${PAGE_END} region`);
  }
  return page.slice(start + PAGE_START.length, end).trim();
}

describe('the batch-mode page lists the eligibility table (npm test -- src/__tests__/unit/batchModePage.test.ts with WRITE_BATCH_MODE_PAGE=1 rewrites it)', () => {
  if (process.env.WRITE_BATCH_MODE_PAGE === '1') {
    if (process.env.CI) throw new Error('the page is not written under CI');
    const page = fs.readFileSync(PAGE, 'utf8');
    const start = page.indexOf(PAGE_START);
    const end = page.indexOf(PAGE_END);
    fs.writeFileSync(
      PAGE,
      `${page.slice(0, start + PAGE_START.length)}\n\n${renderEligibility()}\n${page.slice(end)}`,
    );
  }

  it('holds exactly the rendering of tools/batch-handlers.json', () => {
    expect(region(fs.readFileSync(PAGE, 'utf8'))).toBe(
      renderEligibility().trim(),
    );
  });
});
