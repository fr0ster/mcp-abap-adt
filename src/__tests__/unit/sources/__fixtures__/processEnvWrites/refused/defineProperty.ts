export function define(): void {
  Object.defineProperty(process.env, 'A', { value: '1' });
}
