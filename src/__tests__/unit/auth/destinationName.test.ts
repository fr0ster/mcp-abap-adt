import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { assertDestinationName } from '../../../lib/auth/destinationName';
import { assertThrows } from '../../helpers/assertions';

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

  for (const [_label, name] of refused) {
    it(format('refuses %s, naming its source', _label), () => {
      assertThrows(
        () => assertDestinationName(name, 'x-mcp-destination'),
        /^x-mcp-destination: /,
      );
      assertThrows(() => assertDestinationName(name, '--mcp'), /^--mcp: /);
    });
  }

  for (const name of ['dev', 'DEV_1', 'a-b.c', 'x1']) {
    it(format('accepts %s', name), () => {
      assertDestinationName(name, 'destination');
    });
  }

  it('does not quote the refused name', () => {
    try {
      assertDestinationName('../secret-path', 'destination');
    } catch (e) {
      assert.ok(!(e as Error).message.includes('secret-path'));
    }
  });
});
