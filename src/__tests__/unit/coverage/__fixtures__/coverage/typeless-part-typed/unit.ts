import { pinCases } from '../../../../../helpers/pinCases';
describe('thing pins', () => {
  pinCases([
    {
      tool: 'GetThing',
      variant: 'onprem',
      stand: 'recording',
      args: { thing_name: 'ZTHING' },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/things/zthing',
          headers: {},
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetThing',
      variant: 'cloud',
      stand: 'recording',
      args: { thing_name: 'ZTHING' },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/things/zthing',
          headers: {},
          body: undefined,
        },
      ],
    },
    {
      tool: 'DeleteThing',
      variant: 'onprem',
      stand: 'recording',
      args: { thing_name: 'ZTHING' },
      expected: [
        {
          method: 'DELETE',
          url: '/sap/bc/adt/things/zthing',
          headers: {},
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerGet',
      variant: 'onprem',
      stand: 'recording',
      args: { object_type: 'CLASS', part: 'source', class_name: 'ZCL' },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/things/zthing',
          headers: {},
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerGet',
      variant: 'onprem',
      stand: 'recording',
      args: { part: 'object_structure', object_adt_type: 'CLAS/OC', object_name: 'ZCL' },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/things/zthing',
          headers: {},
          body: undefined,
        },
      ],
    },
    // a typeless part pinned under a type
    {
      tool: 'HandlerGet',
      variant: 'onprem',
      stand: 'recording',
      args: { object_type: 'CLASS', part: 'object_structure', object_name: 'ZCL' },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/things/zthing',
          headers: {},
          body: undefined,
        },
      ],
    },
  ]);
});
