/**
 * Activate family pins (plan C3; `HandlerGet` `activation_status` added in
 * C2d): each case's whole recorded request list as a literal, on
 * `recordingConnection` with real adt-clients code.
 *
 * `activation_status` reads the run once: without `with_long_polling` the
 * plain read, answered at once; with it, the long poll
 * (`?withLongPolling=true`) SAP holds until the run ends.
 */
import { pinCases } from '../../helpers/pinCases';

/** A finished run's status document. */
const FINISHED = {
  data: '<?xml version="1.0" encoding="utf-8"?><runs:run xmlns:runs="http://www.sap.com/adt/activation/runs" runs:status="finished"/>',
};

describe('activate pins', () => {
  pinCases([
    {
      tool: 'HandlerGet',
      variant: 'onprem',
      stand: 'recording',
      args: { part: 'activation_status', run_id: 'RUN0001' },
      answers: [FINISHED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/activation/runs/RUN0001',
          headers: {
            Accept:
              'application/xml, application/vnd.sap.adt.backgroundrun.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerGet',
      variant: 'cloud',
      stand: 'recording',
      args: { part: 'activation_status', run_id: 'RUN0001' },
      answers: [FINISHED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/activation/runs/RUN0001',
          headers: {
            Accept:
              'application/xml, application/vnd.sap.adt.backgroundrun.v1+xml',
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
        part: 'activation_status',
        run_id: 'RUN0001',
        with_long_polling: true,
      },
      answers: [FINISHED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/activation/runs/RUN0001?withLongPolling=true',
          headers: {
            Accept:
              'application/xml, application/vnd.sap.adt.backgroundrun.v1+xml',
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
        part: 'activation_status',
        run_id: 'RUN0001',
        with_long_polling: true,
      },
      answers: [FINISHED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/activation/runs/RUN0001?withLongPolling=true',
          headers: {
            Accept:
              'application/xml, application/vnd.sap.adt.backgroundrun.v1+xml',
          },
          body: undefined,
        },
      ],
    },
  ]);
});
