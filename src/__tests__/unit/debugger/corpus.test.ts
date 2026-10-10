import { corpusBody, corpusCases, corpusSidecar } from '../../../lib/adtCorpus';

describe('the debugger answers recorded on a system', () => {
  it.each([
    'debugger-run-to-line',
    'debugger-conversation',
    'debugger-kinds-and-exception',
    'debugger-message-and-objects',
    'debugger-terminate',
    'memory-snapshot-list',
  ])('%s is in the corpus', (prefix) => {
    expect(corpusCases(prefix).length).toBeGreaterThan(0);
  });

  it('the listener answer names the debuggee', () => {
    expect(
      corpusSidecar('debugger-run-to-line--02-listen').response.status,
    ).toBe(200);
    expect(corpusBody('debugger-run-to-line--02-listen')).toContain(
      '<DEBUGGEE_ID>',
    );
  });
});
