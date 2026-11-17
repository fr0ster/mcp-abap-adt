export function set(): void {
  Reflect.set(process.env, 'A', '1');
}
