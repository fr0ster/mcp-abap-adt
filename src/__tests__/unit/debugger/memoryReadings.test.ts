import { corpusBody } from '../../../lib/adtCorpus';
import {
  readSnapshotList,
  readXmlDocument,
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
