/**
 * A function module's metadata, as the group check reads it (#2): every
 * path that addresses an existing module through a group reads the module's
 * metadata first and goes on only when its `adtcore:containerRef` names the
 * group given. A test of such a path answers that read first.
 */

import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { okResponse, reading } from './fakeClient';
import type { PinnedRequest } from './pinCases';

/**
 * The metadata document of `module` in `group`, in the corpus shape
 * (`read-metadata-function-module--01`): the group is stated by the root's
 * `adtcore:containerRef`.
 */
export function moduleMetadataDocument(module: string, group: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<fmodule:abapFunctionModule fmodule:releaseState="notReleased" fmodule:processingType="normal" abapsource:sourceUri="source/main" ' +
    `adtcore:name="${module}" adtcore:type="FUGR/FF" adtcore:version="active" adtcore:language="EN" ` +
    'xmlns:fmodule="http://www.sap.com/adt/functions/fmodules" xmlns:abapsource="http://www.sap.com/adt/abapsource" xmlns:adtcore="http://www.sap.com/adt/core">' +
    `<adtcore:containerRef adtcore:uri="/sap/bc/adt/functions/groups/${group.toLowerCase()}" adtcore:type="FUGR/F" adtcore:name="${group}" adtcore:packageName="$TMP"/>` +
    '<atom:link href="source/main" rel="http://www.sap.com/adt/relations/source" type="text/plain" xmlns:atom="http://www.w3.org/2005/Atom"/>' +
    '</fmodule:abapFunctionModule>'
  );
}

/** The metadata read's answer on a recording connection: `module` in `group`. */
export function moduleInGroup(
  module: string,
  group: string,
): Partial<IAdtWireResponse> {
  return { data: moduleMetadataDocument(module, group) };
}

/** The metadata read of `module` through `group` at `version`, as sent. */
export function moduleMetadataRequest(
  group: string,
  module: string,
  version = 'workingArea',
): PinnedRequest {
  return {
    method: 'GET',
    url: `/sap/bc/adt/functions/groups/${group.toLowerCase()}/fmodules/${module.toLowerCase()}?version=${version}`,
    headers: {
      Accept:
        'application/vnd.sap.adt.functions.fmodules+xml, application/vnd.sap.adt.functions.fmodules.v2+xml, application/vnd.sap.adt.functions.fmodules.v3+xml',
    },
    body: undefined,
  };
}

/**
 * A fake client's `readMetadata` member (`fakeClientOf`) answering the
 * metadata of a module in `group`.
 */
export function readsModuleIn(group: string, module = 'MODULE') {
  const document = moduleMetadataDocument(module, group);
  return async () => okResponse(reading(document, document));
}
