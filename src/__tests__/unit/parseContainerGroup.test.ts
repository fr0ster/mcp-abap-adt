import {
  assertFunctionGroupMatches,
  parseContainerGroupName,
} from '../../handlers/function_module/shared/parseContainerGroup';

const META_SXPT = `<?xml version="1.0"?><fmodule:abapFunctionModule xmlns:adtcore="http://www.sap.com/adt/core" xmlns:fmodule="x"><adtcore:containerRef adtcore:uri="/sap/bc/adt/functions/groups/sxpt" adtcore:type="FUGR/F" adtcore:name="SXPT" adtcore:packageName="SBTC"/></fmodule:abapFunctionModule>`;
const META_NAME_FIRST = `<adtcore:containerRef adtcore:name="SXPT" adtcore:type="FUGR/F"/>`;
const META_NO_REF = `<?xml version="1.0"?><fmodule:abapFunctionModule/>`;

describe('parseContainerGroupName', () => {
  it('extracts group name when type precedes name', () => {
    expect(parseContainerGroupName(META_SXPT)).toBe('SXPT');
  });

  it('extracts group name when name precedes type', () => {
    expect(parseContainerGroupName(META_NAME_FIRST)).toBe('SXPT');
  });

  it('returns null when containerRef is missing', () => {
    expect(parseContainerGroupName(META_NO_REF)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseContainerGroupName('')).toBeNull();
    expect(parseContainerGroupName(null)).toBeNull();
    expect(parseContainerGroupName(undefined)).toBeNull();
  });
});

describe('assertFunctionGroupMatches', () => {
  it('returns real group on exact match', () => {
    expect(
      assertFunctionGroupMatches(META_SXPT, 'SXPT', 'SXPG_COMMAND_EXECUTE'),
    ).toBe('SXPT');
  });

  it('matches case-insensitively', () => {
    expect(
      assertFunctionGroupMatches(META_SXPT, 'sxpt', 'SXPG_COMMAND_EXECUTE'),
    ).toBe('SXPT');
  });

  it('throws when real group differs', () => {
    expect(() =>
      assertFunctionGroupMatches(META_SXPT, 'SXPG', 'SXPG_COMMAND_EXECUTE'),
    ).toThrow(/belongs to group SXPT, not SXPG/);
  });

  it('throws when metadata lacks containerRef', () => {
    expect(() =>
      assertFunctionGroupMatches(META_NO_REF, 'SXPT', 'SXPG_COMMAND_EXECUTE'),
    ).toThrow(/Could not determine owning function group/);
  });

  it('throws on empty metadata', () => {
    expect(() =>
      assertFunctionGroupMatches('', 'SXPT', 'SXPG_COMMAND_EXECUTE'),
    ).toThrow(/Could not determine owning function group/);
  });
});
