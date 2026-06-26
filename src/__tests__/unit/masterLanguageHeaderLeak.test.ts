import {
  getSystemContext,
  resetSystemContextCache,
} from '../../lib/systemContext';
import { BaseMcpServer } from '../../server/BaseMcpServer';

/**
 * Regression: the `x-sap-language` header is written to the process-global
 * system-context cache. A request that omits the header must NOT inherit the
 * masterLanguage set by a previous request — otherwise objects get created
 * with the wrong original language. (See #110 review finding.)
 */
class TestServer extends BaseMcpServer {
  public applyHeaders(
    headers: Record<string, string | string[] | undefined>,
  ): void {
    this.setConnectionContextFromHeaders(headers);
  }
}

const base = {
  'x-sap-url': 'https://example.test',
  'x-sap-jwt-token': 'tok',
};

describe('x-sap-language does not leak across requests', () => {
  beforeEach(() => resetSystemContextCache());

  it('sets masterLanguage from x-sap-language', () => {
    const srv = new TestServer({ name: 'test' });
    srv.applyHeaders({ ...base, 'x-sap-language': 'DE' });
    expect(getSystemContext().masterLanguage).toBe('DE');
  });

  it('clears masterLanguage when a later request omits the header', () => {
    const srv = new TestServer({ name: 'test' });
    srv.applyHeaders({ ...base, 'x-sap-language': 'DE' });
    expect(getSystemContext().masterLanguage).toBe('DE');

    // second request, no x-sap-language → must not inherit 'DE'
    srv.applyHeaders({ ...base });
    expect(getSystemContext().masterLanguage).toBeUndefined();
  });
});
