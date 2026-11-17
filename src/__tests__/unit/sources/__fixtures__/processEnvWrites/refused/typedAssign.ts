export function merge(env: NodeJS.ProcessEnv): void {
  Object.assign(env, { A: '1' });
}
