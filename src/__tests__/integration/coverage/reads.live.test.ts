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
 * - `HandlerSearch`: the shared class by its name.
 */
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { getSharedDependenciesConfig } from '../helpers/configHelpers';
import { liveCall, liveSuite } from '../helpers/live';
import { member, payloadOf, succeeded } from './ownObjects';

/** The shared package the configuration names. */
function sharedPackage(): string {
  const named = member(getSharedDependenciesConfig(), 'package');
  if (typeof named !== 'string' || named === '') {
    throw new Error('the test config names no shared package');
  }
  return named.toUpperCase();
}

liveSuite(['onprem', 'cloud'], 'Repository reads', () => {
  it('GetTransaction reads SE80', async () => {
    const read = await liveCall('GetTransaction', { transaction_name: 'SE80' });
    const object = member(
      payloadOf(succeeded('GetTransaction', read)),
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
    const read = await liveCall('GetPackage', { package_name: name });
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

  it('HandlerSearch finds the shared class by its name', async () => {
    const found = await liveCall('HandlerSearch', {
      query: 'ZCL_MCP_SHARED_CLS',
      object_type: 'CLAS',
    });
    assert.ok(
      succeeded('HandlerSearch', found).text.includes('ZCL_MCP_SHARED_CLS'),
    );
  });
});
