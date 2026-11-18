/**
 * `GetObjectNodeFromCache` expands a cached node's `OBJECT_URI` with one GET of
 * the object's document, outside adt-clients. It has no version parameter, so
 * it reads the active version and says so: `version=active` on the address,
 * the rest of the address's query kept.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import {
  handleGetObjectNodeFromCache,
  TOOL_DEFINITION,
} from '../../../handlers/system/readonly/handleGetObjectNodeFromCache';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import { recordingConnection } from '../../helpers/recordingConnection';

/** The cache holding one node with `uri` as its `OBJECT_URI`. */
function cacheWith(uri: string) {
  objectsListCache.setCache({
    objects: [
      {
        OBJECT_TYPE: 'PROG/P',
        OBJECT_NAME: 'ZPROG',
        TECH_NAME: 'ZPROG',
        OBJECT_URI: uri,
      },
    ],
  });
}

const NODE = {
  object_type: 'PROG/P',
  object_name: 'ZPROG',
  tech_name: 'ZPROG',
};

describe('GetObjectNodeFromCache reads the active version of the cached object', () => {
  for (const [uri, sent] of [
    [
      '/sap/bc/adt/programs/programs/zprog',
      '/sap/bc/adt/programs/programs/zprog?version=active',
    ],
    [
      '/sap/bc/adt/programs/programs/zprog?context=x',
      '/sap/bc/adt/programs/programs/zprog?context=x&version=active',
    ],
    [
      'https://host:443/sap/bc/adt/programs/programs/zprog?context=x',
      '/sap/bc/adt/programs/programs/zprog?context=x&version=active',
    ],
    [
      '/sap/bc/adt/programs/programs/zprog?version=inactive',
      '/sap/bc/adt/programs/programs/zprog?version=active',
    ],
  ]) {
    it(format('OBJECT_URI %s is read as %s', uri, sent), async () => {
      cacheWith(uri);
      const connection = recordingConnection([{ data: '<doc/>' }]);
      const result = await handleGetObjectNodeFromCache(
        { connection, logger: undefined },
        NODE,
      );
      assert.notEqual(result.isError, true);
      assert.deepStrictEqual(
        connection.requests.map((r) => `${r.method} ${r.url}`),
        [`GET ${sent}`],
      );
    });
  }

  it('says it reads the active version', () => {
    assert.equal(TOOL_DEFINITION.description.includes('active version'), true);
  });
});
