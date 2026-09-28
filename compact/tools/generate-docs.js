#!/usr/bin/env node
/**
 * The compact facade's tool page, generated from the BUILT packages.
 *
 * `lib`'s generator used to write this page by parsing
 * `src/handlers/compact/high` with regexes. The tools live in two packages now, and
 * regex-parsing source is what produced four defects in PR #244 alone — a Zod
 * getter it could not see, a concatenation it cut, an interpolation it printed
 * verbatim, and a stale build it trusted. So this reads the ENTRIES the packages
 * export: the same objects a client receives over MCP.
 *
 * It refuses a stale build for the same reason `lib`'s generator does: documenting
 * text nobody ships looks exactly like documenting text they do.
 */
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');

/**
 * Resolve the family's package names to this tree's builds.
 *
 * In a checkout `@mcp-abap-adt/lib` is the repository root, not something under
 * `node_modules`, so requiring it by name fails — the same gap `server/tsconfig.json`
 * closes for TYPES with `paths`. This closes it for the runtime, for this script
 * only: an installed copy resolves the real packages and never reaches here.
 */
const LOCAL = {
  '@mcp-abap-adt/lib': path.join(REPO, 'dist', 'index.js'),
  '@mcp-abap-adt/lib/handlers': path.join(
    REPO,
    'dist',
    'lib',
    'handlers',
    'index.js',
  ),
  '@mcp-abap-adt/lib/handlers/read': path.join(
    REPO,
    'dist',
    'lib',
    'handlers',
    'read.js',
  ),
  '@mcp-abap-adt/lib/handlers/write': path.join(
    REPO,
    'dist',
    'lib',
    'handlers',
    'write.js',
  ),
  '@mcp-abap-adt/lib/compact-shared': path.join(
    REPO,
    'dist',
    'lib',
    'compact',
    'index.js',
  ),
  '@mcp-abap-adt/lib/utils': path.join(REPO, 'dist', 'lib', 'utils.js'),
  '@mcp-abap-adt/lib/config': path.join(
    REPO,
    'dist',
    'lib',
    'config',
    'index.js',
  ),
  '@mcp-abap-adt/compact-readonly': path.join(
    REPO,
    'compact-readonly',
    'dist',
    'index.js',
  ),
  '@mcp-abap-adt/compact-modify': path.join(
    REPO,
    'compact-modify',
    'dist',
    'index.js',
  ),
};
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function patched(request, ...rest) {
  if (LOCAL[request]) return LOCAL[request];
  return resolveFilename.call(this, request, ...rest);
};
const OUT = path.join(__dirname, '..', 'docs', 'AVAILABLE_TOOLS.md');

function requireFresh(pkg) {
  const dist = path.join(REPO, pkg, 'dist', 'index.js');
  if (!fs.existsSync(dist)) {
    throw new Error(
      `${pkg}/dist is missing. Run \`npm run build\` in ${pkg} first.`,
    );
  }
  const newest = (dir, ext) => {
    let newestMs = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) newestMs = Math.max(newestMs, newest(full, ext));
      else if (entry.name.endsWith(ext))
        newestMs = Math.max(newestMs, fs.statSync(full).mtimeMs);
    }
    return newestMs;
  };
  const source = newest(path.join(REPO, pkg, 'src'), '.ts');
  const built = newest(path.join(REPO, pkg, 'dist'), '.js');
  if (source > built) {
    throw new Error(
      `${pkg}/dist is ${Math.round((source - built) / 1000)}s behind its src, so this page would not be the tools that ship. Build it first.`,
    );
  }
  return require(dist);
}

/** `name*` for required, `name` for optional — the same rendering the fixture uses. */
function parametersOf(schema) {
  const properties = (schema && schema.properties) || {};
  const required = new Set((schema && schema.required) || []);
  return Object.keys(properties).map((name) => ({
    name,
    required: required.has(name),
    description: (properties[name] && properties[name].description) || '',
  }));
}

function page(entries) {
  const context = () => ({});
  let md = '# Compact Tools — MCP ABAP ADT\n\n';
  md +=
    'Generated from the built packages, not from source text: these are the tool\n';
  md += 'definitions a client receives.\n\n';
  md += `- Tools: ${entries.length}\n`;
  md += '- Read-only half: `@mcp-abap-adt/compact-readonly`\n';
  md += '- Modifying half: `@mcp-abap-adt/compact-modify`\n';
  md += '- Command: `mcp-abap-adt-compact` (`@mcp-abap-adt/compact`)\n\n';
  md += '## How it works\n\n';
  md +=
    'One tool per OPERATION, with the object in `object_type`: `HandlerCreate` with\n';
  md +=
    '`object_type: "CLASS"` rather than a `CreateClass` tool. 22 schemas instead of\n';
  md +=
    "the object-oriented surface's hundreds, for a host that cannot select tools\n";
  md += 'per request.\n\n';
  md += '## Tools\n\n';
  for (const { half, entry } of entries) {
    const tool = entry.toolDefinition;
    md += `### ${tool.name}\n\n`;
    md += `**Half:** \`@mcp-abap-adt/compact-${half}\`\n\n`;
    md += `**Description:** ${tool.description}\n\n`;
    const available = tool.available_in
      ? [...tool.available_in].sort().join(', ')
      : 'all';
    md += `**Available in:** ${available}\n\n`;
    const parameters = parametersOf(tool.inputSchema);
    if (parameters.length === 0) {
      md += '**Parameters:** none\n\n';
      continue;
    }
    md += '**Parameters:**\n\n';
    for (const parameter of parameters) {
      md += `- \`${parameter.name}\`${parameter.required ? ' (required)' : ''} — ${parameter.description}\n`;
    }
    md += '\n';
  }
  void context;
  return md;
}

function main() {
  const readOnly = requireFresh('compact-readonly');
  const modify = requireFresh('compact-modify');
  const context = () => ({});
  const entries = [
    ...readOnly
      .compactReadOnlyEntries(context)
      .map((entry) => ({ half: 'readonly', entry })),
    ...modify
      .compactModifyEntries(context)
      .map((entry) => ({ half: 'modify', entry })),
  ];
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, page(entries), 'utf8');
  console.log(`✅ ${entries.length} compact tools documented: ${OUT}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`❌  ${error.message}`);
    process.exit(1);
  }
}

module.exports = { page, parametersOf };
