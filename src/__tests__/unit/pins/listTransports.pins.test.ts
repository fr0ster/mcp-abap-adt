/**
 * `ListTransports`, pinned on each variant on `recordingConnection` with
 * real adt-clients code: the user's saved search configurations, read in a
 * batch envelope, then the search of the one configuration, in a second
 * envelope. SAP's answers are the corpus documents, each in its envelope.
 */
import { corpusBody } from '../../helpers/adtCorpus';
import { envelopeResponse } from '../../helpers/batchEnvelope';
import { pinCases } from '../../helpers/pinCases';

/** The saved search configurations, then the listing of the one used. */
const LISTING = [
  envelopeResponse([
    {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.sap.adt.configurations.v1+xml; charset=utf-8',
      },
      body: corpusBody(
        'read-transport-search-configurations--01-searchconfiguration-configurations',
      ),
    },
  ]),
  envelopeResponse([
    {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.sap.adt.transportorganizertree.v1+xml; charset=utf-8',
      },
      body: corpusBody(
        'read-transport-list-structure--01-cts-transportrequests',
      ),
    },
  ]),
];

describe('onprem', () => {
  pinCases([
    {
      tool: 'ListTransports',
      variant: 'onprem',
      stand: 'recording',
      args: { user: 'PIN_USER', modifiable_only: true },
      answers: LISTING,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/communication/batch',
          headers: {
            'Content-Type':
              'multipart/mixed; boundary=batch_18a4e56c-5aae-4c34-a3e6-655c414a4e69',
            Accept: 'multipart/mixed',
          },
          body: '--batch_18a4e56c-5aae-4c34-a3e6-655c414a4e69\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nGET /sap/bc/adt/cts/transportrequests/searchconfiguration/configurations HTTP/1.1\r\nAccept: application/vnd.sap.adt.configurations.v1+xml\r\n\r\n\r\n\r\n--batch_18a4e56c-5aae-4c34-a3e6-655c414a4e69--\r\n',
        },
        {
          method: 'POST',
          url: '/sap/bc/adt/communication/batch',
          headers: {
            'Content-Type':
              'multipart/mixed; boundary=batch_2b5b28b0-7c5e-4023-a5eb-b04a75cd6202',
            Accept: 'multipart/mixed',
          },
          body: '--batch_2b5b28b0-7c5e-4023-a5eb-b04a75cd6202\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nGET /sap/bc/adt/cts/transportrequests?configUri=%2Fsap%2Fbc%2Fadt%2Fcts%2Ftransportrequests%2Fsearchconfiguration%2Fconfigurations%2F22D2111643541FE1A5AA03DC2D3DE702 HTTP/1.1\r\nAccept: application/vnd.sap.adt.transportorganizertree.v1+xml\r\n\r\n\r\n\r\n--batch_2b5b28b0-7c5e-4023-a5eb-b04a75cd6202--\r\n',
        },
      ],
    },
  ]);
});

describe('cloud', () => {
  pinCases([
    {
      tool: 'ListTransports',
      variant: 'cloud',
      stand: 'recording',
      args: { user: 'PIN_USER', modifiable_only: true },
      answers: LISTING,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/communication/batch',
          headers: {
            'Content-Type':
              'multipart/mixed; boundary=batch_8ff3384f-881c-4c51-a38f-0acaf795cec6',
            Accept: 'multipart/mixed',
          },
          body: '--batch_8ff3384f-881c-4c51-a38f-0acaf795cec6\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nGET /sap/bc/adt/cts/transportrequests/searchconfiguration/configurations HTTP/1.1\r\nAccept: application/vnd.sap.adt.configurations.v1+xml\r\n\r\n\r\n\r\n--batch_8ff3384f-881c-4c51-a38f-0acaf795cec6--\r\n',
        },
        {
          method: 'POST',
          url: '/sap/bc/adt/communication/batch',
          headers: {
            'Content-Type':
              'multipart/mixed; boundary=batch_0c3145df-7b90-40c7-a1df-a0863b81f583',
            Accept: 'multipart/mixed',
          },
          body: '--batch_0c3145df-7b90-40c7-a1df-a0863b81f583\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nGET /sap/bc/adt/cts/transportrequests?configUri=%2Fsap%2Fbc%2Fadt%2Fcts%2Ftransportrequests%2Fsearchconfiguration%2Fconfigurations%2F22D2111643541FE1A5AA03DC2D3DE702 HTTP/1.1\r\nAccept: application/vnd.sap.adt.transportorganizertree.v1+xml\r\n\r\n\r\n\r\n--batch_0c3145df-7b90-40c7-a1df-a0863b81f583--\r\n',
        },
      ],
    },
  ]);
});
