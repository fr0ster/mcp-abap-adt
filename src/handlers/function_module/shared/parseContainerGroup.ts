/**
 * Parse the owning function group from ADT function module metadata XML.
 *
 * The relevant element is:
 *   <adtcore:containerRef
 *      adtcore:uri="/sap/bc/adt/functions/groups/sxpt"
 *      adtcore:type="FUGR/F"
 *      adtcore:name="SXPT" .../>
 *
 * The ADT backend resolves function modules by name alone and happily returns
 * source/metadata even when the group segment of the URL is wrong. The only
 * reliable indicator of the real owning group is the `containerRef` element
 * above. Callers compare it with the caller-supplied group to reject
 * mismatched inputs instead of silently returning code from a different
 * group than requested.
 */
export function parseContainerGroupName(
  metadataXml: string | null | undefined,
): string | null {
  if (!metadataXml) return null;
  const match = metadataXml.match(
    /<adtcore:containerRef\b[^>]*\badtcore:type="FUGR\/F"[^>]*\badtcore:name="([^"]+)"/,
  );
  if (match) return match[1];
  // Attribute order is not guaranteed — try with name before type.
  const alt = metadataXml.match(
    /<adtcore:containerRef\b[^>]*\badtcore:name="([^"]+)"[^>]*\badtcore:type="FUGR\/F"/,
  );
  return alt ? alt[1] : null;
}

/**
 * Validate that the FM belongs to the expected group and return the real
 * group name from metadata. Throws when the metadata does not contain a
 * `containerRef` (so we never return unverified source) or when the real
 * group does not match the expected one (case-insensitive).
 */
export function assertFunctionGroupMatches(
  metadataXml: string | null | undefined,
  expectedGroupName: string,
  functionModuleName: string,
): string {
  const real = parseContainerGroupName(metadataXml);
  if (!real) {
    throw new Error(
      `Could not determine owning function group for ${functionModuleName} from ADT metadata. Refusing to return unverified source.`,
    );
  }
  if (real.toUpperCase() !== expectedGroupName.toUpperCase()) {
    throw new Error(
      `Function module ${functionModuleName} belongs to group ${real}, not ${expectedGroupName}.`,
    );
  }
  return real;
}
