import { corpusBody } from '../../../lib/adtCorpus';
import {
  readMemorySizes,
  readSnapshotList,
  readXmlDocument,
  terseMemorySizes,
} from '../../../lib/debugger/memoryReadings';

it('lists the recorded snapshots of a user; none for a user with none', () => {
  const list = readSnapshotList(
    corpusBody('memory-snapshot-list--01-list-of-the-user'),
  );
  expect(list[0]).toMatchObject({
    id: '0CC47A1E68C11FE1B1827ADCF9D455CB',
    user: 'SAPUSER01',
    size: 168015,
  });
  expect(
    readSnapshotList(
      corpusBody('memory-snapshot-list--02-list-of-a-user-with-none'),
    ),
  ).toEqual([]);
});
it('any document parses, its namespaces dropped', () => {
  expect(readXmlDocument('<a:x xmlns:a="u"><a:y>1</a:y></a:x>')).toEqual({
    x: { y: '1' },
  });
});

it('the memory sizes and a created snapshot, as recorded, read as their documents', () => {
  expect(
    readXmlDocument(corpusBody('debugger-memory--01-memory-sizes')),
  ).toEqual({
    memorySizes: {
      abap: expect.objectContaining({ staticVariables: expect.any(String) }),
      internal: expect.objectContaining({ used: expect.any(String) }),
      external: expect.objectContaining({
        numberOfInternalSessions: '1',
      }),
    },
  });
  expect(
    readXmlDocument(corpusBody('debugger-memory--02-create-memory-snapshot')),
  ).toEqual({
    action: expect.objectContaining({
      name: 'memorySnapshot',
      isError: 'false',
      messageKind: 'info',
      data: expect.stringContaining('abDbgMemory_'),
    }),
  });
});

it('the recorded memory sizes read as numbers, named after their elements', () => {
  const sizes = readMemorySizes(corpusBody('debugger-memory--01-memory-sizes'));
  expect(sizes).toEqual({
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
  expect(terseMemorySizes(sizes)).toEqual({
    abap_objects_used: 236362,
    internal_used: 4271832,
    internal_peak_used: 5526872,
  });
});
it('memory sizes of an empty or partial document read as zero', () => {
  expect(readMemorySizes('').internal.used).toBe(0);
  expect(
    readMemorySizes('<dbg:memorySizes xmlns:dbg="u"/>').abap.stackUsed,
  ).toBe(0);
});
