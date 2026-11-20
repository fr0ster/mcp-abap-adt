import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  readMemorySizes,
  readSnapshotList,
  readXmlDocument,
  terseMemorySizes,
} from '../../../lib/debugger/memoryReadings';
import { child, isElement } from '../../../lib/xml/tree';
import { corpusBody } from '../../helpers/adtCorpus';
import { assertMatchObject } from '../../helpers/assertions';

it('lists the recorded snapshots of a user; none for a user with none', () => {
  const list = readSnapshotList(
    corpusBody('memory-snapshot-list--01-list-of-the-user'),
  );
  assertMatchObject(list[0], {
    id: '0CC47A1E68C11FE1B1827ADCF9D455CB',
    user: 'SAPUSER01',
    size: 168015,
  });
  assert.deepStrictEqual(
    readSnapshotList(
      corpusBody('memory-snapshot-list--02-list-of-a-user-with-none'),
    ),
    [],
  );
});
it('any document parses, its namespaces dropped', () => {
  assert.deepStrictEqual(
    readXmlDocument('<a:x xmlns:a="u"><a:y>1</a:y></a:x>'),
    {
      x: { y: '1' },
    },
  );
});

it('a blank document reads as an empty one, whitespace or none', () => {
  // The parser answers `{}` for a blank document itself: nothing of ours is
  // made in its place.
  assert.deepStrictEqual(readXmlDocument(''), {});
  assert.deepStrictEqual(readXmlDocument(' \n\t '), {});
  assert.deepStrictEqual(readSnapshotList(''), []);
});

it('the memory sizes and a created snapshot, as recorded, read as their documents', () => {
  // toEqual of nested objectContaining / any(String): the keys of each
  // level whole, the contained fields by their type or value.
  const sizes = readXmlDocument(corpusBody('debugger-memory--01-memory-sizes'));
  assert.ok(isElement(sizes));
  assert.deepStrictEqual(Object.keys(sizes), ['memorySizes']);
  const memory = child(sizes, 'memorySizes');
  assert.ok(isElement(memory));
  assert.deepStrictEqual(Object.keys(memory).sort(), [
    'abap',
    'external',
    'internal',
  ]);
  assert.equal(
    typeof child(child(memory, 'abap'), 'staticVariables'),
    'string',
  );
  assert.equal(typeof child(child(memory, 'internal'), 'used'), 'string');
  assert.ok(isElement(child(memory, 'external')));
  assertMatchObject(child(memory, 'external'), {
    numberOfInternalSessions: '1',
  });
  const created = readXmlDocument(
    corpusBody('debugger-memory--02-create-memory-snapshot'),
  );
  assert.ok(isElement(created));
  assert.deepStrictEqual(Object.keys(created), ['action']);
  const action = child(created, 'action');
  assertMatchObject(action, {
    name: 'memorySnapshot',
    isError: 'false',
    messageKind: 'info',
  });
  const data = child(action, 'data');
  assert.ok(typeof data === 'string' && data.includes('abDbgMemory_'));
});

it('the recorded memory sizes read as numbers, named after their elements', () => {
  const sizes = readMemorySizes(corpusBody('debugger-memory--01-memory-sizes'));
  assert.deepStrictEqual(sizes, {
    abap: {
      staticVariables: 272952,
      stackUsed: 41840,
      stackAllocated: 205864,
      dynamicMemoryObjectsUsed: 236362,
      dynamicMemoryObjectsAllocated: 292100,
    },
    internal: { used: 4271832, allocated: 7698616, peakUsed: 5526872 },
    external: {
      used: 4271832,
      allocated: 4938492,
      peakUsed: 5526872,
      numberOfInternalSessions: 1,
    },
  });
  assert.deepStrictEqual(terseMemorySizes(sizes), {
    abap_objects_used: 236362,
    internal_used: 4271832,
    internal_peak_used: 5526872,
  });
});
it('memory sizes of an empty or partial document read as zero', () => {
  assert.equal(readMemorySizes('').internal.used, 0);
  assert.equal(
    readMemorySizes('<dbg:memorySizes xmlns:dbg="u"/>').abap.stackUsed,
    0,
  );
});
