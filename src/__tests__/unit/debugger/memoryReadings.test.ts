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
