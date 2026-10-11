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
