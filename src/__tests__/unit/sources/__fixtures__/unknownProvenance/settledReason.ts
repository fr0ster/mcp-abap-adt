// A settled promise's `reason` (`PromiseRejectedResult.reason`, the
// language's `any`) is a caught value: read by the thrown-value readers, as
// a catch binding is — handed to one whole, it passes as caught; inspected
// anywhere else, it is refused.
declare function describe(thrown: unknown): string;

export async function described(
  work: readonly Promise<string>[],
): Promise<string[]> {
  const settled = await Promise.allSettled(work);
  return settled.flatMap((each) =>
    each.status === 'rejected' ? [describe(each.reason)] : [],
  );
}

export async function inspected(
  work: readonly Promise<string>[],
): Promise<number> {
  const settled = await Promise.allSettled(work);
  return settled.filter(
    (each) => each.status === 'rejected' && each.reason instanceof Error,
  ).length;
}
