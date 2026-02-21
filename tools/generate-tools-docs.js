#!/usr/bin/env node

/**
 * Generate AVAILABLE_TOOLS.md from TOOL_DEFINITION in src/handlers/**
 *
 * Rules:
 * - Scan code folders only (src/handlers)
 * - Hierarchy in output: Group(level) -> Object(folder) -> Tools
 */

const fs = require('node:fs');
const path = require('node:path');

const HANDLERS_ROOT = path.join(__dirname, '../src/handlers');
const COMPACT_MATRIX_PATH = path.join(
  __dirname,
  '../src/handlers/compact/high/compactMatrix.ts',
);
const OUTPUT_PATHS = {
  all: path.join(__dirname, '../docs/user-guide/AVAILABLE_TOOLS.md'),
  readonly: path.join(
    __dirname,
    '../docs/user-guide/AVAILABLE_TOOLS_READONLY.md',
  ),
  high: path.join(__dirname, '../docs/user-guide/AVAILABLE_TOOLS_HIGH.md'),
  low: path.join(__dirname, '../docs/user-guide/AVAILABLE_TOOLS_LOW.md'),
  compact: path.join(
    __dirname,
    '../docs/user-guide/AVAILABLE_TOOLS_COMPACT.md',
  ),
};
const LEVELS = ['readonly', 'high', 'low'];

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: node tools/generate-tools-docs.js

Scans src/handlers/**/(readonly|high|low)/*.ts and generates:
  docs/user-guide/AVAILABLE_TOOLS.md
  docs/user-guide/AVAILABLE_TOOLS_READONLY.md
  docs/user-guide/AVAILABLE_TOOLS_HIGH.md
  docs/user-guide/AVAILABLE_TOOLS_LOW.md
  docs/user-guide/AVAILABLE_TOOLS_COMPACT.md

Output hierarchy:
  1) Group (level)
  2) Object (folder under src/handlers)
  3) Tools (TOOL_DEFINITION.name)
`);
  process.exit(0);
}

function titleCaseFolder(folder) {
  return folder
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function anchorFromHeading(heading) {
  // GitHub-style links are derived from heading text.
  return slug(heading);
}

function walk(dir, acc) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      acc.push(full);
    }
  }
}

function findToolDefinitionBlock(content) {
  const marker = 'export const TOOL_DEFINITION';
  const start = content.indexOf(marker);
  if (start === -1) return null;

  const firstBrace = content.indexOf('{', start);
  if (firstBrace === -1) return null;

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let isEscaped = false;

  for (let i = firstBrace; i < content.length; i++) {
    const ch = content[i];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (ch === '\\') {
      isEscaped = true;
      continue;
    }

    if (!inDouble && !inTemplate && ch === "'") {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inTemplate && ch === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && ch === '`') {
      inTemplate = !inTemplate;
      continue;
    }

    if (inSingle || inDouble || inTemplate) continue;

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return content.slice(firstBrace, i + 1);
      }
    }
  }

  return null;
}

function extractInputSchemaBlock(toolBlock) {
  const key = 'inputSchema';
  const keyPos = toolBlock.indexOf(key);
  if (keyPos === -1) return null;

  const firstBrace = toolBlock.indexOf('{', keyPos);
  if (firstBrace === -1) return null;

  let depth = 0;
  for (let i = firstBrace; i < toolBlock.length; i++) {
    const ch = toolBlock[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return toolBlock.slice(firstBrace, i + 1);
      }
    }
  }

  return null;
}

function extractInputSchemaRef(toolBlock) {
  const refMatch = toolBlock.match(/inputSchema\s*:\s*([A-Za-z0-9_]+)\b/);
  return refMatch ? refMatch[1] : null;
}

function findMatchingBrace(content, openIndex) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let isEscaped = false;

  for (let i = openIndex; i < content.length; i++) {
    const ch = content[i];
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (ch === '\\') {
      isEscaped = true;
      continue;
    }
    if (!inDouble && !inTemplate && ch === "'") {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inTemplate && ch === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && ch === '`') {
      inTemplate = !inTemplate;
      continue;
    }
    if (inSingle || inDouble || inTemplate) continue;

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractNamedObjectContent(block, key) {
  const keyPos = block.indexOf(key);
  if (keyPos === -1) return null;
  const open = block.indexOf('{', keyPos);
  if (open === -1) return null;
  const close = findMatchingBrace(block, open);
  if (close === -1) return null;
  return block.slice(open + 1, close);
}

function extractTopLevelRequiredArray(block) {
  const matches = [...block.matchAll(/required\s*:\s*\[([^\]]*)\]/g)];
  if (matches.length === 0) return [];
  const raw = matches[matches.length - 1][1];
  return raw
    .split(',')
    .map((s) => s.trim().replace(/['"]/g, ''))
    .filter(Boolean);
}

function parseTopLevelProperties(propertiesContent) {
  const props = {};
  let i = 0;
  while (i < propertiesContent.length) {
    while (
      i < propertiesContent.length &&
      /[\s,\n\r\t]/.test(propertiesContent[i])
    ) {
      i++;
    }
    if (i >= propertiesContent.length) break;

    const keyMatch = propertiesContent.slice(i).match(/^([A-Za-z0-9_]+)/);
    if (!keyMatch) {
      i++;
      continue;
    }
    const key = keyMatch[1];
    i += key.length;

    while (i < propertiesContent.length && /\s/.test(propertiesContent[i])) i++;
    if (propertiesContent[i] !== ':') continue;
    i++;
    while (i < propertiesContent.length && /\s/.test(propertiesContent[i])) i++;
    if (propertiesContent[i] === '{') {
      const open = i;
      const close = findMatchingBrace(propertiesContent, open);
      if (close === -1) break;
      const body = propertiesContent.slice(open + 1, close);

      const type = body.match(/type\s*:\s*['"]([^'"]+)['"]/)?.[1] || 'any';
      const description =
        body.match(/description\s*:\s*['"]([^'"]+)['"]/)?.[1] || '';
      const defaultRaw = body.match(/default\s*:\s*([^,\n]+)/)?.[1]?.trim();

      props[key] = {
        type,
        description,
        default: defaultRaw
          ? defaultRaw.replace(/^['"]|['"]$/g, '')
          : undefined,
      };
      i = close + 1;
      continue;
    }

    // Fallback for schema references like "object_type: commonObjectTypeSchema"
    props[key] = { type: 'any', description: '', default: undefined };
    while (
      i < propertiesContent.length &&
      propertiesContent[i] !== ',' &&
      propertiesContent[i] !== '\n'
    ) {
      i++;
    }
    i++;
  }
  return props;
}

function parseInputSchemaBlock(inputSchemaBlock) {
  const inputSchema = {
    properties: {},
    required: [],
  };

  if (!inputSchemaBlock) return inputSchema;

  inputSchema.required = extractTopLevelRequiredArray(inputSchemaBlock);
  const propertiesContent = extractNamedObjectContent(
    inputSchemaBlock,
    'properties',
  );
  if (propertiesContent) {
    inputSchema.properties = parseTopLevelProperties(propertiesContent);
  }

  return inputSchema;
}

function extractImportPathForSymbol(content, symbol) {
  const importRegex = /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m = importRegex.exec(content);
  while (m !== null) {
    const symbolsRaw = m[1];
    const importPath = m[2];
    const symbols = symbolsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (symbols.includes(symbol)) {
      return importPath;
    }
    m = importRegex.exec(content);
  }
  return null;
}

function extractToolDefinition(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const block = findToolDefinitionBlock(content);
  if (!block) return null;

  const nameMatch = block.match(/name\s*:\s*['"]([^'"]+)['"]/);
  if (!nameMatch) return null;

  const descMatch = block.match(/description\s*:\s*['"]([^'"]+)['"]/);
  const inputSchemaBlock = extractInputSchemaBlock(block);
  const inputSchemaRef = inputSchemaBlock ? null : extractInputSchemaRef(block);
  let inputSchema = parseInputSchemaBlock(inputSchemaBlock);

  // Resolve referenced schema (e.g. compactActionSchema) from imported file.
  if (
    inputSchemaRef &&
    Object.keys(inputSchema.properties).length === 0 &&
    filePath.endsWith('.ts')
  ) {
    const importPath = extractImportPathForSymbol(content, inputSchemaRef);
    if (importPath) {
      const resolvedPath = path.resolve(
        path.dirname(filePath),
        `${importPath}.ts`,
      );
      if (fs.existsSync(resolvedPath)) {
        const refContent = fs.readFileSync(resolvedPath, 'utf8');
        const refBlock = extractConstObjectBlock(refContent, inputSchemaRef);
        if (refBlock) {
          inputSchema = parseInputSchemaBlock(refBlock);
        }
      }
    }
  }

  return {
    name: nameMatch[1],
    description: descMatch ? descMatch[1] : '',
    inputSchema,
    inputSchemaRef,
  };
}

function extractConstObjectBlock(content, constName) {
  const marker = `export const ${constName}`;
  const start = content.indexOf(marker);
  if (start === -1) return null;

  const firstBrace = content.indexOf('{', start);
  if (firstBrace === -1) return null;

  let depth = 0;
  for (let i = firstBrace; i < content.length; i++) {
    const ch = content[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return content.slice(firstBrace, i + 1);
      }
    }
  }
  return null;
}

function parseMatrixObject(block) {
  const result = {};
  const entryPattern = /([A-Z_]+)\s*:\s*\[([^\]]*)\]/g;
  let entry = entryPattern.exec(block);
  while (entry !== null) {
    const objectType = entry[1];
    const rawValues = entry[2].trim();
    const values = rawValues
      ? rawValues
          .split(',')
          .map((s) => s.trim().replace(/['"]/g, ''))
          .filter(Boolean)
      : [];
    result[objectType] = values;
    entry = entryPattern.exec(block);
  }
  return result;
}

function loadCompactMatrix() {
  const content = fs.readFileSync(COMPACT_MATRIX_PATH, 'utf8');
  const crudBlock = extractConstObjectBlock(content, 'COMPACT_CRUD_MATRIX');
  if (!crudBlock) {
    throw new Error(
      'Failed to read COMPACT_CRUD_MATRIX from compactMatrix.ts',
    );
  }

  return {
    crud: parseMatrixObject(crudBlock),
  };
}

function loadToolsFromHandlers() {
  const files = [];
  walk(HANDLERS_ROOT, files);

  const tools = [];

  for (const filePath of files) {
    const rel = path.relative(HANDLERS_ROOT, filePath).replace(/\\/g, '/');
    const parts = rel.split('/');
    if (parts.length < 3) continue;

    const objectFolder = parts[0];
    const level = parts[1];
    if (!LEVELS.includes(level)) continue;

    const toolDef = extractToolDefinition(filePath);
    if (!toolDef) continue;

    tools.push({
      ...toolDef,
      objectFolder,
      objectTitle: titleCaseFolder(objectFolder),
      level,
      filePath: `src/handlers/${rel}`,
    });
  }

  tools.sort((a, b) => {
    if (a.level !== b.level)
      return LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level);
    if (a.objectTitle !== b.objectTitle)
      return a.objectTitle.localeCompare(b.objectTitle);
    return a.name.localeCompare(b.name);
  });

  return tools;
}

function levelTitle(level) {
  if (level === 'readonly') return 'Read-Only';
  if (level === 'high') return 'High-Level';
  if (level === 'low') return 'Low-Level';
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
  if (keys.length === 0) {
    if (tool.inputSchemaRef) {
      return `- See schema reference \`${tool.inputSchemaRef}\` in source file\n`;
    }
    return '- None\n';
  }

  const required = new Set(tool.inputSchema?.required || []);
  let out = '';
  for (const key of keys.sort((a, b) => a.localeCompare(b))) {
    const p = props[key];
    const req = required.has(key) ? 'required' : 'optional';
    const def = p.default !== undefined ? ` (default: ${p.default})` : '';
    out += `- \`${key}\` (${p.type}, ${req}${def}) - ${p.description}\n`;
  }
  return out;
}

function generateMarkdown(tools) {
  const grouped = groupByLevelAndObject(tools);
  const summary = {
    total: tools.length,
    readonly: tools.filter((t) => t.level === 'readonly').length,
    high: tools.filter((t) => t.level === 'high').length,
    low: tools.filter((t) => t.level === 'low').length,
    compact: tools.filter(
      (t) => t.level === 'high' && t.objectFolder === 'compact',
    ).length,
  };

  let md = `# Available Tools Reference - MCP ABAP ADT Server\n\n`;
  md += `Generated from code in \`src/handlers/**\` (not from docs).\n\n`;
  md += `## Summary\n\n`;
  md += `- Total tools: ${summary.total}\n`;
  md += `- Read-only tools: ${summary.readonly}\n`;
  md += `- High-level tools: ${summary.high}\n`;
  md += `- Low-level tools: ${summary.low}\n\n`;
  md += `- Compact tools: ${summary.compact} (included in High-level group)\n\n`;

  md += `## Handler Sets\n\n`;
  md += `- \`readonly\` -> [Read-Only Group](#read-only-group)\n`;
  md += `- \`high\` -> [High-Level Group](#high-level-group)\n`;
  md += `- \`low\` -> [Low-Level Group](#low-level-group)\n`;
  md += `- \`compact\` -> [High-Level / Compact](#high-level-compact)\n\n`;

  md += `## Navigation\n\n`;
  md += `- [Compact Set](#high-level-compact)\n`;
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

  md += `*Last updated: ${new Date().toISOString().slice(0, 10)}*\n`;
  return md;
}

function generateLevelMarkdown(tools, level) {
  const levelTools = tools.filter((t) => t.level === level);
  const grouped = groupByLevelAndObject(levelTools);
  const objects = Object.values(grouped[level]).sort((a, b) =>
    a.objectTitle.localeCompare(b.objectTitle),
  );

  let md = `# ${levelTitle(level)} Tools - MCP ABAP ADT Server\n\n`;
  md += `Generated from code in \`src/handlers/**\` (not from docs).\n\n`;
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

  md += `*Last updated: ${new Date().toISOString().slice(0, 10)}*\n`;
  return md;
}

function generateCompactMarkdown(tools) {
  const compactTools = tools.filter(
    (t) => t.level === 'high' && t.objectFolder === 'compact',
  );
  const compactMatrix = loadCompactMatrix();

  let md = `# Compact Tools - MCP ABAP ADT Server\n\n`;
  md += `Generated from code in \`src/handlers/compact/high\` (not from docs).\n\n`;
  md += `- Group: Compact\n`;
  md += `- Total tools: ${compactTools.length}\n\n`;

  md += `## How It Works\n\n`;
  md += `Compact is a facade over existing high-level/runtime handlers.\n`;
  md += `You call one compact tool by intent and route by typed payload fields.\n\n`;
  md += `## Start Here\n\n`;
  md += `Pick tool by intent:\n\n`;
  md += `- Create object -> \`HandlerCreate\`\n`;
  md += `- Read object -> \`HandlerGet\`\n`;
  md += `- Update object -> \`HandlerUpdate\`\n`;
  md += `- Delete object -> \`HandlerDelete\`\n`;
  md += `- Validate object/binding -> \`HandlerValidate\`\n`;
  md += `- Activate object(s) -> \`HandlerActivate\`\n`;
  md += `- Lock object -> \`HandlerLock\`\n`;
  md += `- Unlock object -> \`HandlerUnlock\`\n`;
  md += `- Check run (syntax) -> \`HandlerCheckRun\`\n`;
  md += `- ABAP Unit run/status/result -> \`HandlerUnitTestRun|HandlerUnitTestStatus|HandlerUnitTestResult\`\n`;
  md += `- CDS Unit status/result -> \`HandlerCdsUnitTestStatus|HandlerCdsUnitTestResult\`\n`;
  md += `- Runtime profile run/list/view -> \`HandlerProfileRun|HandlerProfileList|HandlerProfileView\`\n`;
  md += `- Runtime dump list/view -> \`HandlerDumpList|HandlerDumpView\`\n`;
  md += `- Service binding list/validate -> \`HandlerServiceBindingListTypes|HandlerServiceBindingValidate\`\n`;
  md += `- Transport create -> \`HandlerTransportCreate\`\n`;
  md += `\n`;
  md += `Request contract:\n\n`;
  md += `- CRUD: \`HandlerCreate|HandlerGet|HandlerUpdate|HandlerDelete\` with required \`object_type\`.\n`;
  md += `- Lifecycle: \`HandlerValidate|HandlerActivate|HandlerLock|HandlerUnlock|HandlerCheckRun\` with compact lifecycle params.\n`;
  md += `- Action-specific tools above use narrow typed payloads.\n\n`;
  md += `## Routing Matrix\n\n`;
  md += `Source of truth: \`src/handlers/compact/high/compactMatrix.ts\`.\n`;
  md += `Facade dispatch is deterministic by \`object_type\` and CRUD operation.\n\n`;
  md += `| object_type | CRUD |\n`;
  md += `| --- | --- |\n`;
  for (const objectType of Object.keys(compactMatrix.crud).sort()) {
    const crud = compactMatrix.crud[objectType];
    md += `| \`${objectType}\` | ${
      crud.length > 0 ? `\`${crud.join('`, `')}\`` : '-'
    } |\n`;
  }
  md += `\n`;
  md += `Unsupported combinations return deterministic error:\n`;
  md += `- \`Unsupported <operation> for object_type: <TYPE>\`\n\n`;

  md += `## Action Recipes\n\n`;
  md += `Preferred dedicated compact tools and minimal payloads:\n\n`;
  md += `| Goal | Tool | Required fields |\n`;
  md += `| --- | --- | --- |\n`;
  md += `| Run ABAP Unit | \`HandlerUnitTestRun\` | \`tests[]\` |\n`;
  md += `| Unit status | \`HandlerUnitTestStatus\` | \`run_id\` |\n`;
  md += `| Unit result | \`HandlerUnitTestResult\` | \`run_id\` |\n`;
  md += `| CDS unit status | \`HandlerCdsUnitTestStatus\` | \`run_id\` |\n`;
  md += `| CDS unit result | \`HandlerCdsUnitTestResult\` | \`run_id\` |\n`;
  md += `| List binding types | \`HandlerServiceBindingListTypes\` | none |\n`;
  md += `| Validate binding | \`HandlerServiceBindingValidate\` | \`service_binding_name\`, \`service_definition_name\` |\n`;
  md += `| Create transport | \`HandlerTransportCreate\` | \`description\` |\n`;
  md += `| Run profiling (class/program) | \`HandlerProfileRun\` | \`target_type\` + target name |\n`;
  md += `| List profiler traces | \`HandlerProfileList\` | none |\n`;
  md += `| Read profiler trace | \`HandlerProfileView\` | \`trace_id_or_uri\`, \`view\` |\n`;
  md += `| List dumps | \`HandlerDumpList\` | none |\n`;
  md += `| Read dump | \`HandlerDumpView\` | \`dump_id\` |\n\n`;

  md += `## Minimal Payload Contracts\n\n`;
  md += `- \`HandlerCreate|Get|Update|Delete\`: always require \`object_type\`, plus object-specific fields.\n`;
  md += `- Dedicated action tools above expose narrow payloads.\n`;
  md += `- Common required pairs:\n`;
  md += `  - unit tests status/result: \`run_id\`\n`;
  md += `  - dump details: \`dump_id\`\n`;
  md += `  - profiler details: \`trace_id_or_uri\` + \`view\` (\`hitlist|statements|db_accesses\`)\n`;
  md += `  - service binding validate: \`service_binding_name\` + \`service_definition_name\`\n`;
  md += `  - class profiling: \`class_name\`\n`;
  md += `  - program profiling: \`program_name\`\n\n`;
  md += `### Quick Examples\n\n`;
  md += `- Run profiling for class:\n`;
  md += `  - \`HandlerProfileRun\` + \`{ "target_type":"CLASS", "class_name":"ZCL_FOO" }\`\n`;
  md += `- Read one profiler trace:\n`;
  md += `  - \`HandlerProfileView\` + \`{ "trace_id_or_uri":"...", "view":"hitlist" }\`\n`;
  md += `- Read one dump:\n`;
  md += `  - \`HandlerDumpView\` + \`{ "dump_id":"...", "view":"summary" }\`\n\n`;
  md += `- List dumps:\n`;
  md += `  - \`HandlerDumpList\` + \`{ "top":20, "orderby":"CREATED_AT desc" }\`\n`;
  md += `- List profiler traces:\n`;
  md += `  - \`HandlerProfileList\` + \`{}\`\n`;
  md += `- Validate service binding:\n`;
  md += `  - \`HandlerServiceBindingValidate\` + \`{ "service_binding_name":"ZSB_FOO", "service_definition_name":"ZSD_FOO" }\`\n\n`;

  md += `## Navigation\n\n`;
  md += `- [Compact Group](#compact-group)\n`;
  for (const tool of compactTools) {
    const toolHeading = `${tool.name} (Compact)`;
    md += `  - [${tool.name}](#${anchorFromHeading(toolHeading)})\n`;
  }

  md += `\n---\n\n`;
  md += `<a id="compact-group"></a>\n`;
  md += `## Compact Group\n\n`;
  md += `<a id="compact"></a>\n`;
  md += `### Compact\n\n`;

  for (const tool of compactTools.sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const toolHeading = `${tool.name} (Compact)`;
    md += `<a id="${anchorFromHeading(toolHeading)}"></a>\n`;
    md += `#### ${toolHeading}\n`;
    md += `**Description:** ${tool.description || 'No description'}\n\n`;
    md += `**Source:** \`${tool.filePath}\`\n\n`;
    md += `**Parameters:**\n`;
    md += renderParams(tool);
    md += `\n---\n\n`;
  }

  md += `*Last updated: ${new Date().toISOString().slice(0, 10)}*\n`;
  return md;
}

function main() {
  console.log('🔍 Scanning handler code in src/handlers...');
  const tools = loadToolsFromHandlers();

  if (tools.length === 0) {
    console.error('❌ No TOOL_DEFINITION found in src/handlers');
    process.exit(1);
  }

  console.log(`✅ Found ${tools.length} tools`);
  const markdownAll = generateMarkdown(tools);
  fs.writeFileSync(OUTPUT_PATHS.all, markdownAll, 'utf8');
  fs.writeFileSync(
    OUTPUT_PATHS.readonly,
    generateLevelMarkdown(tools, 'readonly'),
    'utf8',
  );
  fs.writeFileSync(
    OUTPUT_PATHS.high,
    generateLevelMarkdown(tools, 'high'),
    'utf8',
  );
  fs.writeFileSync(
    OUTPUT_PATHS.low,
    generateLevelMarkdown(tools, 'low'),
    'utf8',
  );
  fs.writeFileSync(
    OUTPUT_PATHS.compact,
    generateCompactMarkdown(tools),
    'utf8',
  );
  console.log(`✅ Documentation generated: ${OUTPUT_PATHS.all}`);
  console.log(`✅ Documentation generated: ${OUTPUT_PATHS.readonly}`);
  console.log(`✅ Documentation generated: ${OUTPUT_PATHS.high}`);
  console.log(`✅ Documentation generated: ${OUTPUT_PATHS.low}`);
  console.log(`✅ Documentation generated: ${OUTPUT_PATHS.compact}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  extractToolDefinition,
  loadToolsFromHandlers,
  generateMarkdown,
  generateLevelMarkdown,
  generateCompactMarkdown,
};
