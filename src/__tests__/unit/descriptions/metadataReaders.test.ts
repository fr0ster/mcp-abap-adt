/**
 * Plan step 10.6, group 4: the metadata readers' descriptions come from one
 * shape — "Reads <object> <at>" with the facts of the reader's typed result
 * (`membersOf`), or with what SAP's data holds and the fixed fact
 * `sapData` — and the version diff tools from one factory over
 * `VersionDiffResult`. Each factory is pinned on two tools of different
 * object types.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildObjectVersionTools } from '../../../handlers/common/high/objectVersionTools';
import { TOOL_DEFINITION as GetObjectVersionDiff } from '../../../handlers/common/readonly/handleGetObjectVersionDiff';
import { TOOL_DEFINITION as GetDomain } from '../../../handlers/domain/high/handleGetDomain';
import { TOOL_DEFINITION as GetEnhancementSpot } from '../../../handlers/enhancement/readonly/handleGetEnhancementSpot';
import { TOOL_DEFINITION as GetTableSettings } from '../../../handlers/table/readonly/handleGetTableSettings';
import { TOOL_DEFINITION as GetTableType } from '../../../handlers/table_type/high/handleGetTableType';
import { type MemberNouns, membersOf } from '../../../lib/description';

describe('the metadata readers', () => {
  it('a reader with no typed result names what SAP gives, then the fixed fact', () => {
    assert.equal(
      GetDomain.description,
      "[read-only] Reads an ABAP domain at the version asked, with its data type, length, output format, value table, fixed values, package and description. SAP's data as it came.",
    );
    assert.equal(
      GetTableType.description,
      "[read-only] Reads an ABAP table type at the version asked, with its element type, access, key, package and description. SAP's data as it came.",
    );
  });

  it('a typed reader states each member of its result by its noun, its lists after', () => {
    assert.equal(
      GetTableSettings.description,
      '[read-only] Reads the technical settings of an ABAP database table at the version asked: its description, data class, size category, buffering, storage type, sharing type, load unit, translation, logging and whether AMDP may write to it on ABAP Cloud.',
    );
    assert.equal(
      GetEnhancementSpot.description,
      '[read-only] Reads an enhancement spot at its active version: its name, description, type, package and interface; for each BAdI definition: its name, short text and interface; for each related link: its address, relation, media type and title.',
    );
  });

  it('a member of the result without its noun does not compile', () => {
    interface Result {
      name: string;
      items: { kind: string }[];
    }
    const nouns: MemberNouns<Result> = {
      name: 'name',
      items: { each: 'item', nouns: { kind: 'kind' } },
    };
    assert.deepStrictEqual(
      membersOf<Result>({ nouns }).map((fact) => fact.text),
      ['Its name.', 'For each item: its kind.'],
    );
    // @ts-expect-error -- `items` has no noun
    const partial: MemberNouns<Result> = { name: 'name' };
    void partial;
  });
});

describe('the version diff tools', () => {
  it('compare two versions of their object, with the facts of the diff', () => {
    const facts =
      'the changes between their sources, whether they are identical and which source came back empty.';
    const diffs = new Map(
      buildObjectVersionTools().map(({ toolDefinition }) => [
        toolDefinition.name,
        toolDefinition.description,
      ]),
    );
    assert.equal(
      diffs.get('GetClassVersionDiff'),
      `[read-only] Compares two versions of the same ABAP class, taken from its version history: ${facts}`,
    );
    assert.equal(
      diffs.get('GetDdlVersionDiff'),
      `[read-only] Compares two versions of the same CDS view (DDL source), taken from its version history: ${facts}`,
    );
    assert.equal(
      GetObjectVersionDiff.description,
      `[read-only] Compares two versions of a class, program, CDS view or other source object, taken from its version history: ${facts}`,
    );
  });
});
