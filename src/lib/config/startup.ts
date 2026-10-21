import type { EventEmitter } from 'node:events';
import { ParameterRefusal, type ParameterTable } from './authParameters.js';
import { readConfigFile, type YamlConfig } from './yamlConfig.js';

/** The process's edges a binary's start reports through. */
export interface StartupEdges {
  /** One line to stderr; nothing goes to stdout. */
  readonly stderr: (line: string) => void;
  readonly exit: (code: number) => void;
}

/**
 * A binary's configuration, read by its own table: `--conf` first (a missing
 * file gets the table's template, and the start ends `0`), then every row. A
 * refusal — a removed parameter, an invalid value, a refused config file —
 * is reported in its words and ends the start `1`; undefined is returned
 * then, and the launcher stops.
 */
export function readStartupConfig<T>(
  table: ParameterTable,
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  edges: StartupEdges,
  read: (
    argv: readonly string[],
    env: NodeJS.ProcessEnv,
    yaml: YamlConfig | null,
  ) => T,
): T | undefined {
  try {
    const file = readConfigFile(table, argv);
    if (file.template) {
      edges.stderr(
        '[MCP-CONFIG] Template generated. Edit it and rerun with --conf.',
      );
      edges.exit(0);
      return undefined;
    }
    return read(argv, env, file.yaml);
  } catch (error) {
    if (!(error instanceof ParameterRefusal)) throw error;
    edges.stderr(`[MCP] ${error.words}`);
    edges.exit(1);
    return undefined;
  }
}

/**
 * The process as a binary's `main` meets it: the arguments, the
 * two output streams as lines, the exit, and where the shutdown listens. The
 * program passes `processEdges()`; a test passes its own.
 */
export interface LauncherEdges extends StartupEdges {
  /** The arguments, without node's and the script's. */
  readonly argv: readonly string[];
  /** `--version`'s one line: the only thing a launcher writes to stdout. */
  readonly stdout: (line: string) => void;
  /** Where the shutdown listens: `process` in the program. */
  readonly processLike: EventEmitter & { stdin?: EventEmitter };
}

/** The edges of the program: `process`. */
export function processEdges(): LauncherEdges {
  return {
    argv: process.argv.slice(2),
    stdout: (line) => console.log(line),
    stderr: (line) => process.stderr.write(`${line}\n`),
    exit: (code) => process.exit(code),
    processLike: process,
  };
}

/**
 * `--version` (`-v`) and `--help` (`-h`), answered before anything is read:
 * the version on stdout, the help on stderr, exit `0`. True when one was
 * answered — the launcher then stops.
 */
export function answerVersionOrHelp(
  edges: LauncherEdges,
  answers: { readonly version: string; readonly help: () => string },
): boolean {
  const { argv } = edges;
  if (argv.includes('--version') || argv.includes('-v')) {
    edges.stdout(answers.version);
    edges.exit(0);
    return true;
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    edges.stderr(answers.help());
    edges.exit(0);
    return true;
  }
  return false;
}
