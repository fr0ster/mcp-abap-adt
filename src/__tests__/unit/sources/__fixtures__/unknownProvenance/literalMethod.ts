// Round 8: an object literal's method returns into its contract as a
// function-valued member does: its `number` lands where `unknown` is written.
export function maker(): boolean {
  const held: { make: () => unknown } = {
    make() {
      return 42;
    },
  };
  return held.make() !== null;
}
