/**
 * `GetObjectDraft` and `HandlerGet` `part: 'draft'`, pinned by literal: one
 * key per type each reads, per variant. Each part of the object is read at
 * `version=active`, `inactive` and `workingArea`, all sent together, in the
 * order of its parts (on premise a class's includes; on the cloud its main
 * source too). The literals are the requests the base run recorded
 * (`tests/fixtures/tools/changed-handler-requests.json`).
 */

import { pinCases } from '../../helpers/pinCases';

pinCases([
  {
    tool: 'HandlerGet',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'PROGRAM', part: 'draft', program_name: 'PROG_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/programs/programs/prog_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/programs/programs/prog_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/programs/programs/prog_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'PROGRAM', object_name: 'PROG_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/programs/programs/prog_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/programs/programs/prog_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/programs/programs/prog_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'INCLUDE', part: 'draft', include_name: 'INCL_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/programs/includes/incl_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/programs/includes/incl_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/programs/includes/incl_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'INCLUDE', object_name: 'INCL_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/programs/includes/incl_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/programs/includes/incl_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/programs/includes/incl_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'INTERFACE', part: 'draft', interface_name: 'INTF_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/interfaces/intf_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/interfaces/intf_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/interfaces/intf_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'INTERFACE', object_name: 'INTF_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/interfaces/intf_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/interfaces/intf_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/interfaces/intf_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'CLASS', part: 'draft', class_name: 'CLAS_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/implementations?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/implementations?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/implementations?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/definitions?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/definitions?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/definitions?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/testclasses?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/testclasses?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/testclasses?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/macros?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/macros?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/macros?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'CLASS', object_name: 'CLAS_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/implementations?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/implementations?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/implementations?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/definitions?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/definitions?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/definitions?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/testclasses?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/testclasses?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/testclasses?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/macros?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/macros?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/macros?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'onprem',
    stand: 'recording',
    args: {
      object_type: 'BEHAVIOR_IMPLEMENTATION',
      part: 'draft',
      behavior_implementation_name: 'BIMP_A',
    },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/implementations?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/implementations?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/implementations?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/definitions?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/definitions?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/definitions?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/testclasses?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/testclasses?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/testclasses?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/macros?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/macros?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/macros?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'BEHAVIOR_IMPLEMENTATION', object_name: 'BIMP_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/implementations?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/implementations?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/implementations?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/definitions?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/definitions?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/definitions?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/testclasses?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/testclasses?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/testclasses?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/macros?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/macros?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/macros?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'onprem',
    stand: 'recording',
    args: {
      object_type: 'FUNCTION_MODULE',
      part: 'draft',
      function_module_name: 'FM_A',
      function_group_name: 'FUGR_A',
    },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a/fmodules/fm_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a/fmodules/fm_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a/fmodules/fm_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'onprem',
    stand: 'recording',
    args: {
      object_type: 'FUNCTION_MODULE',
      object_name: 'FM_A',
      function_group_name: 'FUGR_A',
    },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a/fmodules/fm_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a/fmodules/fm_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a/fmodules/fm_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'onprem',
    stand: 'recording',
    args: {
      object_type: 'FUNCTION_GROUP',
      part: 'draft',
      function_group_name: 'FUGR_A',
    },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a?version=active',
        headers: { Accept: '*/*' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a?version=inactive',
        headers: { Accept: '*/*' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a?version=workingArea',
        headers: { Accept: '*/*' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'FUNCTION_GROUP', object_name: 'FUGR_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a?version=active',
        headers: { Accept: '*/*' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a?version=inactive',
        headers: { Accept: '*/*' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a?version=workingArea',
        headers: { Accept: '*/*' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'DDL', part: 'draft', ddl_name: 'DDL_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddl/sources/ddl_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddl/sources/ddl_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddl/sources/ddl_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'DDL', object_name: 'DDL_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddl/sources/ddl_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddl/sources/ddl_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddl/sources/ddl_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'onprem',
    stand: 'recording',
    args: {
      object_type: 'BEHAVIOR_DEFINITION',
      part: 'draft',
      behavior_definition_name: 'BDEF_A',
    },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/bo/behaviordefinitions/bdef_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/bo/behaviordefinitions/bdef_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/bo/behaviordefinitions/bdef_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'BEHAVIOR_DEFINITION', object_name: 'BDEF_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/bo/behaviordefinitions/bdef_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/bo/behaviordefinitions/bdef_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/bo/behaviordefinitions/bdef_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'onprem',
    stand: 'recording',
    args: {
      object_type: 'METADATA_EXTENSION',
      part: 'draft',
      metadata_extension_name: 'DDLX_A',
    },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddlx/sources/ddlx_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddlx/sources/ddlx_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddlx/sources/ddlx_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'METADATA_EXTENSION', object_name: 'DDLX_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddlx/sources/ddlx_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddlx/sources/ddlx_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddlx/sources/ddlx_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'onprem',
    stand: 'recording',
    args: {
      object_type: 'SERVICE_DEFINITION',
      part: 'draft',
      service_definition_name: 'SRVD_A',
    },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/srvd/sources/srvd_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/srvd/sources/srvd_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/srvd/sources/srvd_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'SERVICE_DEFINITION', object_name: 'SRVD_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/srvd/sources/srvd_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/srvd/sources/srvd_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/srvd/sources/srvd_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'TABLE', part: 'draft', table_name: 'TAB_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tables/tab_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tables/tab_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tables/tab_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'TABLE', object_name: 'TAB_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tables/tab_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tables/tab_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tables/tab_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'STRUCTURE', part: 'draft', structure_name: 'STRU_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/structures/stru_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/structures/stru_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/structures/stru_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'STRUCTURE', object_name: 'STRU_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/structures/stru_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/structures/stru_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/structures/stru_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'DOMAIN', part: 'draft', domain_name: 'DOMA_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/domains/doma_a?version=active',
        headers: {
          Accept:
            'application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml',
        },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/domains/doma_a?version=inactive',
        headers: {
          Accept:
            'application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml',
        },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/domains/doma_a?version=workingArea',
        headers: {
          Accept:
            'application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml',
        },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'DOMAIN', object_name: 'DOMA_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/domains/doma_a?version=active',
        headers: {
          Accept:
            'application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml',
        },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/domains/doma_a?version=inactive',
        headers: {
          Accept:
            'application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml',
        },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/domains/doma_a?version=workingArea',
        headers: {
          Accept:
            'application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml',
        },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'onprem',
    stand: 'recording',
    args: {
      object_type: 'DATA_ELEMENT',
      part: 'draft',
      data_element_name: 'DTEL_A',
    },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/dataelements/dtel_a?version=active',
        headers: {
          Accept:
            'application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml',
        },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/dataelements/dtel_a?version=inactive',
        headers: {
          Accept:
            'application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml',
        },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/dataelements/dtel_a?version=workingArea',
        headers: {
          Accept:
            'application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml',
        },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'DATA_ELEMENT', object_name: 'DTEL_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/dataelements/dtel_a?version=active',
        headers: {
          Accept:
            'application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml',
        },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/dataelements/dtel_a?version=inactive',
        headers: {
          Accept:
            'application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml',
        },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/dataelements/dtel_a?version=workingArea',
        headers: {
          Accept:
            'application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml',
        },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'onprem',
    stand: 'recording',
    args: {
      object_type: 'TABLE_TYPE',
      part: 'draft',
      table_type_name: 'TTYP_A',
    },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tabletypes/ttyp_a?version=active',
        headers: { Accept: 'application/vnd.sap.adt.tabletype.v1+xml' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tabletypes/ttyp_a?version=inactive',
        headers: { Accept: 'application/vnd.sap.adt.tabletype.v1+xml' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tabletypes/ttyp_a?version=workingArea',
        headers: { Accept: 'application/vnd.sap.adt.tabletype.v1+xml' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'TABLE_TYPE', object_name: 'TTYP_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tabletypes/ttyp_a?version=active',
        headers: { Accept: 'application/vnd.sap.adt.tabletype.v1+xml' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tabletypes/ttyp_a?version=inactive',
        headers: { Accept: 'application/vnd.sap.adt.tabletype.v1+xml' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tabletypes/ttyp_a?version=workingArea',
        headers: { Accept: 'application/vnd.sap.adt.tabletype.v1+xml' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'INTERFACE', part: 'draft', interface_name: 'INTF_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/interfaces/intf_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/interfaces/intf_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/interfaces/intf_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'INTERFACE', object_name: 'INTF_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/interfaces/intf_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/interfaces/intf_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/interfaces/intf_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'CLASS', part: 'draft', class_name: 'CLAS_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/implementations?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/implementations?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/implementations?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/definitions?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/definitions?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/definitions?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/testclasses?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/testclasses?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/testclasses?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'CLASS', object_name: 'CLAS_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/implementations?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/implementations?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/implementations?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/definitions?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/definitions?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/definitions?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/testclasses?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/testclasses?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/clas_a/includes/testclasses?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'cloud',
    stand: 'recording',
    args: {
      object_type: 'BEHAVIOR_IMPLEMENTATION',
      part: 'draft',
      behavior_implementation_name: 'BIMP_A',
    },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/implementations?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/implementations?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/implementations?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/definitions?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/definitions?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/definitions?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/testclasses?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/testclasses?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/testclasses?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'BEHAVIOR_IMPLEMENTATION', object_name: 'BIMP_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/implementations?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/implementations?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/implementations?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/definitions?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/definitions?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/definitions?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/testclasses?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/testclasses?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/bimp_a/includes/testclasses?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'cloud',
    stand: 'recording',
    args: {
      object_type: 'FUNCTION_MODULE',
      part: 'draft',
      function_module_name: 'FM_A',
      function_group_name: 'FUGR_A',
    },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a/fmodules/fm_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a/fmodules/fm_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a/fmodules/fm_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'cloud',
    stand: 'recording',
    args: {
      object_type: 'FUNCTION_MODULE',
      object_name: 'FM_A',
      function_group_name: 'FUGR_A',
    },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a/fmodules/fm_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a/fmodules/fm_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a/fmodules/fm_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'cloud',
    stand: 'recording',
    args: {
      object_type: 'FUNCTION_GROUP',
      part: 'draft',
      function_group_name: 'FUGR_A',
    },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a?version=active',
        headers: { Accept: '*/*' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a?version=inactive',
        headers: { Accept: '*/*' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a?version=workingArea',
        headers: { Accept: '*/*' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'FUNCTION_GROUP', object_name: 'FUGR_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a?version=active',
        headers: { Accept: '*/*' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a?version=inactive',
        headers: { Accept: '*/*' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/fugr_a?version=workingArea',
        headers: { Accept: '*/*' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'DDL', part: 'draft', ddl_name: 'DDL_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddl/sources/ddl_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddl/sources/ddl_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddl/sources/ddl_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'DDL', object_name: 'DDL_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddl/sources/ddl_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddl/sources/ddl_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddl/sources/ddl_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'cloud',
    stand: 'recording',
    args: {
      object_type: 'BEHAVIOR_DEFINITION',
      part: 'draft',
      behavior_definition_name: 'BDEF_A',
    },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/bo/behaviordefinitions/bdef_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/bo/behaviordefinitions/bdef_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/bo/behaviordefinitions/bdef_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'BEHAVIOR_DEFINITION', object_name: 'BDEF_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/bo/behaviordefinitions/bdef_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/bo/behaviordefinitions/bdef_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/bo/behaviordefinitions/bdef_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'cloud',
    stand: 'recording',
    args: {
      object_type: 'METADATA_EXTENSION',
      part: 'draft',
      metadata_extension_name: 'DDLX_A',
    },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddlx/sources/ddlx_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddlx/sources/ddlx_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddlx/sources/ddlx_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'METADATA_EXTENSION', object_name: 'DDLX_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddlx/sources/ddlx_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddlx/sources/ddlx_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/ddlx/sources/ddlx_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'cloud',
    stand: 'recording',
    args: {
      object_type: 'SERVICE_DEFINITION',
      part: 'draft',
      service_definition_name: 'SRVD_A',
    },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/srvd/sources/srvd_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/srvd/sources/srvd_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/srvd/sources/srvd_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'SERVICE_DEFINITION', object_name: 'SRVD_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/srvd/sources/srvd_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/srvd/sources/srvd_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/srvd/sources/srvd_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'TABLE', part: 'draft', table_name: 'TAB_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tables/tab_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tables/tab_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tables/tab_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'TABLE', object_name: 'TAB_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tables/tab_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tables/tab_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tables/tab_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'STRUCTURE', part: 'draft', structure_name: 'STRU_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/structures/stru_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/structures/stru_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/structures/stru_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'STRUCTURE', object_name: 'STRU_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/structures/stru_a/source/main?version=active',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/structures/stru_a/source/main?version=inactive',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/structures/stru_a/source/main?version=workingArea',
        headers: { Accept: 'text/plain' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'DOMAIN', part: 'draft', domain_name: 'DOMA_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/domains/doma_a?version=active',
        headers: {
          Accept:
            'application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml',
        },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/domains/doma_a?version=inactive',
        headers: {
          Accept:
            'application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml',
        },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/domains/doma_a?version=workingArea',
        headers: {
          Accept:
            'application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml',
        },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'DOMAIN', object_name: 'DOMA_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/domains/doma_a?version=active',
        headers: {
          Accept:
            'application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml',
        },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/domains/doma_a?version=inactive',
        headers: {
          Accept:
            'application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml',
        },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/domains/doma_a?version=workingArea',
        headers: {
          Accept:
            'application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml',
        },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'cloud',
    stand: 'recording',
    args: {
      object_type: 'DATA_ELEMENT',
      part: 'draft',
      data_element_name: 'DTEL_A',
    },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/dataelements/dtel_a?version=active',
        headers: {
          Accept:
            'application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml',
        },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/dataelements/dtel_a?version=inactive',
        headers: {
          Accept:
            'application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml',
        },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/dataelements/dtel_a?version=workingArea',
        headers: {
          Accept:
            'application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml',
        },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'DATA_ELEMENT', object_name: 'DTEL_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/dataelements/dtel_a?version=active',
        headers: {
          Accept:
            'application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml',
        },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/dataelements/dtel_a?version=inactive',
        headers: {
          Accept:
            'application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml',
        },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/dataelements/dtel_a?version=workingArea',
        headers: {
          Accept:
            'application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml',
        },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerGet',
    variant: 'cloud',
    stand: 'recording',
    args: {
      object_type: 'TABLE_TYPE',
      part: 'draft',
      table_type_name: 'TTYP_A',
    },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tabletypes/ttyp_a?version=active',
        headers: { Accept: 'application/vnd.sap.adt.tabletype.v1+xml' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tabletypes/ttyp_a?version=inactive',
        headers: { Accept: 'application/vnd.sap.adt.tabletype.v1+xml' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tabletypes/ttyp_a?version=workingArea',
        headers: { Accept: 'application/vnd.sap.adt.tabletype.v1+xml' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectDraft',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'TABLE_TYPE', object_name: 'TTYP_A' },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tabletypes/ttyp_a?version=active',
        headers: { Accept: 'application/vnd.sap.adt.tabletype.v1+xml' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tabletypes/ttyp_a?version=inactive',
        headers: { Accept: 'application/vnd.sap.adt.tabletype.v1+xml' },
        body: undefined,
      },
      {
        method: 'GET',
        url: '/sap/bc/adt/ddic/tabletypes/ttyp_a?version=workingArea',
        headers: { Accept: 'application/vnd.sap.adt.tabletype.v1+xml' },
        body: undefined,
      },
    ],
  },
]);
