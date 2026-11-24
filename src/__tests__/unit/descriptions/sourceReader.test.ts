/**
 * The source readers' factories (plan 10.6, group (3)): two tools of
 * different object types each, their descriptions pinned.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TOOL_DEFINITION as GET_CLASS } from '../../../handlers/class/high/handleGetClass';
import { buildObjectVersionTools } from '../../../handlers/common/high/objectVersionTools';
import { TOOL_DEFINITION as GET_DDL } from '../../../handlers/ddl/high/handleGetDdl';
import { TOOL_DEFINITION as GET_INCLUDE } from '../../../handlers/include/readonly/handleGetInclude';

const RANGE =
  'With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source.';
const METADATA =
  'Or, when asked, its metadata: its package, person responsible and description.';

/** A per-type version tool's description, by its name. */
function versionTool(name: string): string {
  const entry = buildObjectVersionTools().find(
    (each) => each.toolDefinition.name === name,
  );
  assert.ok(entry !== undefined, name);
  return entry.toolDefinition.description;
}

describe('sourceReader', () => {
  it('reads the source of a class and of a CDS view: its source, the version, a range, its metadata', () => {
    assert.equal(
      GET_CLASS.description,
      `[read-only] Reads the source of an ABAP class at the version asked, or its metadata. Its source code and the version read. ${RANGE} ${METADATA}`,
    );
    assert.equal(
      GET_DDL.description,
      `[read-only] Reads the source of a CDS view or classic DDL view at the version asked, or its metadata. Its source code and the version read. ${RANGE} ${METADATA}`,
    );
  });

  it('a reader answering the source alone states the source alone', () => {
    assert.equal(
      GET_INCLUDE.description,
      `[read-only] Reads the source of an ABAP include at the version asked, or its metadata. Its source code. With a range asked, only that part of the source. ${METADATA}`,
    );
  });
});

describe('versionHistoryReader', () => {
  it('lists the version history of a class and of a CDS view', () => {
    const facts =
      "For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description.";
    assert.equal(
      versionTool('GetClassVersions'),
      `[read-only] Lists the version history of an ABAP class. ${facts}`,
    );
    assert.equal(
      versionTool('GetDdlVersions'),
      `[read-only] Lists the version history of a CDS view (DDL source). ${facts}`,
    );
  });
});

describe('versionSourceReader', () => {
  it('reads one version of a class and of a CDS view', () => {
    const facts = 'The reference of the version read and its source code.';
    assert.equal(
      versionTool('GetClassVersionSource'),
      `[read-only] Reads the source of one version of an ABAP class, from its version history. ${facts}`,
    );
    assert.equal(
      versionTool('GetDdlVersionSource'),
      `[read-only] Reads the source of one version of a CDS view (DDL source), from its version history. ${facts}`,
    );
  });
});
