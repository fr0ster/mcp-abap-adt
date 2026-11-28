/**
 * `--requests-in-flight` / `MCP_REQUESTS_IN_FLIGHT` / YAML
 * `requests.inFlight` (#391, the owner): the requests a call keeps in flight
 * at once where it reads several objects one request each. The consumer's,
 * like `batch.partsPerEnvelope`; no default — absent, one at a time.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HTTP_PARAMETERS } from '../../../server-runtime/src/http/config/httpParameters';
import { SSE_PARAMETERS } from '../../../server-runtime/src/sse/config/sseParameters';
import { CORE_PARAMETERS } from '../../../server-runtime/src/stdio/config/coreParameters';
import {
  ParameterRefusal,
  REQUESTS_IN_FLIGHT_ROW,
  readParameters,
  type YamlConfig,
} from '../../lib/config';
import { requestsInFlightOf } from '../../lib/connectionKind';

const read = (
  argv: string[],
  env: NodeJS.ProcessEnv = {},
  yaml: YamlConfig | null = null,
) =>
  readParameters(
    {
      program: 'requests-in-flight',
      rows: [REQUESTS_IN_FLIGHT_ROW],
      removed: [],
    },
    argv,
    env,
    yaml,
  ).requestsInFlight;

describe('the requests in flight are the consumer’s', () => {
  it('not given: no default', () => {
    assert.equal(read([]), undefined);
    assert.equal(REQUESTS_IN_FLIGHT_ROW.default, undefined);
  });

  it('the CLI beats the environment, which beats YAML', () => {
    const yaml = { requests: { inFlight: 30 } };
    const env = { MCP_REQUESTS_IN_FLIGHT: '20' };
    assert.equal(read(['--requests-in-flight=10'], env, yaml), 10);
    assert.equal(read([], env, yaml), 20);
    assert.equal(read([], {}, yaml), 30);
  });

  for (const value of ['0', '-3', 'abc', '2.5']) {
    it(`"${value}" is refused, the value not echoed`, () => {
      assert.throws(
        () => read([`--requests-in-flight=${value}`]),
        (error: unknown) =>
          error instanceof ParameterRefusal &&
          error.words ===
            'Invalid --requests-in-flight: must be a positive whole number of requests',
      );
    });
  }

  it("an embedder's option: a positive whole number, else refused", () => {
    assert.equal(requestsInFlightOf(4, 'requestsInFlight'), 4);
    for (const value of [0, -1, 2.5, Number.NaN]) {
      assert.throws(() => requestsInFlightOf(value, 'requestsInFlight'));
    }
  });

  it('every binary reads it', () => {
    for (const table of [CORE_PARAMETERS, HTTP_PARAMETERS, SSE_PARAMETERS]) {
      assert.ok(table.rows.includes(REQUESTS_IN_FLIGHT_ROW));
    }
  });
});
