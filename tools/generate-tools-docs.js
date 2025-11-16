#!/usr/bin/env node

/**
 * Generate AVAILABLE_TOOLS.md documentation from TOOL_DEFINITION exports
 *
 * This script automatically generates documentation for all MCP ABAP ADT tools
 * by reading TOOL_DEFINITION from handler files.
 *
 * Usage:
 *   node tools/generate-tools-docs.js [--help]
 *   npm run docs:tools
 *
 * Options:
 *   --help, -h    Show this help message
 *
 * What it does:
 *   1. Scans all handler files in src/handlers/
 *   2. Extracts TOOL_DEFINITION from each handler
 *   3. Groups tools by category
 *   4. Generates markdown documentation with descriptions, parameters, and examples
 *   5. Writes to doc/AVAILABLE_TOOLS.md
 *
 * Example:
 *   $ npm run docs:tools
 *   🔍 Loading tools from handlers...
 *   ✅ Found 31 tools
 *   📝 Generating documentation...
 *   ✅ Documentation generated: doc/AVAILABLE_TOOLS.md
 */

const fs = require('fs');
const path = require('path');

// Show help if requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: node tools/generate-tools-docs.js [options]

Generate AVAILABLE_TOOLS.md documentation from TOOL_DEFINITION exports

Options:
  --help, -h    Show this help message

What it does:
  • Scans all handler files in src/handlers/
  • Extracts TOOL_DEFINITION from each handler
  • Groups tools by category (Programs, Tables, Enhancements, etc.)
  • Generates markdown documentation with:
    - Tool descriptions
    - Parameter lists with types and descriptions
    - Example JSON for each tool
    - Special notes (e.g., ABAP Cloud limitations)
  • Writes to doc/AVAILABLE_TOOLS.md

Examples:
  $ npm run docs:tools
  $ node tools/generate-tools-docs.js

See also:
  • tools/update-handlers-with-tool-definitions.js - Add TOOL_DEFINITION to new handlers
  • doc/AVAILABLE_TOOLS.md - Generated documentation
  • TOOLS_ARCHITECTURE.md - Architecture documentation
`);
  process.exit(0);
}

// Tool category mappings
const CATEGORY_MAP = {
  // Programs, classes, functions
  'GetProgram': 'Programs, Classes, Functions',
  'GetClass': 'Programs, Classes, Functions',
  'GetFunction': 'Programs, Classes, Functions',
  'GetFunctionGroup': 'Programs, Classes, Functions',

  // Tables, structures
  'GetTable': 'Tables and Structures',
  'GetStructure': 'Tables and Structures',
  'GetTableContents': 'Tables and Structures',

  // Packages, interfaces
  'GetPackage': 'Packages and Interfaces',
  'GetInterface': 'Packages and Interfaces',

  // Includes, hierarchies
  'GetInclude': 'Includes and Hierarchies',
  'GetIncludesList': 'Includes and Hierarchies',
  'GetObjectStructure': 'Includes and Hierarchies',

  // Types, descriptions, metadata
  'GetTypeInfo': 'Types, Descriptions, Metadata',
  'GetAdtTypes': 'Types, Descriptions, Metadata',
  'GetObjectInfo': 'Types, Descriptions, Metadata',

  // Search, SQL, transactions
  'SearchObject': 'Search, SQL, Transactions',
  'GetSqlQuery': 'Search, SQL, Transactions',
  'GetTransaction': 'Search, SQL, Transactions',
  'GetWhereUsed': 'Search, SQL, Transactions',

  // Enhancement
  'GetEnhancements': 'Enhancements',
  'GetEnhancementSpot': 'Enhancements',
  'GetEnhancementImpl': 'Enhancements',
  'GetBdef': 'Enhancements',

  // ABAP Parser & Semantic Analysis
  'GetAbapAST': 'ABAP Parser and Semantic Analysis',
  'GetAbapSemanticAnalysis': 'ABAP Parser and Semantic Analysis',
  'GetAbapSystemSymbols': 'ABAP Parser and Semantic Analysis',

  // Batch operations
  'GetObjectsByType': 'Batch Operations',
  'GetObjectsList': 'Batch Operations',
  'GetProgFullCode': 'Batch Operations',
  'GetObjectNodeFromCache': 'Batch Operations',
  'DescribeByList': 'Batch Operations',
};

// Category order for output
const CATEGORY_ORDER = [
  'Programs, Classes, Functions',
  'Tables and Structures',
  'Packages and Interfaces',
  'Includes and Hierarchies',
  'Types, Descriptions, Metadata',
  'Search, SQL, Transactions',
  'Enhancements',
  'ABAP Parser and Semantic Analysis',
  'Batch Operations',
];

// Special notes for certain tools
const TOOL_NOTES = {
  'GetTableContents': '> **⚠️ ABAP Cloud Limitation:** Direct access to table data through ADT Data Preview is blocked by SAP BTP backend policies. When authenticating via JWT/XSUAA, the server will return a descriptive error. This function works only for on-premise systems.',
  'GetSqlQuery': '> **⚠️ ABAP Cloud Limitation:** Direct execution of SQL queries through ADT Data Preview is blocked by SAP BTP backend policies. When authenticating via JWT/XSUAA, the server will return a descriptive error. This function works only for on-premise systems.',
};

// Special handling for batch detection tools
const BATCH_DETECTION_TOOLS = ['DetectObjectTypeListArray', 'DetectObjectTypeListJson'];

/**
 * Parse TypeScript file to extract TOOL_DEFINITION
 */
function extractToolDefinition(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Find TOOL_DEFINITION export - handle multiline, with or without "as const"
    let toolDefMatch = content.match(/export const TOOL_DEFINITION\s*=\s*\{[\s\S]*?\}\s*as\s*const;/);
    if (!toolDefMatch) {
      // Try without "as const"
      toolDefMatch = content.match(/export const TOOL_DEFINITION\s*=\s*\{[\s\S]*?\}\s*;/);
      if (!toolDefMatch) {
        return null;
      }
    }

    const toolDefStr = toolDefMatch[0];

    // Extract name - handle both "name" and 'name', with or without quotes around key
    let nameMatch = toolDefStr.match(/["']?name["']?\s*:\s*["']([^"']+)["']/);
    if (!nameMatch) {
      // Try with single quotes
      nameMatch = toolDefStr.match(/["']?name["']?\s*:\s*[']([^']+)[']/);
      if (!nameMatch) return null;
    }
    const name = nameMatch[1];

    // Extract description - handle multiline descriptions, with or without quotes around key
    let descMatch = toolDefStr.match(/["']?description["']?\s*:\s*["']([^"']+)["']/);
    if (!descMatch) {
      descMatch = toolDefStr.match(/["']?description["']?\s*:\s*[']([^']+)[']/);
    }
    const description = descMatch ? descMatch[1] : '';

    // Extract inputSchema
    const schemaStart = toolDefStr.indexOf('inputSchema:');
    if (schemaStart === -1) {
      return { name, description, inputSchema: null };
    }

    // Find the matching brace for inputSchema
    let braceCount = 0;
    let inSchema = false;
    let schemaEnd = schemaStart;
    for (let i = schemaStart; i < toolDefStr.length; i++) {
      if (toolDefStr[i] === '{') {
        braceCount++;
        inSchema = true;
      } else if (toolDefStr[i] === '}') {
        braceCount--;
        if (inSchema && braceCount === 0) {
          schemaEnd = i + 1;
          break;
        }
      }
    }

    const schemaStr = toolDefStr.substring(schemaStart, schemaEnd);

    // Extract properties - more robust parsing
    const properties = {};

    // Find all property definitions
    const propPattern = /["']?(\w+)["']?\s*:\s*\{([^}]*type:\s*["'](\w+)["'][^}]*description:\s*["']([^"']+)["'][^}]*)\}/g;
    let propMatch;
    while ((propMatch = propPattern.exec(schemaStr)) !== null) {
      const propName = propMatch[1];
      const propType = propMatch[3];
      const propDesc = propMatch[4];

      // Check for default value
      const defaultMatch = propMatch[2].match(/default:\s*([^,}\n]+)/);

      properties[propName] = {
        type: propType,
        description: propDesc,
        ...(defaultMatch && { default: defaultMatch[1].trim().replace(/["']/g, '') })
      };
    }

    // Extract required fields
    const requiredMatch = schemaStr.match(/required:\s*\[([^\]]*)\]/s);
    const required = requiredMatch
      ? requiredMatch[1]
          .split(',')
          .map(s => s.trim().replace(/["']/g, ''))
          .filter(Boolean)
      : [];

    return {
      name,
      description,
      inputSchema: {
        type: 'object',
        properties,
        required
      }
    };
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Load all tools from toolsRegistry
 */
function loadAllTools() {
  const registryPath = path.join(__dirname, '../src/lib/toolsRegistry.ts');
  const content = fs.readFileSync(registryPath, 'utf8');

  const tools = [];
  const handlerFiles = [];

  // Extract all handler imports
  const importMatches = content.matchAll(/import \{ TOOL_DEFINITION as (\w+)_Tool \} from '\.\.\/handlers\/(\w+)';/g);
  for (const match of importMatches) {
    const handlerName = match[2];
    const handlerPath = path.join(__dirname, `../src/handlers/${handlerName}.ts`);

    if (fs.existsSync(handlerPath)) {
      const toolDef = extractToolDefinition(handlerPath);
      if (toolDef) {
        tools.push(toolDef);
      }
    }
  }

  return tools;
}

/**
 * Format parameter documentation
 */
function formatParameter(propName, propDef) {
  const type = propDef.type || 'any';
  const desc = propDef.description || '';
  const isRequired = false; // Will be determined from required array
  const optional = propDef.default !== undefined ? ' (optional, default: ' + JSON.stringify(propDef.default) + ')' : '';

  return `- \`${propName}\` (${type}, ${isRequired ? 'required' : 'optional'}${optional}) - ${desc}`;
}

/**
 * Generate example JSON for a tool
 */
function generateExample(tool) {
  const example = {};

  if (!tool.inputSchema || !tool.inputSchema.properties) {
    return '{}';
  }

  for (const [propName, propDef] of Object.entries(tool.inputSchema.properties)) {
    const isRequired = tool.inputSchema.required?.includes(propName) || false;

    if (isRequired || propDef.default !== undefined) {
      // Generate example value based on type
      switch (propDef.type) {
        case 'string':
          example[propName] = propName.includes('name') ? `"ZMY_${propName.toUpperCase().replace('_', '_')}"`
            : propName.includes('type') ? `"PROG/P"`
            : `"example_value"`;
          break;
        case 'number':
          example[propName] = propDef.default || 100;
          break;
        case 'boolean':
          example[propName] = propDef.default || true;
          break;
        case 'array':
          example[propName] = [];
          break;
        case 'object':
          example[propName] = {};
          break;
        default:
          example[propName] = `"example"`;
      }
    }
  }

  return JSON.stringify(example, null, 2);
}

/**
 * Generate markdown documentation
 */
function generateMarkdown(tools) {
  // Group tools by category
  const categories = {};

  for (const tool of tools) {
    const category = CATEGORY_MAP[tool.name] || 'Other';
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(tool);
  }

  // Sort tools within categories by name
  for (const category of Object.keys(categories)) {
    categories[category].sort((a, b) => a.name.localeCompare(b.name));
  }

  let markdown = `# Available Tools Reference - MCP ABAP ADT Server

This document contains a complete list of all tools (functions) provided by the MCP ABAP ADT server, with descriptions of their purpose and parameters.

> **Note:** This document is automatically generated from \`TOOL_DEFINITION\` exports in handler modules. To regenerate, run:
> \`\`\`bash
> npm run docs:tools
> \`\`\`

## 📋 Table of Contents

`;

  // Generate table of contents
  for (const category of CATEGORY_ORDER) {
    if (categories[category]) {
      const anchor = category.toLowerCase().replace(/\s+/g, '-');
      markdown += `- [${category}](#${anchor})\n`;
    }
  }

  markdown += '\n---\n\n';

  // Generate documentation for each category
  for (const category of CATEGORY_ORDER) {
    if (!categories[category]) continue;

    const anchor = category.toLowerCase().replace(/\s+/g, '-');
    markdown += `## ${category}\n\n`;

    for (const tool of categories[category]) {
      markdown += `### ${tool.name}\n`;
      markdown += `**Description:** ${tool.description}\n\n`;

      // Add special notes if any
      if (TOOL_NOTES[tool.name]) {
        markdown += `${TOOL_NOTES[tool.name]}\n\n`;
      }

      // Parameters
      if (tool.inputSchema && tool.inputSchema.properties && Object.keys(tool.inputSchema.properties).length > 0) {
        markdown += `**Parameters:**\n`;
        for (const [propName, propDef] of Object.entries(tool.inputSchema.properties)) {
          const isRequired = tool.inputSchema.required?.includes(propName) || false;
          const optional = propDef.default !== undefined ? ` (default: ${JSON.stringify(propDef.default)})` : '';
          markdown += `- \`${propName}\` (${propDef.type || 'any'}, ${isRequired ? 'required' : 'optional'}${optional}) - ${propDef.description || ''}\n`;
        }
        markdown += '\n';
      } else {
        markdown += `**Parameters:** None\n\n`;
      }

      // Example
      markdown += `**Example:**\n`;
      markdown += `\`\`\`json\n`;
      markdown += generateExample(tool);
      markdown += `\n\`\`\`\n\n`;

      markdown += '---\n\n';
    }
  }

  // Add batch detection tools section if needed
  const batchTools = tools.filter(t => BATCH_DETECTION_TOOLS.includes(t.name));
  if (batchTools.length > 0) {
    markdown += `## Batch Detection Tools\n\n`;
    for (const tool of batchTools) {
      markdown += `### ${tool.name}\n`;
      markdown += `**Description:** ${tool.description}\n\n`;
      markdown += `For more details, see: [doc/DetectObjectTypeListTools.md](DetectObjectTypeListTools.md)\n\n`;
      markdown += '---\n\n';
    }
  }

  // Add notes section
  markdown += `## Notes

### ABAP Cloud Limitations

Some functions have limitations when working with ABAP Cloud on SAP BTP:

- **GetTableContents** - Direct access to table data is blocked
- **GetSqlQuery** - Direct execution of SQL queries is blocked

These functions work only for on-premise systems.

### Caching

All handler modules use a centralized in-memory cache (\`objectsListCache\`) to improve performance and consistency.

### Response Format

All functions return MCP-compliant responses in the following format:
\`\`\`typescript
{
  isError: boolean;
  content: Array<{
    type: "text";
    text: string;
  }>;
}
\`\`\`

---

## Additional Information

- [Tools Architecture](../TOOLS_ARCHITECTURE.md) - Technical documentation about the tools architecture
- [Installation Guide](INSTALLATION_GUIDE_UA.md) - Setup and configuration instructions
- [README](../README.md) - Main project documentation

---

*Last updated: ${new Date().toISOString().split('T')[0]}*
*Document version: 1.0*
*Generated automatically from TOOL_DEFINITION exports*
`;

  return markdown;
}

/**
 * Main function
 */
function main() {
  console.log('🔍 Loading tools from handlers...');
  const tools = loadAllTools();

  if (tools.length === 0) {
    console.error('❌ No tools found!');
    process.exit(1);
  }

  console.log(`✅ Found ${tools.length} tools`);
  console.log('📝 Generating documentation...');

  const markdown = generateMarkdown(tools);

  const outputPath = path.join(__dirname, '../doc/AVAILABLE_TOOLS.md');
  fs.writeFileSync(outputPath, markdown, 'utf8');

  console.log(`✅ Documentation generated: ${outputPath}`);
  console.log(`📊 Documented ${tools.length} tools`);
}

if (require.main === module) {
  main();
}

module.exports = { loadAllTools, generateMarkdown };

