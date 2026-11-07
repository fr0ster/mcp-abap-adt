/**
 * `SearchSource`, live (plan D23b, Step 7): what the search answers on the
 * systems, read-only.
 *
 * - **Package masks, on premise:** a mask with several `*`, a `*` that
 *   matches zero characters, a `?` and an exact name with a literal `_`.
 *   Each walks exactly the packages the quick search
 *   names for it: `SearchObject` over `DEVC` is read first, then the search
 *   runs without subpackages and with an object filter no object matches,
 *   so only the packages are walked and `scanned.packages` is their count.
 *   A mask past 1000 packages is not among them: walking the 1140 packages
 *   such a mask names on premise took longer than a test may run (more than
 *   600 s, measured), so the doubling is pinned, not run live here.
 * - **A known hit, on both systems:** the shared function module the test
 *   config names, searched by its own name — on premise in the shared
 *   package, on ABAP Cloud in the configured build package (its tree holds
 *   the shared package). The answer carries no `no_hits` and no `failures`;
 *   `scanned.objects_with_hits` is the number of objects in `results`; the
 *   module's hit names the module and its group, and `GetFunctionModule`
 *   reads that line with exactly those fields. A package that does not
 *   exist is skipped and not counted; the three `answer` levels have their
 *   shapes; `max_hits` stops the scan with `truncated.by_max_hits`.
 * - **Measurements, on both systems (their shape only, the values logged):**
 *   what a SAP `404` on a source read is through adt-clients (`origin`, the
 *   response's status, `adtType`), and the function modules named `VIEW*`
 *   (D23a Step 2): what the quick search lists and what reading one answers.
 *
 * Nothing is created, changed or deleted.
 */

import { randomBytes } from 'node:crypto';
import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { createAdtClient } from '../../../lib/clients';
import { getTestDestination } from '../helpers/authHelpers';
import {
  configuredSystemKind,
  getSharedDependenciesConfig,
  getTestCaseDefinition,
  resolvePackageName,
} from '../helpers/configHelpers';
import {
  type LiveAnswer,
  liveCall,
  livePrepare,
  liveSuite,
} from '../helpers/live';
import { endTestConnection, trackConnection } from '../helpers/openConnections';
import { primeSystemContext } from '../helpers/primeSystemContext';
import {
  type GuardedConnection,
  guardedTestConnection,
} from '../helpers/refusalGuard';

// ---------------------------------------------------------------------------
// What the config names

/** A member of a JSON value, read by shape. */
function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

/** A text the config states, or the case fails naming it. */
function stated(value: unknown, what: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`the test config names no ${what}`);
  }
  return value;
}

/** The shared package: where the shared objects live. */
function sharedPackage(): string {
  return stated(getSharedDependenciesConfig()?.package, 'shared package');
}

/** The shared function group: the one its module-list read case names. */
function sharedGroup(): string {
  return stated(
    member(
      member(
        getTestCaseDefinition('list_function_modules_readonly', 'list_modules'),
        'params',
      ),
      'function_group_name',
    ),
    'shared function group',
  );
}

/** The shared function module: the config's module of the shared group. */
function sharedModule(): string {
  const group = sharedGroup();
  const modules: unknown = getSharedDependenciesConfig()?.function_modules;
  const found = Array.isArray(modules)
    ? modules.find((each) => member(each, 'group') === group)
    : undefined;
  return stated(member(found, 'name'), `function module of ${group}`);
}

/** Where the known hit is searched: the shared package on premise, the build package on ABAP Cloud. */
function hitPackage(): string {
  return configuredSystemKind() === 'cloud'
    ? resolvePackageName()
    : sharedPackage();
}

/** A name no package or object carries. */
const MISSING = `ZMCP_NX_${randomBytes(3).toString('hex').toUpperCase()}`;

// ---------------------------------------------------------------------------
// Answers

/** The answer's JSON, or the case fails naming the step and what was answered. */
function payloadOf(step: string, answer: LiveAnswer): unknown {
  if (answer.isError) throw new Error(`${step}: ${answer.text}`);
  return JSON.parse(answer.text);
}

/** A list member of a JSON value; the case fails when it is none. */
function listOf(value: unknown, key: string): unknown[] {
  const list = member(value, key);
  if (!Array.isArray(list)) {
    throw new Error(`no ${key} list: ${JSON.stringify(value)}`);
  }
  return list;
}

/** A counter of the answer's `scanned`. */
function scanned(payload: unknown, counter: string): unknown {
  return member(member(payload, 'scanned'), counter);
}

/** The packages the quick search names for `mask` (`SearchObject` over `DEVC`). */
async function quickSearchPackages(mask: string): Promise<string[]> {
  const answer = await livePrepare('SearchObject', {
    object_name: mask,
    object_type: 'DEVC',
    maxResults: 100000,
  });
  if (answer.isError) throw new Error(`SearchObject ${mask}: ${answer.text}`);
  // Terse: a header line, then name, type, description and package per hit.
  return answer.text
    .split('\n')
    .slice(1)
    .map((line) => line.split('\t'))
    .filter((cells) => cells[1]?.startsWith('DEVC') === true)
    .map((cells) => cells[0] ?? '');
}

/** The search answer walked the packages `named` and read no object. */
function expectWalked(payload: unknown, named: readonly string[]): void {
  expect({
    packages: scanned(payload, 'packages'),
    objects: scanned(payload, 'objects'),
    results: listOf(payload, 'results').length,
  }).toEqual({ packages: named.length, objects: 0, results: 0 });
}

/** The distinct objects of hits: a module and its group count apart. */
function objectsOf(results: readonly unknown[]): number {
  return new Set(
    results.map(
      (hit) => `${member(hit, 'object_type')} ${member(hit, 'object_name')}`,
    ),
  ).size;
}

/** The shared module's hit among `results`; the case fails when there is none. */
function moduleHit(results: readonly unknown[]): unknown {
  const found = results.find(
    (hit) =>
      member(hit, 'object_type') === 'FUGR/FF' &&
      member(hit, 'object_name') === sharedModule(),
  );
  if (found === undefined) {
    throw new Error(
      `no hit in ${sharedModule()}: ${JSON.stringify(results.slice(0, 20))}`,
    );
  }
  return found;
}

/** No `no_hits` and no `failures` key: hits and counters only. */
function expectHitsOnly(payload: unknown): void {
  expect({
    no_hits: member(payload, 'no_hits'),
    failures: member(payload, 'failures'),
  }).toEqual({ no_hits: undefined, failures: undefined });
}

/** An object filter no object matches: the walk reads no object. */
const NO_OBJECT = `ZZMCP_NO_OBJECT_${randomBytes(3).toString('hex').toUpperCase()}`;

// ---------------------------------------------------------------------------
// The cases

liveSuite(['onprem'], 'SearchSource package masks', () => {
  it('a mask with several * walks the packages the quick search names', async () => {
    const shared = sharedPackage();
    const mask = `*${shared.slice(1, 4)}*${shared.slice(-3)}*`;
    const named = await quickSearchPackages(mask);
    expect(named.length).toBeGreaterThan(1);
    const answer = await liveCall('SearchSource', {
      packages: [mask],
      include_subpackages: false,
      object_filter: NO_OBJECT,
      query: 'FUNCTION',
    });
    expectWalked(payloadOf('SearchSource', answer), named);
  });

  it('a * matching zero characters walks the package of exactly that name', async () => {
    const mask = `${sharedPackage()}*`;
    const named = await quickSearchPackages(mask);
    expect(named).toContain(sharedPackage());
    const answer = await liveCall('SearchSource', {
      packages: [mask],
      include_subpackages: false,
      object_filter: NO_OBJECT,
      query: 'FUNCTION',
    });
    expectWalked(payloadOf('SearchSource', answer), named);
  });

  it('a mask with ? walks the packages the quick search names', async () => {
    const mask = `${sharedPackage().slice(0, -1)}?`;
    const named = await quickSearchPackages(mask);
    expect(named).toContain(sharedPackage());
    const answer = await liveCall('SearchSource', {
      packages: [mask],
      include_subpackages: false,
      object_filter: NO_OBJECT,
      query: 'FUNCTION',
    });
    expectWalked(payloadOf('SearchSource', answer), named);
  });

  it('an exact name with a literal _ walks that package alone', async () => {
    const exact = sharedPackage();
    expect(exact).toContain('_');
    const named = await quickSearchPackages(exact);
    expect(named).toEqual([exact]);
    const answer = await liveCall('SearchSource', {
      packages: [exact],
      include_subpackages: false,
      object_filter: NO_OBJECT,
      query: 'FUNCTION',
    });
    expectWalked(payloadOf('SearchSource', answer), named);
  });
});

liveSuite(['onprem', 'cloud'], 'SearchSource finds a known hit', () => {
  it('the shared function module is a hit of its own, read back with GetFunctionModule', async () => {
    const answer = await liveCall('SearchSource', {
      packages: [hitPackage()],
      object_types: ['FUGR'],
      query: sharedModule(),
    });
    const payload = payloadOf('SearchSource', answer);
    expectHitsOnly(payload);
    const results = listOf(payload, 'results');
    expect(scanned(payload, 'objects_with_hits')).toBe(objectsOf(results));
    const hit = moduleHit(results);
    expect({
      function_group_name: member(hit, 'function_group_name'),
      include: member(hit, 'include'),
    }).toEqual({ function_group_name: sharedGroup(), include: undefined });
    const line = member(hit, 'line');
    const snippet = member(hit, 'snippet');
    if (typeof line !== 'number' || typeof snippet !== 'string') {
      throw new Error(
        `the hit has no line and snippet: ${JSON.stringify(hit)}`,
      );
    }
    expect(snippet.toUpperCase()).toContain(sharedModule());

    const read = await liveCall('GetFunctionModule', {
      function_module_name: member(hit, 'object_name'),
      function_group_name: member(hit, 'function_group_name'),
      part: 'source',
      start_line: line,
      end_line: line,
    });
    const source = member(payloadOf('GetFunctionModule', read), 'source');
    if (typeof source !== 'string') {
      throw new Error(`GetFunctionModule answered no source: ${read.text}`);
    }
    expect(source.toUpperCase()).toContain(sharedModule());
    expect(source).toContain(snippet.trim());
  });

  it('a package that does not exist is skipped and not counted', async () => {
    const answer = await liveCall('SearchSource', {
      packages: [sharedPackage(), MISSING],
      include_subpackages: false,
      object_types: ['FUGR'],
      query: sharedModule(),
    });
    const payload = payloadOf('SearchSource', answer);
    expectHitsOnly(payload);
    expect(scanned(payload, 'packages')).toBe(1);
    const results = listOf(payload, 'results');
    moduleHit(results);
    expect(
      results.filter((hit) => member(hit, 'devclass') !== sharedPackage()),
    ).toEqual([]);
  });

  it('answer objects names each object with its hit count', async () => {
    const answer = await liveCall('SearchSource', {
      packages: [sharedPackage()],
      include_subpackages: false,
      object_types: ['FUGR'],
      query: sharedModule(),
      answer: 'objects',
    });
    const payload = payloadOf('SearchSource', answer);
    const results = listOf(payload, 'results');
    expect(results.length).toBeGreaterThan(0);
    for (const entry of results) {
      expect({
        line: member(entry, 'line'),
        snippet: member(entry, 'snippet'),
        counted: typeof member(entry, 'hits') === 'number',
      }).toEqual({ line: undefined, snippet: undefined, counted: true });
    }
    expect(member(moduleHit(results), 'function_group_name')).toBe(
      sharedGroup(),
    );
  });

  it('answer lines carries line numbers and no snippets', async () => {
    const answer = await liveCall('SearchSource', {
      packages: [sharedPackage()],
      include_subpackages: false,
      object_types: ['FUGR'],
      query: sharedModule(),
      answer: 'lines',
    });
    const results = listOf(payloadOf('SearchSource', answer), 'results');
    expect(results.length).toBeGreaterThan(0);
    for (const hit of results) {
      expect({
        line: typeof member(hit, 'line'),
        snippet: member(hit, 'snippet'),
      }).toEqual({ line: 'number', snippet: undefined });
    }
  });

  it('answer snippets carries line and snippet', async () => {
    const answer = await liveCall('SearchSource', {
      packages: [sharedPackage()],
      include_subpackages: false,
      object_types: ['FUGR'],
      query: sharedModule(),
      answer: 'snippets',
    });
    const results = listOf(payloadOf('SearchSource', answer), 'results');
    expect(results.length).toBeGreaterThan(0);
    for (const hit of results) {
      expect({
        line: typeof member(hit, 'line'),
        snippet: typeof member(hit, 'snippet'),
      }).toEqual({ line: 'number', snippet: 'string' });
    }
  });

  it('max_hits stops the scan with truncated.by_max_hits', async () => {
    const answer = await liveCall('SearchSource', {
      packages: [sharedPackage()],
      include_subpackages: false,
      object_types: ['FUGR'],
      query: 'FUNCTION',
      max_hits: 1,
    });
    const payload = payloadOf('SearchSource', answer);
    expect(listOf(payload, 'results')).toHaveLength(1);
    expect(member(member(payload, 'truncated'), 'by_max_hits')).toBe(true);
  });
});

liveSuite(['onprem', 'cloud'], 'SearchSource measurements', () => {
  let connection: GuardedConnection | undefined;

  beforeAll(async () => {
    const kind = configuredSystemKind();
    const destination = await getTestDestination();
    if (destination === null || (kind !== 'onprem' && kind !== 'cloud')) {
      throw new Error('the test config names no destination');
    }
    const opened = trackConnection(
      guardedTestConnection(destination.settings, destination.credential, {
        kind,
      }),
    );
    await opened.connect();
    await primeSystemContext(opened);
    connection = opened;
  });

  afterAll(async () => {
    const ending = connection;
    connection = undefined;
    if (ending !== undefined) await endTestConnection(ending);
  });

  const open = (): GuardedConnection => {
    if (connection === undefined) throw new Error('no connection');
    return connection;
  };

  it('a SAP 404 on a source read: its origin, status and adtType through adt-clients', async () => {
    const read = await createAdtClient(open())
      .getClass(classDocuments)
      .read({ className: `ZCL_${MISSING}`.slice(0, 30) }, 'active', {
        analyse: analyseException,
      });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    const error = read.getError();
    const shape = {
      origin: error.origin,
      status: error.response?.status,
      adtType: error.adtType,
    };
    console.log(
      `[measured] ${configuredSystemKind()} source 404: ${JSON.stringify(shape)}`,
    );
    expect(typeof shape.origin).toBe('string');
    expect(shape.status).toBe(404);
  });

  it('function modules named VIEW*: what the quick search lists and what a read answers', async () => {
    const listed = await open().makeAdtRequest<string>({
      url: '/sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=VIEW*&maxResults=5&objectType=FUGR%2FFF',
      method: 'GET',
      timeout: 0,
      headers: { Accept: 'application/xml' },
    });
    const body = String(listed.data);
    const uris: string[] = [];
    for (const part of body.split('adtcore:uri="').slice(1)) {
      uris.push(part.slice(0, part.indexOf('"')));
    }
    const reads: Array<{ module: string; status: number; starts: boolean }> =
      [];
    for (const uri of uris.slice(0, 3)) {
      const read = await open().makeAdtRequest<string>({
        url: `${uri}/source/main`,
        method: 'GET',
        // No bound: adt-clients sends its reads so.
        timeout: 0,
        headers: { Accept: 'text/plain' },
      });
      reads.push({
        module: uri.slice(uri.lastIndexOf('/') + 1),
        status: read.status,
        starts: String(read.data)
          .trimStart()
          .toUpperCase()
          .startsWith('FUNCTION'),
      });
    }
    console.log(
      `[measured] ${configuredSystemKind()} VIEW* modules: ${JSON.stringify({ status: listed.status, listed: uris.length, reads })}`,
    );
    expect(listed.status).toBe(200);
    for (const read of reads) expect(typeof read.status).toBe('number');
  });
});
