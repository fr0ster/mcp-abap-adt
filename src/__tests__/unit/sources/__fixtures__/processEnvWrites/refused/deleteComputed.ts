export function drop(key: string): void {
  delete process.env[key];
}
