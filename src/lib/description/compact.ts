/**
 * The parts of the compact tools' descriptions (plan step 10.4, compact
 * descriptions): a compact tool, or one value of its action, operation or
 * part, states the function of the full tool it maps to, in that tool's own
 * assembled parts — its purpose and its facts — so the two cannot drift.
 */

import {
  type DescriptionParts,
  partsOfDescription,
  toolDescription,
} from './toolDescription';

/**
 * The parts a full tool's description was assembled from. Every full tool
 * is assembled (plan step 10.6), so a description without parts is a
 * defect of the tool named, refused where the compact tool is defined.
 */
export function assembledParts(description: string): DescriptionParts {
  const parts = partsOfDescription(description);
  if (parts === undefined) {
    throw new Error(
      `the description "${description.slice(0, 60)}" is not assembled`,
    );
  }
  return parts;
}

/**
 * A compact tool that does what one full tool does: that tool's parts
 * (its batch note is the serving server's, never a definition's); `own`
 * replaces a part where the compact tool's differs (its purpose, its notes).
 */
export function compactOf(
  description: string,
  own: Partial<DescriptionParts> = {},
): string {
  return toolDescription({ ...assembledParts(description), ...own });
}
