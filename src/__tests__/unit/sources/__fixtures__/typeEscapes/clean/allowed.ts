// What the scan accepts: `as const`, `<const>`, `satisfies`, the logical
// `!` and `!==`, an identifier named `any`, `unknown`, and the directive
// words inside a string.
export const MODES = ['read', 'write'] as const;
export const LEVELS = <const>['low', 'high'];
export const LIMITS = { max: 3 } satisfies Record<string, number>;
export const WORDS = '@ts-ignore @ts-expect-error @ts-nocheck biome-ignore';

export function differs(left: unknown, right: unknown): boolean {
  const any = left !== right;
  return !!any && !(left === undefined);
}
