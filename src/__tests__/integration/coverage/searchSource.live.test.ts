/**
 * `SearchSource`, live (plan D23b, Step 7): what the search answers on the
 * systems, read-only. No package is counted (DO26): what the cases claim is
 * that a search answers no object that holds nothing of what was searched.
 *
 * - **Package masks, on premise:** a mask with several `*`, a `*` that
 *   matches zero characters, a `?` and an exact name with a literal `_`,
 *   each searched without subpackages: every hit's package is among the
 *   packages `SearchObject` over `DEVC` names for the mask (read first), the
 *   known hit of the shared package is returned, and every hit's line, read
 *   back with the hit object's own read tool, contains the query. Which
 *   packages are walked is pinned on the stand-in (the unit suites), not
 *   here. A mask past 1000 packages is not among them: walking the 1140
 *   packages such a mask names on premise took longer than a test may run
 *   (more than 600 s, measured), so the doubling is pinned, not run live.
 * - **A known hit, on both systems:** the shared function module the test
 *   config names, searched by its own name — on premise in the shared
 *   package, on ABAP Cloud in the configured build package, with its
 *   subpackages. Every hit's package is the named package or one of its
 *   descendants (`GetPackageContents` with subpackages, read first); on ABAP
 *   Cloud the shared package must be one of them, else the case fails
 *   naming that prerequisite. The answer carries no `no_hits` and no
 *   `failures`; `scanned.objects_with_hits` is the number of objects in
 *   `results`; the module's hit names the module and its group, and every
 *   hit's line, read back, contains the query. A package that does not exist
 *   yields no hit; the three `answer` levels have their shapes; `max_hits`
 *   stops the scan with `truncated.by_max_hits`.
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

/** Every hit's package is among `packages` (DO26: no hit from a package the search did not name). */
function expectHitsWithin(
  results: readonly unknown[],
  packages: readonly string[],
): void {
  const named = new Set(packages.map((name) => name.toUpperCase()));
  expect(
    results.filter(
      (hit) => !named.has(String(member(hit, 'devclass')).toUpperCase()),
    ),
  ).toEqual([]);
}

/**
 * The named package and every package under it: `GetPackageContents` with
 * subpackages (its walk has no depth limit), its package entries and the
 * root.
 */
async function treeOf(root: string): Promise<string[]> {
  const answer = await livePrepare('GetPackageContents', {
    package_name: root,
    include_subpackages: true,
  });
  if (answer.isError) {
    throw new Error(`GetPackageContents ${root}: ${answer.text}`);
  }
  const listed: unknown = JSON.parse(answer.text);
  if (!Array.isArray(listed)) {
    throw new Error(`GetPackageContents ${root} answered no list`);
  }
  return [
    root.toUpperCase(),
    ...listed
      .filter((entry) => member(entry, 'isPackage') === true)
      .map((entry) => String(member(entry, 'name')).toUpperCase()),
  ];
}

/** The source text a read answered; the case fails naming the read when there is none. */
function sourceOf(read: string, answer: LiveAnswer): string {
  const source = member(payloadOf(read, answer), 'source');
  if (typeof source !== 'string') {
    throw new Error(`${read} answered no source: ${answer.text}`);
  }
  return source;
}

/**
 * The hit's line, read back with the hit object's own read tool (a function
 * module with its group; a group's include as a function include, else as
 * an include; a program, else a program include; a class, or its local
 * include; an interface; a CDS, BDEF, DDLX or SRVD source).
 */
async function hitLine(hit: unknown): Promise<string> {
  const type = member(hit, 'object_type');
  const name = member(hit, 'object_name');
  const include = member(hit, 'include');
  const line = member(hit, 'line');
  if (typeof name !== 'string' || typeof line !== 'number') {
    throw new Error(`the hit has no object and line: ${JSON.stringify(hit)}`);
  }
  switch (type) {
    case 'FUGR/FF':
      return sourceOf(
        'GetFunctionModule',
        await livePrepare('GetFunctionModule', {
          function_module_name: name,
          function_group_name: member(hit, 'function_group_name'),
          part: 'source',
          start_line: line,
          end_line: line,
        }),
      );
    case 'FUGR': {
      const asFunctionInclude = await livePrepare('GetFunctionInclude', {
        function_group_name: name,
        include_name: include,
        part: 'source',
        start_line: line,
        end_line: line,
      });
      if (!asFunctionInclude.isError) {
        return sourceOf('GetFunctionInclude', asFunctionInclude);
      }
      return sourceOf(
        'GetInclude',
        await livePrepare('GetInclude', {
          include_name: include,
          part: 'source',
          start_line: line,
          end_line: line,
        }),
      );
    }
    case 'PROG': {
      const asProgram = await livePrepare('GetProgram', {
        program_name: name,
        part: 'source',
        start_line: line,
        end_line: line,
      });
      if (!asProgram.isError) return sourceOf('GetProgram', asProgram);
      return sourceOf(
        'GetInclude',
        await livePrepare('GetInclude', {
          include_name: name,
          part: 'source',
          start_line: line,
          end_line: line,
        }),
      );
    }
    case 'CLAS':
      switch (include) {
        case 'definitions':
          return sourceOf(
            'GetLocalDefinitions',
            await livePrepare('GetLocalDefinitions', {
              class_name: name,
              start_line: line,
              end_line: line,
            }),
          );
        case 'implementations':
          return sourceOf(
            'GetLocalTypes',
            await livePrepare('GetLocalTypes', {
              class_name: name,
              start_line: line,
              end_line: line,
            }),
          );
        case 'macros':
          return sourceOf(
            'GetLocalMacros',
            await livePrepare('GetLocalMacros', {
              class_name: name,
              start_line: line,
              end_line: line,
            }),
          );
        case 'testclasses':
          return sourceOf(
            'GetLocalTestClass',
            await livePrepare('GetLocalTestClass', {
              class_name: name,
              start_line: line,
              end_line: line,
            }),
          );
        default:
          return sourceOf(
            'GetClass',
            await livePrepare('GetClass', {
              class_name: name,
              part: 'source',
              start_line: line,
              end_line: line,
            }),
          );
      }
    case 'INTF':
      return sourceOf(
        'GetInterface',
        await livePrepare('GetInterface', {
          interface_name: name,
          part: 'source',
          start_line: line,
          end_line: line,
        }),
      );
    case 'DDLS':
      return sourceOf(
        'GetDdl',
        await livePrepare('GetDdl', {
          ddl_name: name,
          part: 'source',
          start_line: line,
          end_line: line,
        }),
      );
    case 'BDEF':
      return sourceOf(
        'GetBehaviorDefinition',
        await livePrepare('GetBehaviorDefinition', {
          behavior_definition_name: name,
          part: 'source',
          start_line: line,
          end_line: line,
        }),
      );
    case 'DDLX':
      return sourceOf(
        'GetMetadataExtension',
        await livePrepare('GetMetadataExtension', {
          metadata_extension_name: name,
          part: 'source',
          start_line: line,
          end_line: line,
        }),
      );
    case 'SRVD':
      return sourceOf(
        'GetServiceDefinition',
        await livePrepare('GetServiceDefinition', {
          service_definition_name: name,
          part: 'source',
          start_line: line,
          end_line: line,
        }),
      );
    default:
      throw new Error(`a hit of an unknown type: ${JSON.stringify(hit)}`);
  }
}

/** Every hit is real: its line, read back, contains `query`. */
async function expectHitsReal(
  results: readonly unknown[],
  query: string,
): Promise<void> {
  for (const hit of results) {
    expect({
      hit: `${member(hit, 'object_name')}:${member(hit, 'line')}`,
      holds: (await hitLine(hit)).toUpperCase().includes(query.toUpperCase()),
    }).toEqual({
      hit: `${member(hit, 'object_name')}:${member(hit, 'line')}`,
      holds: true,
    });
  }
}

/** A counter of the answer's `scanned`. */
function scanned(payload: unknown, counter: string): unknown {
  return member(member(payload, 'scanned'), counter);
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

// ---------------------------------------------------------------------------
// The cases

liveSuite(['onprem'], 'SearchSource package masks', () => {
  /**
   * The mask searched without subpackages, for the shared module in its
   * group: every hit's package is among `named`, the module's hit is there,
   * and every hit's line holds the query.
   */
  async function expectMaskAnswer(
    payload: unknown,
    named: readonly string[],
  ): Promise<void> {
    expectHitsOnly(payload);
    const results = listOf(payload, 'results');
    expectHitsWithin(results, named);
    moduleHit(results);
    await expectHitsReal(results, sharedModule());
  }

  it('a mask with several *: hits only from the packages the quick search names', async () => {
    const shared = sharedPackage();
    const mask = `*${shared.slice(1, 4)}*${shared.slice(-3)}*`;
    const named = await quickSearchPackages(mask);
    expect(named.length).toBeGreaterThan(1);
    expect(named).toContain(shared);
    const answer = await liveCall('SearchSource', {
      packages: [mask],
      include_subpackages: false,
      object_types: ['FUGR'],
      object_filter: sharedGroup(),
      query: sharedModule(),
    });
    await expectMaskAnswer(payloadOf('SearchSource', answer), named);
  });

  it('a * matching zero characters: hits only from the packages the quick search names', async () => {
    const mask = `${sharedPackage()}*`;
    const named = await quickSearchPackages(mask);
    expect(named).toContain(sharedPackage());
    const answer = await liveCall('SearchSource', {
      packages: [mask],
      include_subpackages: false,
      object_types: ['FUGR'],
      object_filter: sharedGroup(),
      query: sharedModule(),
    });
    await expectMaskAnswer(payloadOf('SearchSource', answer), named);
  });

  it('a mask with ?: hits only from the packages the quick search names', async () => {
    const mask = `${sharedPackage().slice(0, -1)}?`;
    const named = await quickSearchPackages(mask);
    expect(named).toContain(sharedPackage());
    const answer = await liveCall('SearchSource', {
      packages: [mask],
      include_subpackages: false,
      object_types: ['FUGR'],
      object_filter: sharedGroup(),
      query: sharedModule(),
    });
    await expectMaskAnswer(payloadOf('SearchSource', answer), named);
  });

  it('an exact name with a literal _: hits only from that package', async () => {
    const exact = sharedPackage();
    expect(exact).toContain('_');
    const named = await quickSearchPackages(exact);
    expect(named).toEqual([exact]);
    const answer = await liveCall('SearchSource', {
      packages: [exact],
      include_subpackages: false,
      object_types: ['FUGR'],
      object_filter: sharedGroup(),
      query: sharedModule(),
    });
    await expectMaskAnswer(payloadOf('SearchSource', answer), named);
  });
});

liveSuite(['onprem', 'cloud'], 'SearchSource finds a known hit', () => {
  it('the shared function module is a hit of its own: hits only from the named tree, each real', async () => {
    const tree = await treeOf(hitPackage());
    if (!tree.includes(sharedPackage().toUpperCase())) {
      throw new Error(
        'the configured shared package must be a descendant of the configured build package on ABAP Cloud',
      );
    }
    const answer = await liveCall('SearchSource', {
      packages: [hitPackage()],
      object_types: ['FUGR'],
      query: sharedModule(),
    });
    const payload = payloadOf('SearchSource', answer);
    expectHitsOnly(payload);
    const results = listOf(payload, 'results');
    expect(scanned(payload, 'objects_with_hits')).toBe(objectsOf(results));
    expectHitsWithin(results, tree);
    const hit = moduleHit(results);
    expect({
      function_group_name: member(hit, 'function_group_name'),
      include: member(hit, 'include'),
    }).toEqual({ function_group_name: sharedGroup(), include: undefined });
    await expectHitsReal(results, sharedModule());

    // The module's hit, read with exactly the fields it names: the case
    // GetFunctionModule#source stands for live.
    const line = member(hit, 'line');
    const snippet = member(hit, 'snippet');
    if (typeof line !== 'number' || typeof snippet !== 'string') {
      throw new Error(
        `the hit has no line and snippet: ${JSON.stringify(hit)}`,
      );
    }
    const read = await liveCall('GetFunctionModule', {
      function_module_name: member(hit, 'object_name'),
      function_group_name: member(hit, 'function_group_name'),
      part: 'source',
      start_line: line,
      end_line: line,
    });
    const source = sourceOf('GetFunctionModule', read);
    expect(source.toUpperCase()).toContain(sharedModule());
    expect(source).toContain(snippet.trim());
  });

  it('a package that does not exist yields no hit', async () => {
    const both = await liveCall('SearchSource', {
      packages: [sharedPackage(), MISSING],
      include_subpackages: false,
      object_types: ['FUGR'],
      query: sharedModule(),
    });
    const payload = payloadOf('SearchSource', both);
    expectHitsOnly(payload);
    const results = listOf(payload, 'results');
    moduleHit(results);
    expectHitsWithin(results, [sharedPackage()]);

    const alone = await liveCall('SearchSource', {
      packages: [MISSING],
      include_subpackages: false,
      object_types: ['FUGR'],
      query: sharedModule(),
    });
    const missing = payloadOf('SearchSource', alone);
    expect({
      results: listOf(missing, 'results'),
      objects: scanned(missing, 'objects'),
    }).toEqual({ results: [], objects: 0 });
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
