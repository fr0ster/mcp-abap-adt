import { scanLines } from '../../../lib/search-source/lineScanner';

describe('scanLines', () => {
  it('matches a single query and returns 1-based line + snippet', () => {
    const lines = ['DATA lv_foo TYPE i.', 'WRITE lv_foo.', 'ENDFORM.'];
    const r = scanLines(lines, { query: 'lv_foo', max_hits: 10 });
    expect(r.hits).toEqual([
      { line: 1, snippet: 'DATA lv_foo TYPE i.' },
      { line: 2, snippet: 'WRITE lv_foo.' },
    ]);
    expect(r.capped).toBe(false);
  });

  it('AND-matches query and query2 — both must appear on the same line', () => {
    const lines = ['CALL FUNCTION foo', 'CALL METHOD foo', 'CALL FUNCTION bar'];
    const r = scanLines(lines, {
      query: 'CALL',
      query2: 'FUNCTION',
      max_hits: 10,
    });
    expect(r.hits.map((h) => h.line)).toEqual([1, 3]);
  });

  it('drops a candidate match when any exclude is contained in the line', () => {
    const lines = [
      'WRITE foo.',
      'WRITE foo. " keep this',
      'WRITE foo. " drop_this_marker',
    ];
    const r = scanLines(lines, {
      query: 'foo',
      exclude: ['drop_this_marker'],
      max_hits: 10,
    });
    expect(r.hits.map((h) => h.line)).toEqual([1, 2]);
  });

  it('searches comments by default — matches inside col-1 `*` and full-line `"` are returned', () => {
    const lines = [
      '* TODO: handle marker_X',
      '  " marker_X again, full-line "',
      'WRITE marker_X.',
    ];
    const r = scanLines(lines, { query: 'marker_X', max_hits: 10 });
    expect(r.hits.map((h) => h.line)).toEqual([1, 2, 3]);
  });

  it('exclude_comments=true skips col-1 `*` and full-line `"`, keeps ws-prefixed `*` and inline `" comment`', () => {
    const lines = [
      '* col1 marker',
      '  " ws-prefixed full-line comment marker',
      '   * not a comment, just statement starting with * marker',
      'WRITE x. " inline marker',
    ];
    const r = scanLines(lines, {
      query: 'marker',
      exclude_comments: true,
      max_hits: 10,
    });
    expect(r.hits.map((h) => h.line)).toEqual([3, 4]);
  });

  it('max_hits caps the result and reports capped: true', () => {
    const lines = ['foo a', 'foo b', 'foo c'];
    const r = scanLines(lines, { query: 'foo', max_hits: 1 });
    expect(r.hits.map((h) => h.line)).toEqual([1]);
    expect(r.capped).toBe(true);
  });

  it('matches are case-insensitive for query, query2, and exclude', () => {
    const lines = ['CALL Function FOO', 'call function bar'];
    const r = scanLines(lines, {
      query: 'CALL',
      query2: 'function',
      exclude: ['BAR'],
      max_hits: 10,
    });
    expect(r.hits.map((h) => h.line)).toEqual([1]);
  });

  it('snippet is trimmed to 255 chars when the source line is longer', () => {
    const long = 'WRITE ' + 'X'.repeat(400);
    const r = scanLines([long], { query: 'write', max_hits: 10 });
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0].snippet.length).toBe(255);
    expect(r.hits[0].snippet.startsWith('WRITE ')).toBe(true);
  });
});
