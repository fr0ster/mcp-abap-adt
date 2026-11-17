/**
 * The argument rules a tool's zod schema states, so that its schema stays
 * the one check of a call (24.0.0): a required text that may not be blank,
 * and an object-level rule (`superRefine`) for what one field cannot say
 * alone — "exactly one of", a value list of the variant. A refusal names
 * the argument and the rule, in the words the handlers used to answer.
 *
 * A schema with an object-level rule cannot be `.omit`ted (zod 4), and a
 * listed long tool is listed without `background` where no background run
 * can be read: such a schema is built with its in-the-call twin
 * (`withInCallSchema`), which `schemaWithoutBackground` hands out.
 */

import * as z from 'zod';
import type { AbapSystemKind } from '../systemKind.js';

/**
 * A text argument that is required and not blank: absent, not a string, or
 * blank (spaces only), it is refused in `words`.
 */
export function requiredText(words: string) {
  return z
    .string({ error: words })
    .refine((value) => value.trim() !== '', { message: words });
}

/**
 * An optional text argument that, when given, is not blank: given blank,
 * it is refused in `words`.
 */
export function nonBlankText(words: string) {
  return z
    .string()
    .refine((value) => value.trim() !== '', { message: words })
    .optional();
}

/** A text the call states: a string that is not blank. */
export function stated(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** The schema each listed schema is listed as without `background`. */
const IN_THE_CALL = new WeakMap<z.ZodObject, z.ZodObject>();

/**
 * `listed` (a long tool's schema, with `background`), with `inCall` — the
 * same fields and rules without it — recorded as the schema it is listed
 * as where no background run can be read.
 */
export function withInCallSchema<L extends z.ZodObject>(
  listed: L,
  inCall: z.ZodObject,
): L {
  IN_THE_CALL.set(listed, inCall);
  return listed;
}

/** The schema recorded for `listed` without `background`, if any. */
export function inCallSchemaOf(listed: z.ZodObject): z.ZodObject | undefined {
  return IN_THE_CALL.get(listed);
}

/** A variant a rule of a type list is stated on (`undefined`: none stated). */
export type RuleVariant = AbapSystemKind | undefined;

/**
 * The definition parts of a tool one of whose rules depends on the variant
 * (a type list): `schemaOn(variant)` built on no variant (the list unread:
 * no variant is stated) as the definition's own schema, and on each
 * variant as that variant's, the description the same on both.
 */
export function onEveryVariant<S extends z.ZodObject>(
  description: string,
  schemaOn: (variant: RuleVariant) => S,
): {
  readonly description: string;
  readonly inputSchema: S;
  readonly variants: {
    readonly [V in AbapSystemKind]: {
      readonly description: string;
      readonly inputSchema: S;
    };
  };
} {
  return {
    description,
    inputSchema: schemaOn(undefined),
    variants: {
      onprem: { description, inputSchema: schemaOn('onprem') },
      cloud: { description, inputSchema: schemaOn('cloud') },
    },
  };
}

/**
 * `schema` (a narrowed listing of a tool) with the object-level rules of
 * `rules` (the tool's own schema on the same variant): the deny list keeps
 * the rules it does not narrow. Unchanged where `rules` has none, or
 * `schema` states its own (a builder that applies them itself).
 */
export function withRulesOf(
  rules: z.ZodObject,
  schema: z.ZodObject,
): z.ZodObject {
  if (
    (rules._zod.def.checks ?? []).length === 0 ||
    (schema._zod.def.checks ?? []).length > 0
  ) {
    return schema;
  }
  // The narrowed value is one the tool's own schema takes: its rules read it.
  const ruling = (value: object, ctx: z.RefinementCtx) => {
    const parsed = rules.safeParse(value);
    if (parsed.success) return;
    for (const issue of parsed.error.issues) {
      ctx.addIssue({
        code: 'custom',
        message: issue.message,
        path: issue.path,
      });
    }
  };
  const ruled = schema.superRefine(ruling);
  return Object.keys(schema.shape).includes('background')
    ? withInCallSchema(
        ruled,
        schema.omit({ background: true }).superRefine(ruling),
      )
    : ruled;
}
