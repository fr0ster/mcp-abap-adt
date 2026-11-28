/**
 * What a core tool is served with beside the read envelopes (spec §5.1,
 * §5.2), built in one place for the server's registration and the tool-docs
 * generator alike, so the listings and the served tools cannot drift: an
 * admitted read's description ends with its envelope note and its schema
 * declares `envelope_handle`; every other core tool's schema is loose (a
 * strict one stays strict) and its description is its own.
 */
import type * as z from 'zod';
import { partsOfDescription, toolDescription } from '../description';
import { envelopable } from '../description/notes';
import { envelopeSchemaOf } from './envelopeTools';
import { envelopeSentence } from './sentence';

/**
 * `description` with its envelope note appended when the tool is admitted
 * into an envelope: a note, so the served text stays an assembled
 * description. Unchanged otherwise.
 */
export function envelopedDescription(
  description: string,
  tool: string,
  admitted: boolean,
): string {
  if (!admitted) return description;
  const note = envelopable(tool);
  if (note === undefined) return description;
  const parts = partsOfDescription(description);
  return parts === undefined
    ? `${description.trimEnd()} ${note.text}`
    : toolDescription({ ...parts, notes: [...(parts.notes ?? []), note] });
}

/** A core tool's served description and schema beside the read envelopes. */
export function envelopeSurfaceOf(tool: {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodObject;
}): { description: string; inputSchema: z.ZodObject } {
  const admitted = envelopeSentence(tool.name) !== undefined;
  return {
    description: envelopedDescription(tool.description, tool.name, admitted),
    inputSchema: envelopeSchemaOf(tool.inputSchema, admitted),
  };
}
