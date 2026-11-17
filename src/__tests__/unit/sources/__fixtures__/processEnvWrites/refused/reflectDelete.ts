export function drop(): void {
  Reflect.deleteProperty(process.env, 'A');
}
