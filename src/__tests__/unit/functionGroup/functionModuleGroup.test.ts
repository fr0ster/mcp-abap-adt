/**
 * A function module addressed through a function group: the group is
 * checked against the module's metadata before anything else is sent (#2).
 *
 * Measured on premise (2026-11-04): SAP ignores the group segment of a
 * function module's address — through another group's address the module
 * was read, locked, written and unlocked — and states the group holding it
 * only in the metadata document's `adtcore:containerRef`. Every served path
 * that addresses an existing module through a group therefore reads that
 * document first (one `GET`, the working area) and refuses a group that
 * does not hold the module, with nothing else sent.
 *
 * Each path: a mismatch (the metadata names another group: the metadata
 * read(s), then nothing) and a match (the metadata read(s) first, then the
 * path's own requests, unchanged). The requests are pinned by literal on
 * `recordingConnection`, the tool called through its served entry.
 */

import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  type PinnedRequest,
  recordCase,
  runPinCase,
} from '../../helpers/pinCases';

/** The module's metadata read through ZPIN_FG at `version`. */
function META(module: string, version: string): PinnedRequest {
  return {
    method: 'GET',
    url: `/sap/bc/adt/functions/groups/zpin_fg/fmodules/${module.toLowerCase()}?version=${version}`,
    headers: {
      Accept:
        'application/vnd.sap.adt.functions.fmodules+xml, application/vnd.sap.adt.functions.fmodules.v2+xml, application/vnd.sap.adt.functions.fmodules.v3+xml',
    },
    body: undefined,
  };
}

/**
 * The metadata document of `module` in `group`, in the corpus shape
 * (`read-metadata-function-module--01`): the group is stated by the root's
 * `adtcore:containerRef`.
 */
function metadataDocument(module: string, group: string): string {
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

/** The metadata read's answer: `module` in `group`. */
const inGroup = (module: string, group: string): Partial<IAdtWireResponse> => ({
  data: metadataDocument(module, group),
});

interface GroupCase {
  label: string;
  tool: string;
  args: Readonly<Record<string, unknown>>;
  /** The answers when every module is in the group given. */
  matched: ReadonlyArray<Partial<IAdtWireResponse>>;
  /** The answers when the last module checked is in another group. */
  mismatched: ReadonlyArray<Partial<IAdtWireResponse>>;
  /** Whether the matched path answers a failure (its later answers are empty). */
  matchRefused: boolean;
  /** The metadata reads, one per module reference, in order. */
  checks: readonly PinnedRequest[];
  /** The path's own requests after the checks, as before the check. */
  after: readonly PinnedRequest[];
}

const CASES: readonly GroupCase[] = [
  {
    label: 'UpdateFunctionModule',
    tool: 'UpdateFunctionModule',
    args: {
      function_group_name: 'ZPIN_FG',
      function_module_name: 'ZPIN_FM',
      source_code: 'FUNCTION zpin_fm.\nENDFUNCTION.',
    },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: false,
    checks: [META('ZPIN_FM', 'workingArea')],
    after: [
      {
        method: 'POST',
        url: '/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm?_action=LOCK&accessMode=MODIFY',
        headers: {
          Accept:
            'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9',
        },
        body: undefined,
      },
      {
        method: 'PUT',
        url: '/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm/source/main?lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
        headers: {
          Accept: 'text/plain',
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: 'FUNCTION zpin_fm.\nENDFUNCTION.',
      },
      {
        method: 'POST',
        url: '/sap/bc/adt/checkruns?reporters=abapCheckRun',
        headers: {
          Accept: 'application/vnd.sap.adt.checkmessages+xml',
          'Content-Type': 'application/vnd.sap.adt.checkobjects+xml',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?>\n<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">\n  <chkrun:checkObject adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm" chkrun:version="inactive"/>\n</chkrun:checkObjectList>',
      },
      {
        method: 'POST',
        url: '/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm?_action=UNLOCK&lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
        headers: { Accept: 'application/xml' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm/source/main?version=inactive&withLongPolling=true',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    label: 'GetFunctionModule source',
    tool: 'GetFunctionModule',
    args: { function_group_name: 'ZPIN_FG', function_module_name: 'ZPIN_FM' },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: false,
    checks: [META('ZPIN_FM', 'active')],
    after: [
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    label: 'GetFunctionModule source, ranged',
    tool: 'GetFunctionModule',
    args: {
      function_group_name: 'ZPIN_FG',
      function_module_name: 'ZPIN_FM',
      start_line: 2,
      end_line: 2,
    },
    matched: [
      inGroup('ZPIN_FM', 'ZPIN_FG'),
      { data: 'FUNCTION zpin_fm.\n  " body\nENDFUNCTION.' },
    ],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: false,
    checks: [META('ZPIN_FM', 'active')],
    after: [
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    label: 'ActivateFunctionModule',
    tool: 'ActivateFunctionModule',
    args: { function_group_name: 'ZPIN_FG', function_module_name: 'ZPIN_FM' },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: true,
    checks: [META('ZPIN_FM', 'workingArea')],
    after: [
      {
        method: 'POST',
        url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
        headers: {
          Accept: 'application/xml',
          'Content-Type': 'application/vnd.sap.adt.activation+xml',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm" adtcore:name="ZPIN_FM"/>\n</adtcore:objectReferences>',
      },
    ],
  },
  {
    label: 'DeleteFunctionModule',
    tool: 'DeleteFunctionModule',
    args: { function_group_name: 'ZPIN_FG', function_module_name: 'ZPIN_FM' },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: true,
    checks: [META('ZPIN_FM', 'workingArea')],
    after: [
      {
        method: 'POST',
        url: '/sap/bc/adt/deletion/check',
        headers: {
          Accept: 'application/vnd.sap.adt.deletion.check.response.v1+xml',
          'Content-Type':
            'application/vnd.sap.adt.deletion.check.request.v1+xml',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?>\n<del:checkRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">\n  <del:object adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm"/>\n</del:checkRequest>',
      },
      {
        method: 'POST',
        url: '/sap/bc/adt/deletion/delete',
        headers: {
          Accept: 'application/vnd.sap.adt.deletion.response.v1+xml',
          'Content-Type': 'application/vnd.sap.adt.deletion.request.v1+xml',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?>\n<del:deletionRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">\n  <del:object adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm">\n    <del:transportNumber/>\n  </del:object>\n</del:deletionRequest>',
      },
    ],
  },
  {
    label: 'CheckFunctionModule',
    tool: 'CheckFunctionModule',
    args: { function_group_name: 'ZPIN_FG', function_module_name: 'ZPIN_FM' },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: true,
    checks: [META('ZPIN_FM', 'workingArea')],
    after: [
      {
        method: 'POST',
        url: '/sap/bc/adt/checkruns?reporters=abapCheckRun',
        headers: {
          Accept: 'application/vnd.sap.adt.checkmessages+xml',
          'Content-Type': 'application/vnd.sap.adt.checkobjects+xml',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?>\n<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">\n  <chkrun:checkObject adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm" chkrun:version="active"/>\n</chkrun:checkObjectList>',
      },
    ],
  },
  {
    label: 'GetFunctionModuleVersions',
    tool: 'GetFunctionModuleVersions',
    args: { function_group_name: 'ZPIN_FG', function_module_name: 'ZPIN_FM' },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: false,
    checks: [META('ZPIN_FM', 'workingArea')],
    after: [
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm/source/main/versions',
        headers: { Accept: 'application/atom+xml;type=feed' },
        body: undefined,
      },
    ],
  },
  {
    label: 'GetObjectVersions FUNCTION_MODULE',
    tool: 'GetObjectVersions',
    args: {
      object_type: 'function_module',
      function_group_name: 'ZPIN_FG',
      object_name: 'ZPIN_FM',
    },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: false,
    checks: [META('ZPIN_FM', 'workingArea')],
    after: [
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm/source/main/versions',
        headers: { Accept: 'application/atom+xml;type=feed' },
        body: undefined,
      },
    ],
  },
  {
    label: 'RunFunctionModuleUnitTest sync',
    tool: 'RunFunctionModuleUnitTest',
    args: {
      function_group_name: 'ZPIN_FG',
      function_module_name: 'ZPIN_FM',
      runner: 'sync',
    },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: false,
    checks: [META('ZPIN_FM', 'workingArea')],
    after: [
      {
        method: 'POST',
        url: '/sap/bc/adt/abapunit/testruns',
        headers: {
          'Content-Type': 'application/xml',
          Accept: 'application/xml',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?><aunit:runConfiguration xmlns:aunit="http://www.sap.com/adt/aunit">\n  <external>\n    <coverage active="false"/>\n  </external>\n  <options>\n    <uriType value="semantic"/>\n    <testDeterminationStrategy sameProgram="true" assignedTests="false" appendAssignedTestsPreview="true"/>\n    <testRiskLevels harmless="true" dangerous="true" critical="true"/>\n    <testDurations short="true" medium="true" long="true"/>\n    <withNavigationUri enabled="true"/>\n  </options>\n  <adtcore:objectSets xmlns:adtcore="http://www.sap.com/adt/core">\n    <objectSet kind="inclusive">\n      <adtcore:objectReferences>\n        <adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm"/>\n      </adtcore:objectReferences>\n    </objectSet>\n  </adtcore:objectSets>\n</aunit:runConfiguration>',
      },
    ],
  },
  {
    label: 'RunFunctionModuleUnitTest async with a group',
    tool: 'RunFunctionModuleUnitTest',
    args: {
      function_group_name: 'ZPIN_FG',
      function_module_name: 'ZPIN_FM',
      wait: false,
    },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: true,
    checks: [META('ZPIN_FM', 'workingArea')],
    after: [
      {
        method: 'POST',
        url: '/sap/bc/adt/abapunit/runs',
        headers: {
          'Content-Type': 'application/vnd.sap.adt.api.abapunit.run.v2+xml',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:osl="http://www.sap.com/api/osl" title="ZPIN_FM" context="MCP ABAP ADT Client">\n  <aunit:options>\n    <aunit:scope ownTests="true" foreignTests="false" addForeignTestsAsPreview="true"/>\n    <aunit:riskLevel harmless="true" dangerous="true" critical="true"/>\n    <aunit:duration short="true" medium="true" long="true"/>\n  </aunit:options>\n  <osl:objectSet xsi:type="osl:flatObjectSet">\n    <osl:object name="ZPIN_FM" type="FUNC"/>\n  </osl:objectSet>\n</aunit:run>',
      },
    ],
  },
  {
    label: 'ActivateObjects with two FUGR/FF entries',
    tool: 'ActivateObjects',
    args: {
      objects: [
        { name: 'ZPIN_FM', type: 'FUGR/FF', parentName: 'ZPIN_FG' },
        { name: 'ZPIN_FM2', type: 'FUGR/FF', parentName: 'ZPIN_FG' },
      ],
    },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG'), inGroup('ZPIN_FM2', 'ZPIN_FG')],
    mismatched: [
      inGroup('ZPIN_FM', 'ZPIN_FG'),
      inGroup('ZPIN_FM2', 'ZPIN_OTHER'),
    ],
    matchRefused: false,
    checks: [META('ZPIN_FM', 'workingArea'), META('ZPIN_FM2', 'workingArea')],
    after: [
      {
        method: 'POST',
        url: '/sap/bc/adt/activation/runs?method=activate&preauditRequested=true',
        headers: {
          Accept: 'application/xml',
          'Content-Type': 'application/xml',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm" adtcore:type="FUGR/FF" adtcore:name="ZPIN_FM"/>\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm2" adtcore:type="FUGR/FF" adtcore:name="ZPIN_FM2"/>\n</adtcore:objectReferences>',
      },
    ],
  },
  {
    label: 'GetWhereUsed single',
    tool: 'GetWhereUsed',
    args: { object_name: 'ZPIN_FG|ZPIN_FM', object_type: 'FUGR/FF' },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: false,
    checks: [META('ZPIN_FM', 'workingArea')],
    after: [
      {
        method: 'POST',
        url: '/sap/bc/adt/repository/informationsystem/usageReferences?uri=%2Fsap%2Fbc%2Fadt%2Ffunctions%2Fgroups%2Fzpin_fg%2Ffmodules%2Fzpin_fm',
        headers: {
          Accept:
            'application/vnd.sap.adt.repository.usagereferences.result.v1+xml',
          'Content-Type':
            'application/vnd.sap.adt.repository.usagereferences.request.v1+xml',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?><usagereferences:usageReferenceRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:affectedObjects/></usagereferences:usageReferenceRequest>',
      },
    ],
  },
  {
    label: 'GetWhereUsed list',
    tool: 'GetWhereUsed',
    args: {
      objects: [
        { object_name: 'ZPIN_FG|ZPIN_FM', object_type: 'FUGR/FF' },
        { object_name: 'ZPIN_FG|ZPIN_FM2', object_type: 'FUGR/FF' },
      ],
    },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG'), inGroup('ZPIN_FM2', 'ZPIN_FG')],
    mismatched: [
      inGroup('ZPIN_FM', 'ZPIN_FG'),
      inGroup('ZPIN_FM2', 'ZPIN_OTHER'),
    ],
    matchRefused: false,
    checks: [META('ZPIN_FM', 'workingArea'), META('ZPIN_FM2', 'workingArea')],
    after: [
      {
        method: 'POST',
        url: '/sap/bc/adt/communication/batch',
        headers: {
          'Content-Type':
            'multipart/mixed; boundary=batch_a0f8861b-df94-44d9-af23-7186134727a1',
          Accept: 'multipart/mixed',
        },
        body: '--batch_a0f8861b-df94-44d9-af23-7186134727a1\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nPOST /sap/bc/adt/repository/informationsystem/usageReferences?uri=%2Fsap%2Fbc%2Fadt%2Ffunctions%2Fgroups%2Fzpin_fg%2Ffmodules%2Fzpin_fm HTTP/1.1\r\nAccept: application/vnd.sap.adt.repository.usagereferences.result.v1+xml\r\nContent-Type: application/vnd.sap.adt.repository.usagereferences.request.v1+xml\r\nContent-Length: 218\r\n\r\n<?xml version="1.0" encoding="UTF-8"?><usagereferences:usageReferenceRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:affectedObjects/></usagereferences:usageReferenceRequest>\r\n--batch_a0f8861b-df94-44d9-af23-7186134727a1\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nPOST /sap/bc/adt/repository/informationsystem/usageReferences?uri=%2Fsap%2Fbc%2Fadt%2Ffunctions%2Fgroups%2Fzpin_fg%2Ffmodules%2Fzpin_fm2 HTTP/1.1\r\nAccept: application/vnd.sap.adt.repository.usagereferences.result.v1+xml\r\nContent-Type: application/vnd.sap.adt.repository.usagereferences.request.v1+xml\r\nContent-Length: 218\r\n\r\n<?xml version="1.0" encoding="UTF-8"?><usagereferences:usageReferenceRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:affectedObjects/></usagereferences:usageReferenceRequest>\r\n\r\n--batch_a0f8861b-df94-44d9-af23-7186134727a1--\r\n',
      },
    ],
  },
  {
    label: 'HandlerGet',
    tool: 'HandlerGet',
    args: {
      object_type: 'FUNCTION_MODULE',
      function_group_name: 'ZPIN_FG',
      function_module_name: 'ZPIN_FM',
    },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: false,
    checks: [META('ZPIN_FM', 'active')],
    after: [
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    label: 'HandlerUpdate',
    tool: 'HandlerUpdate',
    args: {
      object_type: 'FUNCTION_MODULE',
      function_group_name: 'ZPIN_FG',
      function_module_name: 'ZPIN_FM',
      source_code: 'FUNCTION zpin_fm.\nENDFUNCTION.',
      lock_handle: 'H',
    },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: false,
    checks: [META('ZPIN_FM', 'workingArea')],
    after: [
      {
        method: 'PUT',
        url: '/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm/source/main?lockHandle=H',
        headers: {
          Accept: 'text/plain',
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: 'FUNCTION zpin_fm.\nENDFUNCTION.',
      },
    ],
  },
  {
    label: 'HandlerActivate single',
    tool: 'HandlerActivate',
    args: { object_type: 'FUNCTION_MODULE', object_name: 'ZPIN_FG|ZPIN_FM' },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: true,
    checks: [META('ZPIN_FM', 'workingArea')],
    after: [
      {
        method: 'POST',
        url: '/sap/bc/adt/activation/runs?method=activate&preauditRequested=true',
        headers: {
          Accept: 'application/xml',
          'Content-Type': 'application/xml',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm" adtcore:type="FUGR/FF" adtcore:name="ZPIN_FM"/>\n</adtcore:objectReferences>',
      },
    ],
  },
  {
    label: 'HandlerActivate code',
    tool: 'HandlerActivate',
    args: {
      object_adt_type: 'FUGR/FF',
      object_name: 'ZPIN_FM',
      parentName: 'ZPIN_FG',
    },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: true,
    checks: [META('ZPIN_FM', 'workingArea')],
    after: [
      {
        method: 'POST',
        url: '/sap/bc/adt/activation/runs?method=activate&preauditRequested=true',
        headers: {
          Accept: 'application/xml',
          'Content-Type': 'application/xml',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm" adtcore:type="FUGR/FF" adtcore:name="ZPIN_FM"/>\n</adtcore:objectReferences>',
      },
    ],
  },
  {
    label: 'HandlerActivate list with two FUGR/FF entries',
    tool: 'HandlerActivate',
    args: {
      objects: [
        { name: 'ZPIN_FM', type: 'FUGR/FF', parentName: 'ZPIN_FG' },
        { name: 'ZPIN_FM2', type: 'FUGR/FF', parentName: 'ZPIN_FG' },
      ],
    },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG'), inGroup('ZPIN_FM2', 'ZPIN_FG')],
    mismatched: [
      inGroup('ZPIN_FM', 'ZPIN_FG'),
      inGroup('ZPIN_FM2', 'ZPIN_OTHER'),
    ],
    matchRefused: true,
    checks: [META('ZPIN_FM', 'workingArea'), META('ZPIN_FM2', 'workingArea')],
    after: [
      {
        method: 'POST',
        url: '/sap/bc/adt/activation/runs?method=activate&preauditRequested=true',
        headers: {
          Accept: 'application/xml',
          'Content-Type': 'application/xml',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm" adtcore:type="FUGR/FF" adtcore:name="ZPIN_FM"/>\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm2" adtcore:type="FUGR/FF" adtcore:name="ZPIN_FM2"/>\n</adtcore:objectReferences>',
      },
    ],
  },
  {
    label: 'HandlerDelete',
    tool: 'HandlerDelete',
    args: {
      object_type: 'FUNCTION_MODULE',
      function_group_name: 'ZPIN_FG',
      function_module_name: 'ZPIN_FM',
    },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: true,
    checks: [META('ZPIN_FM', 'workingArea')],
    after: [
      {
        method: 'POST',
        url: '/sap/bc/adt/deletion/delete',
        headers: {
          Accept: 'application/vnd.sap.adt.deletion.response.v1+xml',
          'Content-Type': 'application/vnd.sap.adt.deletion.request.v1+xml',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?>\n<del:deletionRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">\n  <del:object adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm">\n    <del:transportNumber/>\n  </del:object>\n</del:deletionRequest>',
      },
    ],
  },
  {
    label: 'HandlerDeletionCheck',
    tool: 'HandlerDeletionCheck',
    args: { object_type: 'FUNCTION_MODULE', object_name: 'ZPIN_FG|ZPIN_FM' },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: true,
    checks: [META('ZPIN_FM', 'workingArea')],
    after: [
      {
        method: 'POST',
        url: '/sap/bc/adt/deletion/check',
        headers: {
          Accept: 'application/vnd.sap.adt.deletion.check.response.v1+xml',
          'Content-Type':
            'application/vnd.sap.adt.deletion.check.request.v1+xml',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?>\n<del:checkRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">\n  <del:object adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm"/>\n</del:checkRequest>',
      },
    ],
  },
  {
    label: 'HandlerCheckRun',
    tool: 'HandlerCheckRun',
    args: { object_type: 'FUNCTION_MODULE', object_name: 'ZPIN_FG|ZPIN_FM' },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: true,
    checks: [META('ZPIN_FM', 'workingArea')],
    after: [
      {
        method: 'POST',
        url: '/sap/bc/adt/checkruns?reporters=abapCheckRun',
        headers: {
          Accept: 'application/vnd.sap.adt.checkmessages+xml',
          'Content-Type': 'application/vnd.sap.adt.checkobjects+xml',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?>\n<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">\n  <chkrun:checkObject adtcore:uri="/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm" chkrun:version="active"/>\n</chkrun:checkObjectList>',
      },
    ],
  },
  {
    label: 'HandlerLock',
    tool: 'HandlerLock',
    args: { object_type: 'FUNCTION_MODULE', object_name: 'ZPIN_FG|ZPIN_FM' },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: false,
    checks: [META('ZPIN_FM', 'workingArea')],
    after: [
      {
        method: 'POST',
        url: '/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm?_action=LOCK&accessMode=MODIFY',
        headers: {
          Accept:
            'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9',
        },
        body: undefined,
      },
    ],
  },
  {
    label: 'HandlerUnlock',
    tool: 'HandlerUnlock',
    args: {
      object_type: 'FUNCTION_MODULE',
      object_name: 'ZPIN_FG|ZPIN_FM',
      lock_handle: 'H',
    },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: false,
    checks: [META('ZPIN_FM', 'workingArea')],
    after: [
      {
        method: 'POST',
        url: '/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm?_action=UNLOCK&lockHandle=H',
        headers: { Accept: 'application/xml' },
        body: undefined,
      },
    ],
  },
  {
    label: 'HandlerWhereUsed',
    tool: 'HandlerWhereUsed',
    args: {
      object_type: 'FUNCTION_MODULE',
      function_group_name: 'ZPIN_FG',
      object_name: 'ZPIN_FM',
    },
    matched: [inGroup('ZPIN_FM', 'ZPIN_FG')],
    mismatched: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
    matchRefused: false,
    checks: [META('ZPIN_FM', 'workingArea')],
    after: [
      {
        method: 'POST',
        url: '/sap/bc/adt/repository/informationsystem/usageReferences?uri=%2Fsap%2Fbc%2Fadt%2Ffunctions%2Fgroups%2Fzpin_fg%2Ffmodules%2Fzpin_fm',
        headers: {
          Accept:
            'application/vnd.sap.adt.repository.usagereferences.result.v1+xml',
          'Content-Type':
            'application/vnd.sap.adt.repository.usagereferences.request.v1+xml',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?><usagereferences:usageReferenceRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:affectedObjects/></usagereferences:usageReferenceRequest>',
      },
    ],
  },
];

describe('a function module addressed through a group (#2)', () => {
  for (const c of CASES) {
    const refused =
      c.tool === 'UpdateFunctionModule'
        ? "UpdateFunctionModule with another group's name is refused after one metadata read, nothing written"
        : `${c.label} with another group's name is refused after the metadata read, nothing else sent`;
    it(refused, async () => {
      await runPinCase({
        tool: c.tool,
        variant: 'onprem',
        stand: 'recording',
        args: c.args,
        answers: c.mismatched,
        refusal: 'answer',
        expected: c.checks,
      });
      const { answer } = await recordCase({
        tool: c.tool,
        variant: 'onprem',
        stand: 'recording',
        args: c.args,
        answers: c.mismatched,
        expected: c.checks,
      });
      const text = answer?.content[0]?.text ?? '';
      expect(text).toContain('FUNCTION_GROUP_MISMATCH');
      expect(text).toContain('ZPIN_OTHER');
    });
    it(`${c.label} with the module's own group reads the metadata first, then sends its requests`, async () => {
      await runPinCase({
        tool: c.tool,
        variant: 'onprem',
        stand: 'recording',
        args: c.args,
        answers: c.matched,
        ...(c.matchRefused ? { refusal: 'answer' as const } : {}),
        expected: [...c.checks, ...c.after],
      });
    });
  }

  it('GetFunctionModule part metadata: the one metadata read is the answer, checked against the group given', async () => {
    const args = {
      function_group_name: 'ZPIN_FG',
      function_module_name: 'ZPIN_FM',
      part: 'metadata',
    };
    await runPinCase({
      tool: 'GetFunctionModule',
      variant: 'onprem',
      stand: 'recording',
      args,
      answers: [inGroup('ZPIN_FM', 'ZPIN_FG')],
      expected: [META('ZPIN_FM', 'active')],
    });
    await runPinCase({
      tool: 'GetFunctionModule',
      variant: 'onprem',
      stand: 'recording',
      args,
      answers: [inGroup('ZPIN_FM', 'ZPIN_OTHER')],
      refusal: 'answer',
      expected: [META('ZPIN_FM', 'active')],
    });
    const { answer } = await recordCase({
      tool: 'GetFunctionModule',
      variant: 'onprem',
      stand: 'recording',
      args,
      answers: [inGroup('ZPIN_FM', 'ZPIN_FG')],
      expected: [META('ZPIN_FM', 'active')],
    });
    const payload: unknown = JSON.parse(answer?.content[0]?.text ?? '');
    expect(Reflect.get(Object(payload), 'metadata')).toBe(
      metadataDocument('ZPIN_FM', 'ZPIN_FG'),
    );
  });

  it('GetFunctionModule at version inactive checks at that version, then reads the source', async () => {
    await runPinCase({
      tool: 'GetFunctionModule',
      variant: 'onprem',
      stand: 'recording',
      args: {
        function_group_name: 'ZPIN_FG',
        function_module_name: 'ZPIN_FM',
        version: 'inactive',
      },
      answers: [inGroup('ZPIN_FM', 'ZPIN_FG')],
      expected: [
        META('ZPIN_FM', 'inactive'),
        {
          method: 'GET',
          url: '/sap/bc/adt/functions/groups/zpin_fg/fmodules/zpin_fm/source/main?version=inactive',
          headers: { Accept: 'text/plain' },
          body: undefined,
        },
      ],
    });
  });

  it('a metadata document that names no group is refused, nothing else sent', async () => {
    const { requests, answer } = await recordCase({
      tool: 'UpdateFunctionModule',
      variant: 'onprem',
      stand: 'recording',
      args: {
        function_group_name: 'ZPIN_FG',
        function_module_name: 'ZPIN_FM',
        source_code: 'FUNCTION zpin_fm.\nENDFUNCTION.',
      },
      answers: [
        {
          data: '<?xml version="1.0" encoding="utf-8"?><fmodule:abapFunctionModule adtcore:name="ZPIN_FM" xmlns:fmodule="http://www.sap.com/adt/functions/fmodules" xmlns:adtcore="http://www.sap.com/adt/core"/>',
        },
      ],
      expected: [META('ZPIN_FM', 'workingArea')],
    });
    expect(requests).toEqual([META('ZPIN_FM', 'workingArea')]);
    const payload: unknown = JSON.parse(answer?.content[0]?.text ?? '');
    expect({
      code: Reflect.get(Object(payload), 'code'),
      step: Reflect.get(Object(payload), 'step'),
    }).toEqual({
      code: 'FUNCTION_GROUP_MISMATCH',
      step: 'check function group',
    });
  });

  it("a module that does not exist: SAP's 404 of the metadata read relayed with its key, nothing else sent", async () => {
    // Measured on premise and on the cloud (2026-11-05): the metadata read
    // of a missing module answers 404, keyed FL 110, whatever group.
    const notFound =
      '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><namespace id="com.sap.adt"/><type id="ExceptionResourceNotFound"/><message lang="EN">Function module ZPIN_FM does not exist</message><localizedMessage lang="EN">Function module ZPIN_FM does not exist</localizedMessage><properties><entry key="T100KEY-ID">FL</entry><entry key="T100KEY-NO">110</entry><entry key="T100KEY-V1">ZPIN_FM</entry></properties></exc:exception>';
    const { requests, answer } = await recordCase({
      tool: 'DeleteFunctionModule',
      variant: 'onprem',
      stand: 'recording',
      args: { function_group_name: 'ZPIN_FG', function_module_name: 'ZPIN_FM' },
      answers: [{ status: 404, statusText: 'Not Found', data: notFound }],
      expected: [META('ZPIN_FM', 'workingArea')],
    });
    expect(requests).toEqual([META('ZPIN_FM', 'workingArea')]);
    expect(answer?.isError).toBe(true);
    const payload: unknown = JSON.parse(answer?.content[0]?.text ?? '');
    const messages: unknown = Reflect.get(Object(payload), 'messages');
    const first: unknown = Array.isArray(messages) ? messages[0] : undefined;
    expect({
      step: Reflect.get(Object(payload), 'step'),
      status: Reflect.get(Object(payload), 'status'),
      code: Reflect.get(Object(payload), 'code'),
      t100: Reflect.get(Object(first), 't100'),
    }).toEqual({
      step: 'check function group',
      status: 404,
      code: undefined,
      t100: { id: 'FL', no: '110', values: ['ZPIN_FM'] },
    });
  });

  it('an async run without a group sends nothing extra', async () => {
    await runPinCase({
      tool: 'RunFunctionModuleUnitTest',
      variant: 'onprem',
      stand: 'recording',
      args: { function_module_name: 'ZPIN_FM', wait: false },
      // The installed runner answers no run id on an empty answer.
      refusal: 'answer',
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/abapunit/runs',
          headers: {
            'Content-Type': 'application/vnd.sap.adt.api.abapunit.run.v2+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:osl="http://www.sap.com/api/osl" title="ZPIN_FM" context="MCP ABAP ADT Client">\n  <aunit:options>\n    <aunit:scope ownTests="true" foreignTests="false" addForeignTestsAsPreview="true"/>\n    <aunit:riskLevel harmless="true" dangerous="true" critical="true"/>\n    <aunit:duration short="true" medium="true" long="true"/>\n  </aunit:options>\n  <osl:objectSet xsi:type="osl:flatObjectSet">\n    <osl:object name="ZPIN_FM" type="FUNC"/>\n  </osl:objectSet>\n</aunit:run>',
        },
      ],
    });
  });
});
