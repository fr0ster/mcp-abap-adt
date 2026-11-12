/**
 * Every tool-surface fixture equals, byte for byte, what its writer would
 * write from the current registry (`helpers/fixtureRenderings.ts`):
 * `listed-schemas.json`, `variant-surface.json`, `http-surface.json` and
 * `stdio-sse-surface.json`. The committed files are the baseline: a change
 * that moves one byte of a listed schema, description or search text fails
 * here, not only where a test compares the parsed values.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, before, describe, it, mock } from 'node:test';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import {
  grouped,
  httpFixture,
  renderListedSchemas,
  renderSurface,
  searchOf,
  stdioSseFixture,
  transportSurfaces,
  variantSurface,
} from '../../helpers/fixtureRenderings';
import { repositoryRoot } from '../../helpers/repoRoot';
import { listBinaries } from '../../helpers/servedTools';

const FIXTURES = path.join(
  repositoryRoot(__dirname),
  'tests',
  'fixtures',
  'tools',
);

const committed = (name: string): string =>
  fs.readFileSync(path.join(FIXTURES, name), 'utf8');

describe('the tool-surface fixtures, byte for byte', () => {
  let standIn: AdtStandIn;
  const saved = process.env.SAP_SYSTEM_TYPE;

  before(async () => {
    mock.method(console, 'error', () => {});
    resetProcessLatchForTests();
    standIn = await adtStandIn();
  });

  after(async () => {
    await standIn?.close();
    if (saved === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = saved;
    resetProcessLatchForTests();
    mock.restoreAll();
  });

  it('listed-schemas.json', async () => {
    const listings = await listBinaries(['onprem', 'cloud', 'legacy'], standIn);
    const rendered = renderListedSchemas({
      schemas: grouped(listings, (tool) => tool.inputSchema),
      search: grouped(listings, searchOf),
    });
    assert.equal(rendered, committed('listed-schemas.json'));
  });

  it('variant-surface.json', async () => {
    const current = await variantSurface();
    assert.equal(
      `${JSON.stringify(current, null, 2)}\n`,
      committed('variant-surface.json'),
    );
  });

  it('http-surface.json and stdio-sse-surface.json', async () => {
    delete process.env.SAP_SYSTEM_TYPE;
    const { http, stdio, sse } = await transportSurfaces(standIn);
    assert.equal(
      renderSurface(httpFixture(http)),
      committed('http-surface.json'),
    );
    assert.equal(
      renderSurface(stdioSseFixture(stdio, sse)),
      committed('stdio-sse-surface.json'),
    );
  });
});
