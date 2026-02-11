#!/usr/bin/env node

/**
 * Generate AVAILABLE_TOOLS.md from TOOL_DEFINITION in src/handlers/**
 *
 * Rules:
 * - Scan code folders only (src/handlers)
 * - Hierarchy in output: Group(level) -> Object(folder) -> Tools
 */

const fs = require('fs');
const path = require('path');

const HANDLERS_ROOT = path.join(__dirname, '../src/handlers');
const OUTPUT_PATH = path.join(__dirname, '../docs/user-guide/AVAILABLE_TOOLS.md');
const LEVELS = ['readonly', 'high', 'low'];

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: node tools/generate-tools-docs.js

Scans src/handlers/**/(readonly|high|low)/*.ts and generates:
  docs/user-guide/AVAILABLE_TOOLS.md

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
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
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
  let escape = false;

  for (let i = firstBrace; i < content.length; i++) {
    const ch = content[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\') {
      escape = true;
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

function extractToolDefinition(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const block = findToolDefinitionBlock(content);
  if (!block) return null;

  const nameMatch = block.match(/name\s*:\s*['"]([^'"]+)['"]/);
  if (!nameMatch) return null;

  const descMatch = block.match(/description\s*:\s*['"]([^'"]+)['"]/);
  const inputSchemaBlock = extractInputSchemaBlock(block);

  const inputSchema = {
    properties: {},
    required: [],
  };

  if (inputSchemaBlock) {
    const requiredMatch = inputSchemaBlock.match(/required\s*:\s*\[([\s\S]*?)\]/m);
    if (requiredMatch) {
      inputSchema.required = requiredMatch[1]
        .split(',')
        .map(s => s.trim().replace(/['"]/g, ''))
        .filter(Boolean);
    }

    const propertiesMatch = inputSchemaBlock.match(/properties\s*:\s*\{([\s\S]*?)\}\s*,\s*required/m);
    const propertiesBlock = propertiesMatch
      ? propertiesMatch[1]
      : (inputSchemaBlock.match(/properties\s*:\s*\{([\s\S]*?)\}/m)?.[1] || '');

    const propPattern = /([a-zA-Z0-9_]+)\s*:\s*\{([\s\S]*?)\n\s*\}/g;
    let m;
    while ((m = propPattern.exec(propertiesBlock)) !== null) {
      const propName = m[1];
      const body = m[2];
      const type = body.match(/type\s*:\s*['"]([^'"]+)['"]/)?.[1] || 'any';
      const description = body.match(/description\s*:\s*['"]([^'"]+)['"]/)?.[1] || '';
      const defaultRaw = body.match(/default\s*:\s*([^,\n]+)/)?.[1]?.trim();

      inputSchema.properties[propName] = {
        type,
        description,
        default: defaultRaw ? defaultRaw.replace(/^['"]|['"]$/g, '') : undefined,
      };
    }
  }

  return {
    name: nameMatch[1],
    description: descMatch ? descMatch[1] : '',
    inputSchema,
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
    if (a.level !== b.level) return LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level);
    if (a.objectTitle !== b.objectTitle) return a.objectTitle.localeCompare(b.objectTitle);
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
  if (keys.length === 0) return '- None\n';

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
    readonly: tools.filter(t => t.level === 'readonly').length,
    high: tools.filter(t => t.level === 'high').length,
    low: tools.filter(t => t.level === 'low').length,
  };

  let md = `# Available Tools Reference - MCP ABAP ADT Server\n\n`;
  md += `Generated from code in \`src/handlers/**\` (not from docs).\n\n`;
  md += `## Summary\n\n`;
  md += `- Total tools: ${summary.total}\n`;
  md += `- Read-only tools: ${summary.readonly}\n`;
  md += `- High-level tools: ${summary.high}\n`;
  md += `- Low-level tools: ${summary.low}\n\n`;

  md += `## Navigation\n\n`;
  for (const level of LEVELS) {
    const objects = Object.values(grouped[level]).sort((a, b) => a.objectTitle.localeCompare(b.objectTitle));
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
    const objects = Object.values(grouped[level]).sort((a, b) => a.objectTitle.localeCompare(b.objectTitle));
    if (objects.length === 0) continue;

    const levelHeading = `${levelTitle(level)} Group`;
    md += `## ${levelHeading}\n\n`;

    for (const obj of objects) {
      const objectHeading = `${levelTitle(level)} / ${obj.objectTitle}`;
      md += `### ${objectHeading}\n\n`;

      for (const tool of obj.tools) {
        const toolHeading = `${tool.name} (${levelTitle(level)} / ${obj.objectTitle})`;
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

function main() {
  console.log('🔍 Scanning handler code in src/handlers...');
  const tools = loadToolsFromHandlers();

  if (tools.length === 0) {
    console.error('❌ No TOOL_DEFINITION found in src/handlers');
    process.exit(1);
  }

  console.log(`✅ Found ${tools.length} tools`);
  const markdown = generateMarkdown(tools);
  fs.writeFileSync(OUTPUT_PATH, markdown, 'utf8');
  console.log(`✅ Documentation generated: ${OUTPUT_PATH}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  extractToolDefinition,
  loadToolsFromHandlers,
  generateMarkdown,
};
