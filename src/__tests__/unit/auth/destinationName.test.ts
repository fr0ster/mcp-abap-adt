import { assertDestinationName } from '../../../lib/auth/destinationName';

describe('assertDestinationName', () => {
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

  it('does not quote the refused name', () => {
    try {
      assertDestinationName('../secret-path', 'destination');
    } catch (e) {
      expect((e as Error).message).not.toContain('secret-path');
    }
  });
});
