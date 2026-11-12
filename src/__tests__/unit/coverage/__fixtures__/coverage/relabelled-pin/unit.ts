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
    // the DeleteThing pin, relabelled: it sends GetThing
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
  ]);
});
