export function merge(): void {
  Object.assign(process.env, { A: '1' });
}
