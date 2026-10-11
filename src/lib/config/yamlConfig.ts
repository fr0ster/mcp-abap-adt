/**
 * The YAML config file (`--conf`), read against a binary's own table: the
 * file is loaded and validated by the table, and its template is written from
 * the table — so a binary's file holds only that binary's parameters, and a
 * key of another binary is refused naming the binary that serves it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { load as parseYaml } from 'js-yaml';
import {
  CONF_ROW,
  ParameterRefusal,
  type ParameterTable,
  parametersTemplate,
  validateYamlParameters,
} from './authParameters.js';

/** A loaded config file: its top-level mapping. */
export type YamlConfig = Record<string, unknown>;

/**
 * `--conf` / `--config` as given on the command line, or undefined. Plain
 * code over the arguments (D26).
 */
export function parseConfigArg(
  argv: readonly string[] = process.argv,
): string | undefined {
  for (const name of [CONF_ROW.cli, ...(CONF_ROW.cliAliases ?? [])]) {
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
      if (arg === name) {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('-')) {
          throw new ParameterRefusal(`${name} needs a value: ${name}=<path>`);
        }
        return next;
      }
    }
  }
  return undefined;
}

/** Every refusal of a config file against the table; empty when it is valid. */
export function validateYamlConfig(
  table: ParameterTable,
  config: YamlConfig,
): { valid: boolean; errors: string[] } {
  const errors = validateYamlParameters(table, config);
  return { valid: errors.length === 0, errors };
}

function resolved(configPath: string): string {
  return path.isAbsolute(configPath)
    ? configPath
    : path.resolve(process.cwd(), configPath);
}

/**
 * The config file, validated by the table; null when it does not exist. An
 * unreadable file, one that is not YAML, or one the table refuses stops the
 * start: the words name the file and the line (never its text) or each
 * refused key.
 */
export function loadYamlConfig(
  table: ParameterTable,
  configPath: string,
): YamlConfig | null {
  const file = resolved(configPath);
  if (!fs.existsSync(file)) return null;

  let parsed: unknown;
  try {
    parsed = parseYaml(fs.readFileSync(file, 'utf-8'));
  } catch (error) {
    // js-yaml's message quotes the file; only the position is passed on.
    const mark = (error as { mark?: { line?: unknown; column?: unknown } })
      ?.mark;
    const at =
      typeof mark?.line === 'number' && typeof mark?.column === 'number'
        ? ` (line ${mark.line + 1}, column ${mark.column + 1})`
        : '';
    throw new ParameterRefusal(
      `The config file ${configPath} is not valid YAML${at}`,
    );
  }
  if (parsed === undefined || parsed === null) return {};
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ParameterRefusal(
      `The config file ${configPath} must be a mapping of parameter keys`,
    );
  }
  const config = parsed as YamlConfig;
  const { errors } = validateYamlConfig(table, config);
  if (errors.length > 0) {
    throw new ParameterRefusal(
      `The config file ${configPath} is refused:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }
  return config;
}

/** The template of the table's config file. */
export function generateYamlConfigTemplate(table: ParameterTable): string {
  return parametersTemplate(table);
}

/**
 * Writes the table's template where `--conf` points when nothing is there.
 * @returns true if the template was written (the start then ends), false if a file is there
 */
export function generateConfigTemplateIfNeeded(
  table: ParameterTable,
  configPath: string,
): boolean {
  const file = resolved(configPath);
  if (fs.existsSync(file)) return false;
  fs.writeFileSync(file, generateYamlConfigTemplate(table), 'utf-8');
  process.stderr.write(
    `[MCP-CONFIG] Generated YAML config template: ${file}\n`,
  );
  process.stderr.write(
    '[MCP-CONFIG] Please edit the file and fill in your configuration.\n',
  );
  return true;
}

/**
 * What a binary's launcher reads first: the config file named by `--conf`
 * (its template written when it is missing — `template: true`, the start
 * ends), then the table's values.
 */
export type ConfigurationRead =
  | { readonly template: true }
  | {
      readonly template: false;
      readonly configFile: string | undefined;
      readonly yaml: YamlConfig | null;
    };

/** `--conf`: the template written, or the file loaded (null without one). */
export function readConfigFile(
  table: ParameterTable,
  argv: readonly string[],
): ConfigurationRead {
  const configFile = parseConfigArg(argv);
  if (configFile === undefined) {
    return { template: false, configFile, yaml: null };
  }
  if (generateConfigTemplateIfNeeded(table, configFile)) {
    return { template: true };
  }
  return {
    template: false,
    configFile,
    yaml: loadYamlConfig(table, configFile),
  };
}
