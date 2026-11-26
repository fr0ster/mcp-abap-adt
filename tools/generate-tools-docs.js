#!/usr/bin/env node

/**
 * Generate AVAILABLE_TOOLS.md from the tool definitions the server builds.
 *
 * Rules:
 * - Read the build only: the tool sets' handler groups (`dist/lib/toolSet.js`)
 *   and the built handler modules that hold each definition — never source text
 * - Hierarchy in output: Group(level) -> Object(folder) -> Tools
 */

const fs = require('node:fs');
const path = require('node:path');

const DIST_ROOT = path.join(__dirname, '..', 'dist');
const DIST_HANDLERS = path.join(DIST_ROOT, 'handlers');
const OUTPUT_PATHS = {
  all: path.join(__dirname, '../docs/user-guide/AVAILABLE_TOOLS.md'),
  readonly: path.join(
    __dirname,
    '../docs/user-guide/AVAILABLE_TOOLS_READONLY.md',
  ),
  high: path.join(__dirname, '../docs/user-guide/AVAILABLE_TOOLS_HIGH.md'),
  legacy: path.join(__dirname, '../docs/user-guide/AVAILABLE_TOOLS_LEGACY.md'),
  prompts: path.join(__dirname, '../docs/user-guide/PROMPTS.md'),
};
/** The prompts every binary lists, per binary and kind: a committed fixture. */
const LISTED_PROMPTS_PATH = path.join(
  __dirname,
  '../tests/fixtures/tools/listed-prompts.json',
);
// `low` left in 19.0.0: the low set is not served by the full binaries,
// and the low handler files that remain serve compact and high only.
// `batch` left in 24.0.0: batch mode is the compact sets' (`HandlerBatch`).
const LEVELS = ['readonly', 'high', 'debug', 'session'];

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: node tools/generate-tools-docs.js

Reads the built tool sets (dist; run npm run build first) and generates:
  docs/user-guide/AVAILABLE_TOOLS.md
  docs/user-guide/AVAILABLE_TOOLS_READONLY.md
  docs/user-guide/AVAILABLE_TOOLS_HIGH.md
  docs/user-guide/AVAILABLE_TOOLS_LEGACY.md   (only when a tool declares legacy)
  docs/user-guide/PROMPTS.md                  (from tests/fixtures/tools/listed-prompts.json)

Output hierarchy:
  1) Group (level)
  2) Object (the folder under src/handlers of the module that holds the definition)
  3) Tools (the definition's name)
`);
  process.exit(0);
}

function titleCaseFolder(folder) {
  return folder
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Lower case; letters, digits and '-' kept; each run of white space one '-'. */
function slug(value) {
  const kept = [];
  for (const ch of value.toLowerCase()) {
    const letterOrDigit = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
    if (letterOrDigit || ch === '-') kept.push(ch);
    else if (ch.trim() === '') kept.push(' ');
  }
  const words = kept.join('').trim().split(' ');
  return words.filter((word, i) => word !== '' || i === 0).join('-');
}

function anchorFromHeading(heading) {
  // GitHub-style links are derived from heading text.
  return slug(heading);
}

/**
 * The text the model actually receives, taken from the BUILT definitions.
 *
 * **Why from `dist` and not from the source.** Three reviewer findings on PR #244
 * were the same defect wearing different clothes: a Zod `.description` is a
 * prototype getter and was invisible to `Object.entries`; a description built as
 * `'…' + '…'` was cut at the first literal; a template literal printed
 * `${commonObjectTypeSchema.description}` verbatim, because no regex evaluates an
 * interpolation. Source text and shipped text are not the same thing, and the docs
 * must show the shipped one — the string a consumer's RAG indexes and a model reads.
 *
 * **Which is exactly why a stale `dist` may not be used silently.** A fourth
 * finding: the reviewer edited `DeleteClass`'s description, ran `docs:tools`, and
 * the generator answered success while documenting the previous text, because
 * `docs:tools` did not build. Reading `dist` is only correct when `dist` is newer
 * than every source file, so that is a precondition now and not an assumption: it
 * is checked, and a stale or absent build stops the run with what to do about it.
 * `npm run docs:tools` builds first, so the ordinary path needs no thought.
 */
function newestMtime(dir, extensions) {
  let newest = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!extensions.some((extension) => entry.name.endsWith(extension)))
        continue;
      const { mtimeMs } = fs.statSync(full);
      if (mtimeMs > newest) newest = mtimeMs;
    }
  }
  return newest;
}

/**
 * Stops the run rather than documenting text nobody ships.
 *
 * Throws instead of calling `process.exit`, because this module is also required
 * by a unit test and a generator that kills the process from inside a test run is
 * its own kind of defect. The CLI at the bottom turns it into an exit code.
 */
function requireFreshBuild(distEntry) {
  const advice =
    'Run `npm run build` first — or `npm run docs:tools`, which builds.';
  if (!fs.existsSync(distEntry)) {
    throw new Error(`${distEntry} is missing. ${advice}`);
  }
  const sourceRoot = path.join(__dirname, '..', 'src');
  const distRoot = path.join(__dirname, '..', 'dist');
  const source = newestMtime(sourceRoot, ['.ts']);
  const built = newestMtime(distRoot, ['.js']);
  if (source > built) {
    const behind = Math.round((source - built) / 1000);
    throw new Error(
      `dist is ${behind}s behind src, so the documented descriptions would not be the ones this tree ships. ${advice}`,
    );
  }
}

/**
 * The level a tool is listed under when the folder of its module names none
 * (a `low` module served by the high group): its handler group's.
 */
const GROUP_LEVELS = {
  ReadOnlyHandlersGroup: 'readonly',
  SearchHandlersGroup: 'readonly',
  SystemHandlersGroup: 'readonly',
  DataHandlersGroup: 'readonly',
  BackgroundRunHandlersGroup: 'readonly',
  HighLevelHandlersGroup: 'high',
  RuntimeRunHandlersGroup: 'high',
  // abapGit's reads sit under readonly/, its writes under high/: the folder decides.
  AbapGitHandlersGroup: 'high',
  DebugHandlersGroup: 'debug',
  DebugBatchHandlersGroup: 'debug',
  LeftoverSessionHandlersGroup: 'session',
  LeftoverSessionListHandlersGroup: 'session',
};

/** Every built handler module, `dist/handlers/<object>/<level>/<file>.js`. */
function builtHandlerModules() {
  const modules = [];
  const stack = [DIST_HANDLERS];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith('.js')) modules.push(full);
    }
  }
  return modules.sort();
}

function isDefinition(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.name === 'string' &&
    value.inputSchema !== undefined
  );
}

/**
 * Where each definition lives: the built module that exports it — the same
 * object, or (a group's copy with its own name or words) the same
 * `inputSchema` object — or whose exported `build…Tools()` factory makes a
 * tool of that name.
 */
function moduleIndex() {
  const byDefinition = new Map();
  const bySchema = new Map();
  const byName = new Map();
  for (const file of builtHandlerModules()) {
    const exported = require(file);
    for (const [key, value] of Object.entries(exported)) {
      if (isDefinition(value)) {
        if (!byDefinition.has(value)) byDefinition.set(value, file);
        if (
          typeof value.inputSchema === 'object' &&
          !bySchema.has(value.inputSchema)
        )
          bySchema.set(value.inputSchema, file);
      } else if (
        typeof value === 'function' &&
        key.startsWith('build') &&
        key.endsWith('Tools') &&
        value.length === 0
      ) {
        for (const entry of value()) {
          const name = entry.toolDefinition.name;
          if (!byName.has(name)) byName.set(name, file);
        }
      }
    }
  }
  return (definition) =>
    byDefinition.get(definition) ??
    bySchema.get(definition.inputSchema) ??
    byName.get(definition.name);
}

/** A definition's input as JSON Schema, as the MCP SDK lists it (input side). */
function jsonSchemaOf(inputSchema) {
  const { z } = require('zod');
  return z.toJSONSchema(inputSchema, { io: 'input' });
}

/**
 * The arguments a definition requires: its zod schema's fields that are
 * neither optional nor a default over an optional field, as its JSON Schema
 * stated them before it moved to zod.
 */
function requiredOf(inputSchema) {
  const { z } = require('zod');
  return Object.entries(inputSchema.shape)
    .filter(
      ([, field]) =>
        !(
          field instanceof z.ZodOptional ||
          (field instanceof z.ZodDefault &&
            field.unwrap() instanceof z.ZodOptional)
        ),
    )
    .map(([name]) => name);
}

/** A built JSON-Schema property as the page lists it: type, default, enum, words. */
function listedProperty(stated) {
  const type = Array.isArray(stated.type)
    ? stated.type.join(' | ')
    : typeof stated.type === 'string'
      ? stated.type
      : 'any';
  return {
    type,
    description:
      typeof stated.description === 'string' ? stated.description : '',
    default: stated.default === undefined ? undefined : String(stated.default),
    enum: Array.isArray(stated.enum) ? stated.enum.map(String) : undefined,
  };
}

/** The page's entry for one served definition, filed by the module that holds it. */
function documentedTool(definition, groupName, moduleOf) {
  const file = moduleOf(definition);
  if (file === undefined) {
    throw new Error(
      `${definition.name} (${groupName}) is held by no built handler module`,
    );
  }
  const [objectFolder, folderLevel] = path
    .relative(DIST_HANDLERS, file)
    .split(path.sep);
  const level = LEVELS.includes(folderLevel)
    ? folderLevel
    : GROUP_LEVELS[groupName];
  if (level === undefined) {
    throw new Error(`${groupName} has no level on the page`);
  }
  const schema = jsonSchemaOf(definition.inputSchema);
  const properties = {};
  for (const [key, stated] of Object.entries(schema.properties || {}))
    properties[key] = listedProperty(stated);
  const variants = {};
  for (const [kind, variant] of Object.entries(definition.variants || {})) {
    const stated = jsonSchemaOf(variant.inputSchema);
    const variantProperties = {};
    for (const [key, each] of Object.entries(stated.properties || {}))
      variantProperties[key] = listedProperty(each);
    variants[kind] = {
      description:
        typeof variant.description === 'string' ? variant.description : '',
      inputSchema: {
        properties: variantProperties,
        required: requiredOf(variant.inputSchema),
      },
    };
  }
  return {
    variants,
    name: definition.name,
    description:
      typeof definition.description === 'string' ? definition.description : '',
    inputSchema: {
      properties,
      required: requiredOf(definition.inputSchema),
    },
    availableIn: Array.isArray(definition.available_in)
      ? [...definition.available_in]
      : [],
    objectFolder,
    objectTitle: titleCaseFolder(objectFolder),
    level,
    filePath: path
      .join('src', path.relative(DIST_ROOT, file))
      .split(path.sep)
      .join('/')
      .slice(0, -'.js'.length)
      .concat('.ts'),
  };
}

/**
 * What the pages document: every set with the data tools served, so the
 * opt-in tools are on the pages (and marked there as opt-in).
 */
const DOCUMENTED = { dataTools: true };

/** The data tools: on the pages, marked opt-in. */
const DATA_TOOLS = new Set(['GetSqlQuery', 'GetTableContents']);
const OPT_IN_LINE =
  "**Opt-in:** served only by a binary started with `--enable-data-tools` (`MCP_ENABLE_DATA_TOOLS`, `enable-data-tools`); off by default. SAP API Policy FAQ v1.3 (June 2026), Q33, says ADT APIs are not intended for reading application tables, exporting business data or running SQL against SAP systems; whether to enable it is the customer's decision.\n\n";
const optIn = (tool) => (DATA_TOOLS.has(tool.name) ? OPT_IN_LINE : '');

/** The served definitions of a tool set on stdio, each with its group's name. */
function servedEntries(toolSet) {
  return toolSet
    .groups({ connection: null }, 'stdio', DOCUMENTED)
    .flatMap((group) =>
      group.getHandlers().map((entry) => ({
        definition: entry.toolDefinition,
        group: group.constructor.name,
      })),
    );
}

function builtToolSets() {
  const distEntry = path.join(DIST_ROOT, 'lib', 'toolSet.js');
  requireFreshBuild(distEntry);
  return require(distEntry);
}

function byPageOrder(a, b) {
  if (a.level !== b.level)
    return LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level);
  if (a.objectTitle !== b.objectTitle)
    return a.objectTitle.localeCompare(b.objectTitle);
  return a.name.localeCompare(b.name);
}

/**
 * Every tool the full stdio binary serves (`fullToolSet`), and a read-only
 * copy of each tool the read-only group serves whose module sits under
 * another level (the set lists such a tool once, from the high group).
 */
function loadToolsFromHandlers() {
  const { fullToolSet } = builtToolSets();
  const moduleOf = moduleIndex();
  const tools = servedEntries(fullToolSet).map(({ definition, group }) =>
    documentedTool(definition, group, moduleOf),
  );
  const placed = new Set(
    tools.filter((t) => t.level === 'readonly').map((t) => t.name),
  );
  // The read-only group as it stands alone: within the full set it lists
  // only what the high group does not.
  const { ReadOnlyHandlersGroup } = require(
    path.join(
      DIST_ROOT,
      'lib',
      'handlers',
      'groups',
      'ReadOnlyHandlersGroup.js',
    ),
  );
  for (const entry of new ReadOnlyHandlersGroup({
    connection: null,
  }).getHandlers()) {
    const name = entry.toolDefinition.name;
    if (placed.has(name)) continue;
    const source = tools.find((t) => t.name === name);
    if (source) tools.push({ ...source, level: 'readonly' });
  }
  return tools.sort(byPageOrder);
}

/**
 * The tools a read-only binary serves (`mcp-abap-adt-ro`, `-http-ro`,
 * `-sse-ro`): `fullReadOnlyToolSet` of the build on stdio, in the set's
 * order, each with the parameters it takes there, filed under the
 * read-only level.
 */
function readOnlySetTools() {
  const { fullReadOnlyToolSet } = builtToolSets();
  const moduleOf = moduleIndex();
  return servedEntries(fullReadOnlyToolSet).map(({ definition, group }) => ({
    ...documentedTool(definition, group, moduleOf),
    level: 'readonly',
  }));
}

function levelTitle(level) {
  if (level === 'readonly') return 'Read-Only';
  if (level === 'high') return 'High-Level';
  if (level === 'low') return 'Low-Level';
  if (level === 'debug') return 'Debug';
  if (level === 'session') return 'Session';
  return level;
}

function groupByLevelAndObject(tools) {
  const grouped = {};
  for (const level of LEVELS) grouped[level] = {};

  for (const tool of tools) {
    if (!grouped[tool.level][tool.objectFolder]) {
      grouped[tool.level][tool.objectFolder] = {
        objectTitle: tool.objectTitle,
        tools: [],
      };
    }
    grouped[tool.level][tool.objectFolder].tools.push(tool);
  }

  return grouped;
}

/** The listed prompts fixture: { listings, prompts }. */
function loadListedPrompts() {
  return require(LISTED_PROMPTS_PATH);
}

/**
 * Tool name -> the prompts whose steps call it: the fixture's `tools`, read
 * from the prompts' instruction data, never from a description.
 */
function promptsOfTools(listed) {
  const byTool = new Map();
  for (const [promptName, entries] of Object.entries(listed.prompts)) {
    for (const entry of entries) {
      for (const tool of entry.value.tools) {
        const names = byTool.get(tool) || new Set();
        names.add(promptName);
        byTool.set(tool, names);
      }
    }
  }
  return byTool;
}

/** The line a tool's entry carries when a prompt asks the model to call it. */
function promptPointer(tool, byTool) {
  const names = byTool.get(tool.name);
  if (names === undefined) return '';
  const shown = [...names].sort().map((name) => `\`${name}\``);
  const noun = shown.length === 1 ? 'prompt' : 'prompts';
  return `**Prompt:** the ${shown.join(', ')} ${noun} ask${shown.length === 1 ? 's' : ''} the model to call this tool ([PROMPTS.md](PROMPTS.md)).\n\n`;
}

const PROMPT_KINDS = [
  ['onprem', 'On-premise system (`onprem`)'],
  ['cloud', 'Cloud system (`cloud`)'],
  [
    'none',
    'No system kind stated (stdio inspection mode, an embedder that states none)',
  ],
  ['legacy', 'Legacy system (`legacy`)'],
];

/** One argument's completion values, as the page lists them. */
function completionWords(completions) {
  return Object.entries(completions)
    .map(
      ([argument, values]) =>
        `\`${argument}\`: ${values.map((v) => `\`${v}\``).join(', ')}`,
    )
    .join('; ');
}

/** What one binary lists on one kind: prompt name -> its completions. */
function listingOf(listed, kind, binary) {
  const names = listed.listings[`${kind} ${binary}`] || [];
  const shown = {};
  for (const name of names) {
    const entry = listed.prompts[name].find((candidate) =>
      candidate.listedBy.includes(`${kind} ${binary}`),
    );
    shown[name] = entry.value.completions;
  }
  return shown;
}

function generatePromptsMarkdown(listed) {
  const binaries = [
    ...new Set(Object.keys(listed.listings).map((key) => key.split(' ')[1])),
  ];
  let md = `# MCP Prompts - MCP ABAP ADT Server\n\n`;
  md += `Generated from the prompts every binary lists (\`tests/fixtures/tools/listed-prompts.json\`, by \`npm run docs:tools\`), not from docs.\n\n`;
  md += `## What a prompt is\n\n`;
  md += `A prompt is a ready-made request the MCP client offers the user. Claude Code, in [its own words](https://code.claude.com/docs/en/mcp.md#use-mcp-prompts-as-commands), "lists each MCP prompt as \`/servername:promptname (MCP)\`. Typing \`/mcp__servername__promptname\` also runs it." For a server named \`abap\`, \`get\` is listed as \`/abap:get (MCP)\`, and \`/mcp__abap__get class ZCL_DEMO\` runs it. Other clients show prompts in their own pickers. The server answers with an instruction that names the tools to call, in order, with the arguments filled from the values the user gave. The model follows the instruction with the tools the same binary serves.\n\n`;
  md += `Nine prompts: \`create\`, \`get\`, \`update\`, \`delete\`, \`activate\`, \`check\`, \`unit_test\`, \`where_used\`, \`transport\`. The object prompts take \`object_type\` and \`name\` (a function module also takes \`function_group\`, except in \`unit_test\`, whose run names the module alone and covers the ABAP Unit tests of its whole function group); \`object_type\`, \`transport\`'s \`action\` and \`where_used\`'s \`container\` complete in lower case and are accepted in any case. Each binary lists the prompts its tools serve, and the \`object_type\` values its tools serve on the system kind.\n\n`;
  md += `## Autocompletion\n\n`;
  md += `A client that supports MCP completion (\`completion/complete\`) completes a prompt's closed arguments with exactly what this binary serves, matching what the user typed without regard to case:\n\n`;
  md += `- \`object_type\` (every object prompt, \`unit_test\`, \`where_used\`): the values this binary's tools serve on the system kind, after \`--deny-actions\`, in lower case.\n`;
  md += `- \`transport\` \`action\`: the actions this binary serves.\n`;
  md += `- \`transport\` \`object_type\`: the transport object types, when the action given takes one (or no action is given yet).\n`;
  md += `- \`where_used\` \`container\`: the values the where-used tool lists, while the \`object_type\` given so far is \`text_elements\` or none is given yet.\n`;
  md += `- \`unit_test\` \`include_subpackages\`: \`true\`, \`false\`.\n\n`;
  md += `A client without completion reads the same values in the argument's description: each closed argument's description is a short sentence followed by exactly the values its completion offers, from the one list both are built from, e.g. \`What to do with transport requests: create, create_task, list, …\`. The \`transport\` \`object_type\` description names the actions that read it. A prompt's own description states what it does; the tools it asks the model to call are named in its instruction and on the tool pages.\n\n`;
  md += `The lists per binary and kind below are these completions.\n\n`;
  md += `## Refusal\n\n`;
  md += `A \`prompts/get\` with an \`object_type\` the binary does not serve (unknown, not served on the system kind, or denied) is refused with the protocol's invalid-params error and no instruction: \`<prompt>: object_type "<value>" is not served by this server; it serves <list>.\` A required argument that is absent or blank is refused the same way: \`<prompt>: <argument> is required.\` So is a \`function_group\` given for an \`object_type\` whose steps read none: \`<prompt>: function_group is read with object_type function_module only.\`.\n\n`;
  md += `A prompt whose tools are denied (\`--deny-actions\`, [ACCESS_RESTRICTIONS.md](ACCESS_RESTRICTIONS.md)) loses those \`object_type\` values; a prompt with none left is not listed.\n\n`;
  md += `\`prompts: false\` on \`BaseMcpServer\` or \`EmbeddableMcpServer\` lists none; \`registerAbapPrompts(server, registry)\` adds them to a plain registration ([HANDLER_EXPORTER.md](../architecture/HANDLER_EXPORTER.md)).\n\n`;
  for (const [kind, title] of PROMPT_KINDS) {
    md += `## ${title}\n\n`;
    const groups = new Map();
    for (const binary of binaries) {
      const shown = listingOf(listed, kind, binary);
      const signature = JSON.stringify(shown);
      const group = groups.get(signature) || { binaries: [], shown };
      group.binaries.push(binary);
      groups.set(signature, group);
    }
    for (const group of groups.values()) {
      const heading = group.binaries.map((b) => `\`${b}\``).join(', ');
      md += `### ${heading}\n\n`;
      const names = Object.keys(group.shown);
      if (names.length === 0) {
        md += `No prompt is listed.\n\n`;
        continue;
      }
      for (const name of names) {
        md += `- \`${name}\` - ${completionWords(group.shown[name])}\n`;
      }
      md += `\n`;
    }
  }
  return md;
}

/** The system kinds a tool's variants are shown for, as the page names them. */
const VARIANT_KINDS = [
  ['cloud', 'On ABAP Cloud (`cloud`)'],
  ['onprem', 'On premise (`onprem`)'],
];

/**
 * A kind-specific variant that differs from the entry shown (its description
 * or its parameters): its own description and parameters, so the page shows
 * every call shape a tool takes.
 */
function variantMarkdown(tool) {
  let md = '';
  for (const [kind, title] of VARIANT_KINDS) {
    const variant = tool.variants?.[kind];
    if (variant === undefined) continue;
    const same =
      variant.description === tool.description &&
      JSON.stringify(variant.inputSchema) === JSON.stringify(tool.inputSchema);
    if (same) continue;
    md += `\n**${title}:** ${variant.description || 'No description'}\n\n`;
    md += `**Parameters (\`${kind}\`):**\n`;
    md += renderParams(variant);
  }
  return md;
}

function renderParams(tool) {
  const { z } = require('zod');
  const schema =
    tool.inputSchema instanceof z.ZodObject
      ? jsonSchemaOf(tool.inputSchema)
      : tool.inputSchema;
  const props = schema?.properties || {};
  const keys = Object.keys(props);
  if (keys.length === 0) return '- None\n';

  const required = new Set(
    tool.inputSchema instanceof z.ZodObject
      ? requiredOf(tool.inputSchema)
      : schema?.required || [],
  );
  let out = '';
  for (const key of keys.sort((a, b) => a.localeCompare(b))) {
    const p = props[key];
    const req = required.has(key) ? 'required' : 'optional';
    const def = p.default !== undefined ? ` (default: ${p.default})` : '';
    const values = p.enum
      ? `, one of: ${p.enum.map((v) => `\`${v}\``).join(', ')}`
      : '';
    const words = p.description ? ` - ${p.description}` : '';
    out += `- \`${key}\` (${p.type}, ${req}${def}${values})${words}\n`;
  }
  return out;
}

const HTTP_HEADING = 'Streamable HTTP Binaries';

/**
 * The `state_handle` rule of a Streamable HTTP binary, said once: every tool
 * it serves declares the optional argument, with the words the server
 * registers (`streamableHttpSurface` of the build).
 */
function stateHandleRule(surface) {
  return `On \`${surface.binaries.http}\` (Streamable HTTP) every tool declares one more, optional argument, \`state_handle\` (string): "${surface.stateHandleWords}" A tool whose own schema declares \`state_handle\` (the debugger tools) keeps its own declaration, required where it is required. No stdio or SSE binary declares it; the parameters listed per tool on this page are the stdio ones, without it.`;
}

/**
 * The Streamable HTTP section of a page: what the set's HTTP binary serves
 * beside its stdio set — taken from `streamableHttpSurface` of the build,
 * the registration the HTTP server uses — and that its SSE binary serves
 * none of it.
 */
function httpSectionMarkdown(surface) {
  const { stdio, http, sse } = surface.binaries;
  const without =
    surface.stdioOnly.length === 0
      ? ''
      : ` without ${surface.stdioOnly.map((name) => `\`${name}\``).join(', ')}, which are stdio's only`;
  let md = `<a id="${anchorFromHeading(HTTP_HEADING)}"></a>\n`;
  md += `## ${HTTP_HEADING}\n\n`;
  md += `\`${sse}\` (SSE) serves the tools of \`${stdio}\`${without}. \`${http}\` (Streamable HTTP) serves the same tools, and beside them:\n\n`;
  md += `- **The \`state_handle\` argument.** ${stateHandleRule(surface)}\n`;
  md += `- **The long session:** ${surface.sessionTools.map((tool) => `\`${tool.name}\``).join(', ')}, served by no stdio or SSE binary. Their parameters below are the ones \`${http}\` registers, \`state_handle\` included.\n\n`;
  for (const tool of surface.sessionTools) {
    md += `<a id="${anchorFromHeading(`${tool.name} (Streamable HTTP)`)}"></a>\n`;
    md += `### ${tool.name} (Streamable HTTP)\n`;
    md += `**Description:** ${tool.description || 'No description'}\n\n`;
    md += `**Parameters:**\n`;
    md += renderParams(tool);
    md += `\n---\n\n`;
  }
  return md;
}

/**
 * The Streamable HTTP section's entry in a page's navigation: the section,
 * and each long-session tool under it (`httpSectionMarkdown` anchors them).
 */
function httpNavigationMarkdown(surface) {
  let md = `- [${HTTP_HEADING}](#${anchorFromHeading(HTTP_HEADING)})\n`;
  for (const tool of surface?.sessionTools ?? []) {
    md += `  - [${tool.name}](#${anchorFromHeading(`${tool.name} (Streamable HTTP)`)})\n`;
  }
  return md;
}

/** Each HTTP surface of the build: the full set's and the read-only one's. */
function httpSurfaces() {
  const { fullToolSet, fullReadOnlyToolSet, streamableHttpSurface } =
    builtToolSets();
  return {
    all: streamableHttpSurface(fullToolSet, DOCUMENTED),
    readonly: streamableHttpSurface(fullReadOnlyToolSet, DOCUMENTED),
  };
}

function generateMarkdown(tools, surface, listedPrompts) {
  const byTool = promptsOfTools(listedPrompts);
  const grouped = groupByLevelAndObject(tools);
  const summary = {
    total: tools.length,
    readonly: tools.filter((t) => t.level === 'readonly').length,
    high: tools.filter((t) => t.level === 'high').length,
    debug: tools.filter((t) => t.level === 'debug').length,
    session: tools.filter((t) => t.level === 'session').length,
  };

  let md = `# Available Tools Reference - MCP ABAP ADT Server\n\n`;
  md += `Generated from the tool definitions the server builds (not from docs).\n\n`;
  md += `## Summary\n\n`;
  md += `- Total tools: ${summary.total}\n`;
  md += `- Read-only tools: ${summary.readonly}\n`;
  md += `- High-level tools: ${summary.high}\n`;
  md += `- Debug tools: ${summary.debug}\n`;
  md += `- Session tools: ${summary.session}\n\n`;

  md += `## Handler Sets\n\n`;
  md += `The binary fixes its tool set (19.0.0); there is no \`--exposition\`.\n\n`;
  md += `- \`readonly\` -> [Read-Only Group](#read-only-group): \`mcp-abap-adt\` (and \`-http\`, \`-sse\`). The read-only binaries (\`mcp-abap-adt-ro\`, \`-http-ro\`, \`-sse-ro\`) serve a set of their own, listed exactly in [AVAILABLE_TOOLS_READONLY.md](AVAILABLE_TOOLS_READONLY.md): this group, the system and search tools, the background-run tools of the long reads, and on stdio the leftover-session list — none of the run tools (\`RuntimeRunClass\`, \`RuntimeRunProgram\`, \`RuntimeCreateProfilerTraceParameters\`) or the leftover-session logoff, which change the system\n`;
  md += `- \`high\` -> [High-Level Group](#high-level-group): \`mcp-abap-adt\`, \`-http\`, \`-sse\`\n`;
  md += `- \`debug\` -> [Debug Group](#debug-group): \`mcp-abap-adt\`, \`-http\`, \`-sse\`; no \`-ro\` binary\n`;
  md += `- every stdio binary -> [Session Group](#session-group) (leftover SAP sessions of an ended process: list, and in the full binaries logoff). No http or sse binary serves them: such a server holds the sessions of many users and writes no session file\n`;
  md += `- every Streamable HTTP binary (\`-http\`, \`-http-ro\`) -> [${HTTP_HEADING}](#${anchorFromHeading(HTTP_HEADING)}): the optional \`state_handle\` argument on every tool, and the long session (${surface.sessionTools.map((tool) => `\`${tool.name}\``).join(', ')}). No stdio or SSE binary serves these\n`;
  md += `- batch mode (record independent calls, send them together, read their answers by number; see [BATCH_MODE.md](BATCH_MODE.md)) is the compact binaries' alone, one tool, \`HandlerBatch\`; the binaries on this page serve none, and their tools' descriptions carry no batch sentence. The debugger batch of the full binaries is in the [Debug Group](#debug-group): \`DebugBatchBegin\`, \`DebugBatchEnd\`, and \`DebugBatchAnswers\`, which reads its answers\n`;
  md += `- compact -> [the compact package](../../compact/README.md): \`mcp-abap-adt-compact\` and \`mcp-abap-adt-compact-ro\` (and \`-compact-http\`, \`-compact-sse\`, each with its \`-ro\`)\n\n`;

  md += `## Navigation\n\n`;
  for (const level of LEVELS) {
    const objects = Object.values(grouped[level]).sort((a, b) =>
      a.objectTitle.localeCompare(b.objectTitle),
    );
    if (objects.length === 0) continue;

    const levelHeading = `${levelTitle(level)} Group`;
    const levelAnchor = anchorFromHeading(levelHeading);
    md += `- [${levelTitle(level)} Group](#${levelAnchor})\n`;
    for (const obj of objects) {
      const objectHeading = `${levelTitle(level)} / ${obj.objectTitle}`;
      const objAnchor = anchorFromHeading(objectHeading);
      md += `  - [${obj.objectTitle}](#${objAnchor})\n`;
      for (const tool of obj.tools) {
        const toolHeading = `${tool.name} (${levelTitle(level)} / ${obj.objectTitle})`;
        const toolAnchor = anchorFromHeading(toolHeading);
        md += `    - [${tool.name}](#${toolAnchor})\n`;
      }
    }
  }
  md += httpNavigationMarkdown(surface);

  md += `\n---\n\n`;

  for (const level of LEVELS) {
    const objects = Object.values(grouped[level]).sort((a, b) =>
      a.objectTitle.localeCompare(b.objectTitle),
    );
    if (objects.length === 0) continue;

    const levelHeading = `${levelTitle(level)} Group`;
    const levelAnchor = anchorFromHeading(levelHeading);
    md += `<a id="${levelAnchor}"></a>\n`;
    md += `## ${levelHeading}\n\n`;

    for (const obj of objects) {
      const objectHeading = `${levelTitle(level)} / ${obj.objectTitle}`;
      const objectAnchor = anchorFromHeading(objectHeading);
      md += `<a id="${objectAnchor}"></a>\n`;
      md += `### ${objectHeading}\n\n`;

      for (const tool of obj.tools) {
        const toolHeading = `${tool.name} (${levelTitle(level)} / ${obj.objectTitle})`;
        const toolAnchor = anchorFromHeading(toolHeading);
        md += `<a id="${toolAnchor}"></a>\n`;
        md += `#### ${toolHeading}\n`;
        md += `**Description:** ${tool.description || 'No description'}\n\n`;
        md += `**Source:** \`${tool.filePath}\`\n\n`;
        md += promptPointer(tool, byTool);
        md += optIn(tool);
        md += `**Parameters:**\n`;
        md += renderParams(tool);
        md += variantMarkdown(tool);
        md += `\n---\n\n`;
      }
    }
  }

  md += httpSectionMarkdown(surface);

  md += `*Last updated: ${new Date().toISOString().slice(0, 10)}*\n`;
  return md;
}

function generateLevelMarkdown(
  tools,
  level,
  intro,
  appendix,
  appendixNavigation,
  listedPrompts,
) {
  const byTool = promptsOfTools(listedPrompts);
  const levelTools = tools.filter((t) => t.level === level);
  const grouped = groupByLevelAndObject(levelTools);
  const objects = Object.values(grouped[level]).sort((a, b) =>
    a.objectTitle.localeCompare(b.objectTitle),
  );

  let md = `# ${levelTitle(level)} Tools - MCP ABAP ADT Server\n\n`;
  md += `Generated from the tool definitions the server builds (not from docs).\n\n`;
  if (intro) md += `${intro}\n\n`;
  md += `- Level: ${levelTitle(level)}\n`;
  md += `- Total tools: ${levelTools.length}\n\n`;

  md += `## Navigation\n\n`;
  const levelHeading = `${levelTitle(level)} Group`;
  md += `- [${levelHeading}](#${anchorFromHeading(levelHeading)})\n`;
  for (const obj of objects) {
    const objectHeading = `${levelTitle(level)} / ${obj.objectTitle}`;
    md += `  - [${obj.objectTitle}](#${anchorFromHeading(objectHeading)})\n`;
    for (const tool of obj.tools) {
      const toolHeading = `${tool.name} (${levelTitle(level)} / ${obj.objectTitle})`;
      md += `    - [${tool.name}](#${anchorFromHeading(toolHeading)})\n`;
    }
  }
  if (appendixNavigation) md += appendixNavigation;

  md += `\n---\n\n`;
  md += `<a id="${anchorFromHeading(levelHeading)}"></a>\n`;
  md += `## ${levelHeading}\n\n`;

  for (const obj of objects) {
    const objectHeading = `${levelTitle(level)} / ${obj.objectTitle}`;
    md += `<a id="${anchorFromHeading(objectHeading)}"></a>\n`;
    md += `### ${objectHeading}\n\n`;

    for (const tool of obj.tools) {
      const toolHeading = `${tool.name} (${levelTitle(level)} / ${obj.objectTitle})`;
      md += `<a id="${anchorFromHeading(toolHeading)}"></a>\n`;
      md += `#### ${toolHeading}\n`;
      md += `**Description:** ${tool.description || 'No description'}\n\n`;
      md += `**Source:** \`${tool.filePath}\`\n\n`;
      md += promptPointer(tool, byTool);
      md += optIn(tool);
      md += `**Parameters:**\n`;
      md += renderParams(tool);
      md += variantMarkdown(tool);
      md += `\n---\n\n`;
    }
  }

  if (appendix) md += appendix;

  md += `*Last updated: ${new Date().toISOString().slice(0, 10)}*\n`;
  return md;
}

function generateEnvironmentMarkdown(tools, envName, envLabel, envDescription) {
  const envTools = tools.filter(
    (t) => t.availableIn && t.availableIn.includes(envName),
  );
  const grouped = groupByLevelAndObject(envTools);

  let md = `# ${envLabel} Tools - MCP ABAP ADT Server\n\n`;
  md += `Generated from the tool definitions the server builds (not from docs).\n\n`;
  md += `${envDescription}\n\n`;
  md += `- Total tools: ${envTools.length}\n`;
  for (const level of LEVELS) {
    const count = envTools.filter((t) => t.level === level).length;
    if (count > 0) md += `- ${levelTitle(level)}: ${count}\n`;
  }
  md += `\n`;

  md += `## Navigation\n\n`;
  for (const level of LEVELS) {
    const objects = Object.values(grouped[level]).sort((a, b) =>
      a.objectTitle.localeCompare(b.objectTitle),
    );
    if (objects.length === 0) continue;

    const levelHeading = `${levelTitle(level)} Group`;
    md += `- [${levelTitle(level)} Group](#${anchorFromHeading(levelHeading)})\n`;
    for (const obj of objects) {
      const objectHeading = `${levelTitle(level)} / ${obj.objectTitle}`;
      md += `  - [${obj.objectTitle}](#${anchorFromHeading(objectHeading)})\n`;
      for (const tool of obj.tools) {
        const toolHeading = `${tool.name} (${levelTitle(level)} / ${obj.objectTitle})`;
        md += `    - [${tool.name}](#${anchorFromHeading(toolHeading)})\n`;
      }
    }
  }

  md += `\n---\n\n`;

  for (const level of LEVELS) {
    const objects = Object.values(grouped[level]).sort((a, b) =>
      a.objectTitle.localeCompare(b.objectTitle),
    );
    if (objects.length === 0) continue;

    const levelHeading = `${levelTitle(level)} Group`;
    md += `<a id="${anchorFromHeading(levelHeading)}"></a>\n`;
    md += `## ${levelHeading}\n\n`;

    for (const obj of objects) {
      const objectHeading = `${levelTitle(level)} / ${obj.objectTitle}`;
      md += `<a id="${anchorFromHeading(objectHeading)}"></a>\n`;
      md += `### ${objectHeading}\n\n`;

      for (const tool of obj.tools) {
        const toolHeading = `${tool.name} (${levelTitle(level)} / ${obj.objectTitle})`;
        md += `<a id="${anchorFromHeading(toolHeading)}"></a>\n`;
        md += `#### ${toolHeading}\n`;
        md += `**Description:** ${tool.description || 'No description'}\n\n`;
        md += `**Source:** \`${tool.filePath}\`\n\n`;
        md += `**Available in:** \`${tool.availableIn.join('`, `')}\`\n\n`;
        md += optIn(tool);
        md += `**Parameters:**\n`;
        md += renderParams(tool);
        md += variantMarkdown(tool);
        md += `\n---\n\n`;
      }
    }
  }

  md += `*Last updated: ${new Date().toISOString().slice(0, 10)}*\n`;
  return md;
}

/** What the read-only page lists, said on the page. */
const READ_ONLY_PAGE_INTRO =
  "Exactly the tools `mcp-abap-adt-ro` serves, with the parameters they take there — taken from `fullReadOnlyToolSet`, the set the read-only binaries use. `mcp-abap-adt-sse-ro` serves them without `ListLeftoverSessions`, which is stdio's only, and `mcp-abap-adt-http-ro` the same, with what its [Streamable HTTP section](#streamable-http-binaries) adds. Nothing here changes the system: no high, run, debugger, leftover-session logoff or resume tool; the background-run tools serve the long reads, which run in the background by default. Batch mode is the compact binaries' (`HandlerBatch`, [BATCH_MODE.md](BATCH_MODE.md)): none is served here. `mcp-abap-adt` serves these and more: [all tools](AVAILABLE_TOOLS.md).";

/** What the high-level page says beside its tools. */
const HIGH_PAGE_INTRO =
  'The high-level tools of `mcp-abap-adt`, `-http` and `-sse`.';

function main() {
  console.log('🔍 Reading the built tool sets...');
  const tools = loadToolsFromHandlers();

  if (tools.length === 0) {
    console.error('❌ The built tool set serves no tool');
    process.exit(1);
  }

  console.log(`✅ Found ${tools.length} tools`);
  const surfaces = httpSurfaces();
  const listedPrompts = loadListedPrompts();
  const markdownAll = generateMarkdown(tools, surfaces.all, listedPrompts);
  fs.writeFileSync(OUTPUT_PATHS.all, markdownAll, 'utf8');
  fs.writeFileSync(
    OUTPUT_PATHS.readonly,
    generateLevelMarkdown(
      readOnlySetTools(),
      'readonly',
      READ_ONLY_PAGE_INTRO,
      httpSectionMarkdown(surfaces.readonly),
      httpNavigationMarkdown(surfaces.readonly),
      listedPrompts,
    ),
    'utf8',
  );
  fs.writeFileSync(
    OUTPUT_PATHS.high,
    generateLevelMarkdown(
      tools,
      'high',
      HIGH_PAGE_INTRO,
      `<a id="${anchorFromHeading(HTTP_HEADING)}"></a>\n## ${HTTP_HEADING}\n\n${stateHandleRule(surfaces.all)}\n\n`,
      httpNavigationMarkdown(undefined),
      listedPrompts,
    ),
    'utf8',
  );
  fs.writeFileSync(
    OUTPUT_PATHS.prompts,
    generatePromptsMarkdown(listedPrompts),
    'utf8',
  );
  // The legacy page writes itself back when there is something to put on it.
  //
  // Support for legacy systems (BASIS < 7.50) is parked on
  // `parked/legacy-support` until it can be tried against a live system, and
  // no tool declares that environment today — so this would otherwise
  // generate a page listing nothing. Deleting the branch instead would mean
  // the page had to be reconstructed by hand when legacy comes back, which
  // is the one cost worth avoiding here: the text is generated, the code that
  // generates it is what would have been lost.
  const declaresLegacy = tools.some((tool) =>
    (tool.availableIn || []).includes('legacy'),
  );
  if (declaresLegacy) {
    fs.writeFileSync(
      OUTPUT_PATHS.legacy,
      generateEnvironmentMarkdown(
        tools,
        'legacy',
        'Legacy System',
        'Tools available on legacy SAP systems (BASIS < 7.50).',
      ),
      'utf8',
    );
  }

  console.log(`✅ Documentation generated: ${OUTPUT_PATHS.all}`);
  console.log(`✅ Documentation generated: ${OUTPUT_PATHS.readonly}`);
  console.log(`✅ Documentation generated: ${OUTPUT_PATHS.high}`);
  console.log(`✅ Documentation generated: ${OUTPUT_PATHS.prompts}`);
  console.log(
    declaresLegacy
      ? `✅ Documentation generated: ${OUTPUT_PATHS.legacy}`
      : 'ℹ️  Skipped AVAILABLE_TOOLS_LEGACY.md — no tool declares legacy',
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`\u274c  ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  GROUP_LEVELS,
  servedEntries,
  readOnlySetTools,
  renderParams,
  variantMarkdown,
  loadToolsFromHandlers,
  generateMarkdown,
  generateLevelMarkdown,
  generatePromptsMarkdown,
  httpSectionMarkdown,
  httpNavigationMarkdown,
  stateHandleRule,
};
