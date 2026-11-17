export function fill(env: NodeJS.ProcessEnv, key: string): void {
  env[key] = '1';
}
