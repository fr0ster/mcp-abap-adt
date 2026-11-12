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
      tool: 'GetThing',
      variant: 'onprem',
      stand: 'recording',
      args: { thing_name: 'ZTHING' },
      before: [{ tool: 'GetThing', args: { thing_name: 'ZTHING' } }],
      bind: { object_type: { from: 0, field: 'type' } },
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
