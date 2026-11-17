export function set(key: string): void {
  process.env[key] = 'x';
}
