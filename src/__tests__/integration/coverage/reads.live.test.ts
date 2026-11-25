/**
 * Repository reads, live, on both systems, of objects that exist on every
 * system the suite runs on — read only, nothing created:
 *
 * - `GetTransaction`: the transaction `SE80`, found on both by a repository
 *   search of the `TRAN` type;
 * - `GetObjectStructure`: the shared class (`shared_dependencies`);
 * - `GetPackage`: the shared package the configuration names;
 * - `GetBehaviorImplementation`: the shared behavior implementation's
 *   metadata and source;
 * - `HandlerSystem` `search_object`: the shared class by its name;
 *   `where_used`: the shared domain, used by the shared data element — each
 *   through the server's dispatch (`throughServer`), with `background: false`
 *   in the call and without `background` as a run read once with
 *   `HandlerBackgroundRunGet`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  configuredSystemKind,
  getSharedDependenciesConfig,
} from '../helpers/configHelpers';
import {
  type LiveAnswer,
  liveCall,
  liveSuite,
  throughServer,
} from '../helpers/live';
import { member, payloadOf, succeeded } from './ownObjects';
import { finishedRun, startedRun } from './systemRuns';

/** The shared package the configuration names. */
function sharedPackage(): string {
  const named = member(getSharedDependenciesConfig(), 'package');
  if (typeof named !== 'string' || named === '') {
    throw new Error('the test config names no shared package');
  }
  return named.toUpperCase();
}

/**
 * The name of the first entry of the shared section `section` that exists on
 * the configured system (its `available_in`, when stated, names it).
 */
function sharedName(section: string): string {
  const kind = configuredSystemKind();
  const entries = member(getSharedDependenciesConfig(), section);
  const found = Array.isArray(entries)
    ? entries.find((entry) => {
        const availableIn = member(entry, 'available_in');
        return (
          typeof member(entry, 'name') === 'string' &&
          (!Array.isArray(availableIn) || availableIn.includes(kind))
        );
      })
    : undefined;
  const name = member(found, 'name');
  if (typeof name !== 'string' || name === '') {
    throw new Error(`the test config names no shared ${section} here`);
  }
  return name.toUpperCase();
}

/** The shared domain: what the shared data element is typed with. */
function sharedDomain(): string {
  return sharedName('domains');
}

/** The shared data element typed with the shared domain. */
function sharedDataElement(): string {
  const entries = member(getSharedDependenciesConfig(), 'data_elements');
  const found = Array.isArray(entries)
    ? entries.find(
        (entry) =>
          String(member(entry, 'type_name')).toUpperCase() === sharedDomain(),
      )
    : undefined;
  const name = member(found, 'name');
  if (typeof name !== 'string' || name === '') {
    throw new Error(
      `the test config names no shared data element of ${sharedDomain()}`,
    );
  }
  return name.toUpperCase();
}

/** The quick search's answer names the shared class, as a class. */
function expectSharedClassFound(answer: LiveAnswer): void {
  const text = succeeded('HandlerSystem search_object', answer).text;
  assert.ok(
    text
      .split('\n')
      .some(
        (line) => line.includes('ZCL_MCP_SHARED_CLS') && line.includes('CLAS'),
      ),
    text,
  );
}

/** The where-used answer of the shared domain names the shared data element. */
function expectDomainUsed(answer: LiveAnswer): void {
  const text = succeeded('HandlerSystem where_used', answer).text;
  assert.ok(text.toUpperCase().includes(sharedDataElement()), text);
}

liveSuite(['onprem', 'cloud'], 'Repository reads', () => {
  it('GetTransaction reads SE80', async () => {
    const read = await liveCall('GetTransaction', { transaction_name: 'SE80' });
    // Terse, the default: the transaction named, then its facets as TSV.
    const lines = succeeded('GetTransaction', read).text.split('\n');
    assert.equal(lines[0], '# transaction SE80', read.text);
    assert.ok(lines.includes('facet\tname\ttext'), read.text);
    // SAP's object, at full: the transaction SE80, of type TRAN/T.
    const full = await liveCall('GetTransaction', {
      transaction_name: 'SE80',
      detail: 'full',
    });
    const object = member(
      payloadOf(succeeded('GetTransaction full', full)),
      'object',
    );
    assert.equal(member(object, 'name'), 'SE80');
    assert.equal(member(object, 'type'), 'TRAN/T');
  });

  it('GetObjectStructure reads the shared class', async () => {
    const read = await liveCall('GetObjectStructure', {
      objecttype: 'CLAS/OC',
      objectname: 'ZCL_MCP_SHARED_CLS',
    });
    assert.ok(
      succeeded('GetObjectStructure', read).text.includes(
        'CLAS/OC: ZCL_MCP_SHARED_CLS',
      ),
    );
  });

  it('GetPackage reads the shared package', async () => {
    const name = sharedPackage();
    // The metadata fields read below: the JSON of detail medium.
    const read = await liveCall('GetPackage', {
      package_name: name,
      detail: 'medium',
    });
    const metadata = member(
      payloadOf(succeeded('GetPackage', read)),
      'metadata',
    );
    assert.equal(member(metadata, 'name'), name);
  });

  it('GetBehaviorImplementation reads the shared implementation, its metadata and its source', async () => {
    const metadata = await liveCall('GetBehaviorImplementation', {
      behavior_implementation_name: 'ZBP_MCP_SHR_I_ROOT',
      part: 'metadata',
    });
    assert.ok(
      succeeded('GetBehaviorImplementation metadata', metadata).text.includes(
        'abapClass',
      ),
    );
    const source = await liveCall('GetBehaviorImplementation', {
      behavior_implementation_name: 'ZBP_MCP_SHR_I_ROOT',
      part: 'source',
    });
    assert.ok(
      succeeded('GetBehaviorImplementation source', source)
        .text.toLowerCase()
        .includes('zbp_mcp_shr_i_root'),
    );
  });
  describe('HandlerSystem through the server', () => {
    throughServer();

    it('search_object with background false finds the shared class in the call', async () => {
      const answer = await liveCall('HandlerSystem', {
        action: 'search_object',
        object_name: 'ZCL_MCP_SHARED_CLS',
        object_type: 'CLAS',
        background: false,
      });
      expectSharedClassFound(answer);
    });

    it('search_object without background starts a run, whose answer HandlerBackgroundRunGet reads once', async () => {
      const started = await liveCall('HandlerSystem', {
        action: 'search_object',
        object_name: 'ZCL_MCP_SHARED_CLS',
        object_type: 'CLAS',
      });
      expectSharedClassFound(await finishedRun(startedRun(started)));
    });

    it('where_used with background false names the shared data element as a user of the shared domain', async () => {
      const answer = await liveCall('HandlerSystem', {
        action: 'where_used',
        object_name: sharedDomain(),
        object_type: 'DOMA/DD',
        background: false,
      });
      expectDomainUsed(answer);
    });

    it('where_used without background starts a run, whose answer HandlerBackgroundRunGet reads once', async () => {
      const started = await liveCall('HandlerSystem', {
        action: 'where_used',
        object_name: sharedDomain(),
        object_type: 'DOMA/DD',
      });
      expectDomainUsed(await finishedRun(startedRun(started)));
    });
  });
});
