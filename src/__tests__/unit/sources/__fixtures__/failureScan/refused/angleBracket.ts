export function run(work: () => void): string {
  try {
    work();
    return 'ok';
  } catch (ex) {
    // An angle-bracket assertion: the evasion under test (Biome skips fixtures).
    return (<Error>ex).message;
  }
}
