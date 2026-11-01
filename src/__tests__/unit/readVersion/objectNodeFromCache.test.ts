/**
 * `GetObjectNodeFromCache` expands a cached node's `OBJECT_URI` with one GET of
 * the object's document, outside adt-clients. It has no version parameter, so
 * it reads the active version and says so: `version=active` on the address,
 * the rest of the address's query kept.
 */

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
  it.each([
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
  ])('OBJECT_URI %s is read as %s', async (uri, sent) => {
    cacheWith(uri);
    const connection = recordingConnection([{ data: '<doc/>' }]);
    const result = await handleGetObjectNodeFromCache(
      { connection, logger: undefined },
      NODE,
    );
    expect(result.isError).not.toBe(true);
    expect(connection.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      `GET ${sent}`,
    ]);
  });

  it('says it reads the active version', () => {
    expect(TOOL_DEFINITION.description.includes('active version')).toBe(true);
  });
});
