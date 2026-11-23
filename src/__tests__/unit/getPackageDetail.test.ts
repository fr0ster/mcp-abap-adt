/**
 * GetPackage at each level (Codex round 7): terse its facts as `#` lines
 * and its sub-packages as TSV rows, name and description — every one, by
 * the listing writer; medium and full each sub-package written as
 * a row under the metadata.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleGetPackage } from '../../handlers/package/high/handleGetPackage';
import { declareSystemKind } from '../../lib/systemKind';
import { recordingConnection } from '../helpers/recordingConnection';

process.env.SAP_SYSTEM_TYPE = 'onprem';

const METADATA =
  '<?xml version="1.0" encoding="utf-8"?><pak:package xmlns:pak="http://www.sap.com/adt/packages" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZPKG" adtcore:description="A package" adtcore:type="DEVC/K">' +
  '<pak:subPackages><pak:packageRef adtcore:name="ZSUB_A" adtcore:description="First"/><pak:packageRef adtcore:name="ZSUB_B" adtcore:description="Second"/></pak:subPackages>' +
  '</pak:package>';

async function at(detail: 'terse' | 'medium' | 'full') {
  const connection = recordingConnection([{ data: METADATA }]);
  declareSystemKind(connection, 'onprem');
  const answered = await handleGetPackage(
    { connection, logger: undefined } as never,
    { package_name: 'zpkg', detail } as never,
  );
  assert.equal(answered.isError, false, answered.content[0]?.text);
  return answered.content[0]?.text ?? '';
}

describe('GetPackage detail', () => {
  it('terse: the sub-packages as rows, name and description, not a count', async () => {
    const lines = (await at('terse')).split('\n');
    assert.equal(lines[0], '# package ZPKG');
    assert.ok(lines.includes('sub_package\tdescription'), lines.join('\n'));
    assert.ok(lines.includes('ZSUB_A\tFirst'), lines.join('\n'));
    assert.ok(lines.includes('ZSUB_B\tSecond'), lines.join('\n'));
    assert.ok(!lines.some((l) => l.startsWith('# sub_package_count')));
  });

  for (const detail of ['medium', 'full'] as const) {
    it(`${detail}: every sub-package under the metadata`, async () => {
      const answer = JSON.parse(await at(detail));
      assert.deepStrictEqual(
        answer.metadata.sub_packages.map((s: { name: string }) => s.name),
        ['ZSUB_A', 'ZSUB_B'],
      );
    });
  }
});
