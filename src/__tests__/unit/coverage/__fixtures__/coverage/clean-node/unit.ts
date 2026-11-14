import { after, before, suite } from 'node:test';
import { pinCases } from '../../../../../helpers/pinCases';

suite('thing pins', () => {
  before(() => undefined);
  after(() => undefined);
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
  ]);
});
