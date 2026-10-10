/**
 * What a host awaits before it lets an instance go: the state is disposed,
 * and what could not be undone is raised, never swallowed. No timer.
 */
export async function closeInstanceState(instance: {
  shutdownState(): Promise<string[]>;
}): Promise<void> {
  const left = await instance.shutdownState();
  if (left.length) {
    throw new Error(`state cleanup failed: ${left.join('; ')}`);
  }
}
