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
};
// `low` left in 19.0.0: the low set is not served by the full binaries,
// and the low handler files that remain serve compact and high only.
const LEVELS = ['readonly', 'high', 'debug', 'session', 'batch'];

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: node tools/generate-tools-docs.js

Reads the built tool sets (dist; run npm run build first) and generates:
  docs/user-guide/AVAILABLE_TOOLS.md
  docs/user-guide/AVAILABLE_TOOLS_READONLY.md
  docs/user-guide/AVAILABLE_TOOLS_HIGH.md
  docs/user-guide/AVAILABLE_TOOLS_LEGACY.md   (only when a tool declares legacy)

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
  BackgroundRunHandlersGroup: 'readonly',
  HighLevelHandlersGroup: 'high',
  RuntimeRunHandlersGroup: 'high',
  DebugHandlersGroup: 'debug',
  DebugBatchHandlersGroup: 'debug',
  LeftoverSessionHandlersGroup: 'session',
  LeftoverSessionListHandlersGroup: 'session',
  BatchHandlersGroup: 'batch',
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
        if (typeof value.inputSchema === 'object' && !bySchema.has(value.inputSchema))
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

/**
 * A definition's input as JSON Schema: a plain object schema as it is, a Zod
 * shape converted as the MCP SDK lists it (input side).
 */
function jsonSchemaOf(inputSchema) {
  const { z } = require('zod');
  if (inputSchema instanceof z.ZodObject)
    return z.toJSONSchema(inputSchema, { io: 'input' });
  if (
    inputSchema &&
    inputSchema.type === 'object' &&
    typeof inputSchema.properties === 'object'
  )
    return inputSchema;
  return z.toJSONSchema(z.object(inputSchema), { io: 'input' });
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
  return {
    name: definition.name,
    description:
      typeof definition.description === 'string' ? definition.description : '',
    inputSchema: {
      properties,
      required: Array.isArray(schema.required) ? [...schema.required] : [],
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

/** The served definitions of a tool set on stdio, each with its group's name. */
function servedEntries(toolSet) {
  return toolSet
    .groups({ connection: null }, 'stdio')
    .flatMap((group) =>
      group
        .getHandlers()
        .map((entry) => ({ definition: entry.toolDefinition, group: group.constructor.name })),
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
    path.join(DIST_ROOT, 'lib', 'handlers', 'groups', 'ReadOnlyHandlersGroup.js'),
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
  return servedEntries(fullReadOnlyToolSet)
    .map(({ definition, group }) => ({
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
  if (level === 'batch') return 'Batch';
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

function renderParams(tool) {
  const props = tool.inputSchema?.properties || {};
  const keys = Object.keys(props);
  if (keys.length === 0) return '- None\n';

  const required = new Set(tool.inputSchema?.required || []);
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
    all: streamableHttpSurface(fullToolSet),
    readonly: streamableHttpSurface(fullReadOnlyToolSet),
  };
}

function generateMarkdown(tools, surface) {
  const grouped = groupByLevelAndObject(tools);
  const summary = {
    total: tools.length,
    readonly: tools.filter((t) => t.level === 'readonly').length,
    high: tools.filter((t) => t.level === 'high').length,
    debug: tools.filter((t) => t.level === 'debug').length,
    session: tools.filter((t) => t.level === 'session').length,
    batch: tools.filter((t) => t.level === 'batch').length,
  };

  let md = `# Available Tools Reference - MCP ABAP ADT Server\n\n`;
  md += `Generated from the tool definitions the server builds (not from docs).\n\n`;
  md += `## Summary\n\n`;
  md += `- Total tools: ${summary.total}\n`;
  md += `- Read-only tools: ${summary.readonly}\n`;
  md += `- High-level tools: ${summary.high}\n`;
  md += `- Debug tools: ${summary.debug}\n`;
  md += `- Session tools: ${summary.session}\n`;
  md += `- Batch tools: ${summary.batch}\n\n`;

  md += `## Handler Sets\n\n`;
  md += `The binary fixes its tool set (19.0.0); there is no \`--exposition\`.\n\n`;
  md += `- \`readonly\` -> [Read-Only Group](#read-only-group): \`mcp-abap-adt\` (and \`-http\`, \`-sse\`). The read-only binaries (\`mcp-abap-adt-ro\`, \`-http-ro\`, \`-sse-ro\`) serve a set of their own, listed exactly in [AVAILABLE_TOOLS_READONLY.md](AVAILABLE_TOOLS_READONLY.md): this group, the system and search tools, and on stdio the leftover-session list — none of the run tools (\`RuntimeRunClass\`, \`RuntimeRunProgram\`, \`RuntimeCreateProfilerTraceParameters\`), the background-run tools or the leftover-session logoff, which change the system\n`;
  md += `- \`high\` -> [High-Level Group](#high-level-group): \`mcp-abap-adt\`, \`-http\`, \`-sse\`\n`;
  md += `- \`debug\` -> [Debug Group](#debug-group): \`mcp-abap-adt\`, \`-http\`, \`-sse\`; no \`-ro\` binary\n`;
  md += `- every stdio binary -> [Session Group](#session-group) (leftover SAP sessions of an ended process: list, and in the full binaries logoff). No http or sse binary serves them: such a server holds the sessions of many users and writes no session file\n`;
  md += `- every Streamable HTTP binary (\`-http\`, \`-http-ro\`) -> [${HTTP_HEADING}](#${anchorFromHeading(HTTP_HEADING)}): the optional \`state_handle\` argument on every tool, and the long session (${surface.sessionTools.map((tool) => `\`${tool.name}\``).join(', ')}). No stdio or SSE binary serves these\n`;
  md += `- every binary -> [Batch Group](#batch-group) (batch mode: record independent calls, send them together at BatchEnd, read their answers by number; see [BATCH_MODE.md](BATCH_MODE.md)). The compact binaries serve batch mode as one tool, \`HandlerBatch\`. Every other tool's description, as the server lists it, ends with one sentence saying how a call of it behaves in batch mode: recordable, recordable for the arguments it names, or run outside batch mode; the descriptions on this page are the handlers' own, without it\n`;
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
        md += `**Parameters:**\n`;
        md += renderParams(tool);
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
) {
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
      md += `**Parameters:**\n`;
      md += renderParams(tool);
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
        md += `**Parameters:**\n`;
        md += renderParams(tool);
        md += `\n---\n\n`;
      }
    }
  }

  md += `*Last updated: ${new Date().toISOString().slice(0, 10)}*\n`;
  return md;
}

/** What the read-only page lists, said on the page. */
const READ_ONLY_PAGE_INTRO =
  "Exactly the tools `mcp-abap-adt-ro` serves, with the parameters they take there — taken from `fullReadOnlyToolSet`, the set the read-only binaries use. `mcp-abap-adt-sse-ro` serves them without `ListLeftoverSessions`, which is stdio's only, and `mcp-abap-adt-http-ro` the same, with what its [Streamable HTTP section](#streamable-http-binaries) adds. Nothing here changes the system: no high, run, debugger, background-run, leftover-session logoff or resume tool. The batch tools are served here too: the reads none of whose requests depends on another's answer are recorded in batch mode. Each tool's description, as the server lists it, ends with one more sentence on batch mode — recordable, recordable for the arguments it names, or run outside batch mode; the descriptions here are the handlers' own, without it ([BATCH_MODE.md](BATCH_MODE.md) lists every recordable call). `mcp-abap-adt` serves these and more: [all tools](AVAILABLE_TOOLS.md).";

/** What the high-level page says beside its tools. */
const HIGH_PAGE_INTRO =
  "The high-level tools of `mcp-abap-adt`, `-http` and `-sse`. Each tool's description, as the server lists it, ends with one more sentence on batch mode — recordable, recordable for the arguments it names, or run outside batch mode; the descriptions here are the handlers' own, without it ([BATCH_MODE.md](BATCH_MODE.md) lists every recordable call).";

function main() {
  console.log('🔍 Reading the built tool sets...');
  const tools = loadToolsFromHandlers();

  if (tools.length === 0) {
    console.error('❌ The built tool set serves no tool');
    process.exit(1);
  }

  console.log(`✅ Found ${tools.length} tools`);
  const surfaces = httpSurfaces();
  const markdownAll = generateMarkdown(tools, surfaces.all);
  fs.writeFileSync(OUTPUT_PATHS.all, markdownAll, 'utf8');
  fs.writeFileSync(
    OUTPUT_PATHS.readonly,
    generateLevelMarkdown(
      readOnlySetTools(),
      'readonly',
      READ_ONLY_PAGE_INTRO,
      httpSectionMarkdown(surfaces.readonly),
      httpNavigationMarkdown(surfaces.readonly),
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
    ),
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
  loadToolsFromHandlers,
  generateMarkdown,
  generateLevelMarkdown,
  httpSectionMarkdown,
  httpNavigationMarkdown,
  stateHandleRule,
};
