import fs from 'node:fs';
import { assertDestinationName } from '../../../lib/auth/destinationName';

describe('assertDestinationName', () => {
  afterEach(() => jest.restoreAllMocks());

  const refused: Array<[string, string]> = [
    ['empty', ''],
    ['a separator', 'a/b'],
    ['a backslash', 'a\\b'],
    ['a parent path', '../../etc/x'],
    ['an embedded ..', 'a..b'],
    ['a leading dot', '.hidden'],
    ['a space', 'a b'],
    ['a NUL', 'a\0b'],
    ['a colon', 'a:b'],
  ];

  it.each(refused)('refuses %s, naming its source', (_label, name) => {
    expect(() => assertDestinationName(name, 'x-mcp-destination')).toThrow(
      /^x-mcp-destination: /,
    );
    expect(() => assertDestinationName(name, '--mcp')).toThrow(/^--mcp: /);
  });

  it.each(['dev', 'DEV_1', 'a-b.c', 'x1'])('accepts %s', (name) => {
    expect(() => assertDestinationName(name, 'destination')).not.toThrow();
  });

  it('touches no file for a refused name', () => {
    const spies = [
      jest.spyOn(fs, 'existsSync'),
      jest.spyOn(fs, 'readFileSync'),
      jest.spyOn(fs, 'statSync'),
    ];
    expect(() => assertDestinationName('../x', 'destination')).toThrow();
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it('does not quote the refused name', () => {
    try {
      assertDestinationName('../secret-path', 'destination');
    } catch (e) {
      expect((e as Error).message).not.toContain('secret-path');
    }
  });
});
