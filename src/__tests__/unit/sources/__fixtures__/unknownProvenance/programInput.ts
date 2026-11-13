// The program's inputs handed down typed: `process.argv` and `process.env`
// reach a typed parameter, and what is read from it stays a boundary.
export interface Hit {
  readonly value: unknown;
}

function hitIn(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Hit | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined || !arg.startsWith('--')) continue;
    const next = argv[index + 1];
    const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : next;
    return { value };
  }
  const name = env.NAME;
  return name === undefined ? undefined : { value: name };
}

export function firstHit(): Hit | undefined {
  return hitIn(process.argv.slice(2), process.env);
}

/**
 * The program's arguments by contract: a reader an embedder calls, with no
 * caller in the program, named by the type its parameter is declared with.
 */
export interface ProgramArguments extends ReadonlyArray<string> {}

export interface Flag {
  readonly flag: unknown;
}

export function flagOf(argv: ProgramArguments): Flag {
  return { flag: argv[0] };
}
