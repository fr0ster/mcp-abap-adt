/**
 * Three read tools, live, read only, each against what SAP itself answers.
 *
 * - `GetWhereUsed` over stdio, on premise: a where-used list above the
 *   stdio message limit is answered an error, and the server stays up — the
 *   next call answers. The suite launches its own stdio server (the limit is
 *   the stdio transport's); the object is
 *   `whereused_readonly.test_whereused.oversized_class`, and the case skips
 *   naming it when the config states none.
 * - `GetPackageContents` with subpackages, on both systems: the shared
 *   package's super package (`shared_dependencies.super_package`; skipped
 *   when the config states none) lists each row once, and each subpackage
 *   SAP's package document names (a raw GET of the package) once.
 * - `SearchObject`, on both systems: for each mask, as many rows as SAP's
 *   quick search answers to a raw GET of the same query.
 *
 * Nothing is created, changed or deleted.
 */
import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  configuredSystemKind,
  getSharedDependenciesConfig,
  getTestCase,
  loadTestConfig,
} from '../helpers/configHelpers';
import { liveCall, liveConnection, liveSuite } from '../helpers/live';
import {
  destinationArgs,
  getHardModeConfig,
  launchStdio,
  testConnectionLogOn,
} from '../helpers/testers/hardMode';
import { member, payloadOf, succeeded } from './ownObjects';

/** The class the config names for an answer above the stdio limit, or undefined. */
function oversizedClass(): string | undefined {
  const named = member(
    getTestCase('whereused_readonly', 'test_whereused')?.params,
    'oversized_class',
  );
  return typeof named === 'string' && named !== '' ? named : undefined;
}

/** The shared package's super package, or undefined. */
function superPackage(): string | undefined {
  const named = member(getSharedDependenciesConfig(), 'super_package');
  return typeof named === 'string' && named !== ''
    ? named.toUpperCase()
    : undefined;
}

/** The body of a raw read-only GET on the live connection. */
async function rawGet(url: string, accept: string): Promise<string> {
  const response = await liveConnection().makeAdtRequest({
    url,
    method: 'GET',
    timeout: 0,
    headers: { Accept: accept },
  });
  assert.equal(response.status, 200, `GET ${url} answered ${response.status}`);
  return typeof response.data === 'string' ? response.data : '';
}

/** How many times `part` occurs in `text`. */
function occurrences(text: string, part: string): number {
  let count = 0;
  for (let at = text.indexOf(part); at !== -1; at = text.indexOf(part, at + 1))
    count += 1;
  return count;
}

/** Each `adtcore:name` inside the `pak:subPackages` element of a package document. */
function subpackagesOf(document: string): string[] {
  const start = document.indexOf('<pak:subPackages>');
  const end = document.indexOf('</pak:subPackages>');
  if (start === -1 || end === -1) return [];
  const names: string[] = [];
  const marker = 'adtcore:name="';
  const element = document.slice(start, end);
  for (
    let at = element.indexOf(marker);
    at !== -1;
    at = element.indexOf(marker, at + 1)
  ) {
    const from = at + marker.length;
    names.push(element.slice(from, element.indexOf('"', from)));
  }
  return names;
}

liveSuite(['onprem'], 'GetWhereUsed over stdio above the message limit', () => {
  it('is answered an error, and the server answers the next call', async (t) => {
    const name = oversizedClass();
    if (name === undefined) {
      t.skip(
        'the config names no whereused_readonly.test_whereused.oversized_class',
      );
      return;
    }
    const kind = configuredSystemKind();
    assert.ok(kind !== undefined, 'the config states no system kind');
    const server = await launchStdio({
      set: 'full',
      kind,
      args: destinationArgs(getHardModeConfig(), loadTestConfig()),
      logOn: testConnectionLogOn,
    });
    try {
      await assert.rejects(
        server.call('GetWhereUsed', {
          object_name: name,
          object_type: 'CLAS/OC',
          background: false,
        }),
        (error: unknown) =>
          error instanceof Error &&
          error.message.includes('bytes a stdio client reads as one message'),
      );
      const next = await server.call('SearchObject', {
        object_name: name,
        maxResults: 1,
      });
      assert.equal(next.isError, false, JSON.stringify(next).slice(0, 2000));
    } finally {
      await server.close();
    }
  });
});

liveSuite(
  ['onprem', 'cloud'],
  'GetPackageContents with subpackages lists each once',
  () => {
    it('each row once, each subpackage SAP names once', async (t) => {
      const pkg = superPackage();
      if (pkg === undefined) {
        t.skip('the config names no shared_dependencies.super_package');
        return;
      }
      const answer = await liveCall('GetPackageContents', {
        package_name: pkg,
        include_subpackages: true,
        background: false,
      });
      const rows = payloadOf(succeeded('GetPackageContents', answer));
      assert.ok(Array.isArray(rows), answer.text.slice(0, 2000));
      const keys = rows.map(
        (row) =>
          `${String(member(row, 'type'))} ${String(member(row, 'name'))} in ${String(member(row, 'packageName'))}`,
      );
      assert.deepEqual(
        keys.filter((key, i) => keys.indexOf(key) !== i),
        [],
        'rows listed more than once',
      );
      const document = await rawGet(
        `/sap/bc/adt/packages/${encodeURIComponent(pkg.toLowerCase())}`,
        'application/vnd.sap.adt.packages.v2+xml',
      );
      for (const sub of subpackagesOf(document)) {
        assert.equal(
          keys.filter((key) => key === `DEVC/K ${sub} in ${pkg}`).length,
          1,
          `subpackage ${sub} of ${pkg}`,
        );
      }
    });
  },
);

liveSuite(['onprem', 'cloud'], 'SearchObject answers every hit', () => {
  for (const mask of ['CL_ABAP_UNIT*', 'CL_ABAP_U*']) {
    it(`${mask}: as many rows as SAP's quick search answers`, async () => {
      const raw = await rawGet(
        `/sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=${encodeURIComponent(mask)}&maxResults=100`,
        'application/xml',
      );
      const answered = occurrences(raw, '<adtcore:objectReference ');
      const answer = await liveCall('SearchObject', {
        object_name: mask,
        maxResults: 100,
        background: false,
      });
      succeeded('SearchObject', answer);
      const rows = answer.text
        .split('\n')
        .filter((line) => line !== '' && !line.startsWith('name\t'));
      assert.equal(rows.length, answered, answer.text.slice(0, 2000));
    });
  }
});
