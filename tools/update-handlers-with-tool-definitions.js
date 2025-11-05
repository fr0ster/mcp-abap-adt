#!/usr/bin/env node

/**
 * Update handler files with TOOL_DEFINITION if missing
 * 
 * This script checks handler files and helps add TOOL_DEFINITION exports if they're missing.
 * It's useful when creating new handlers or migrating existing ones.
 * 
 * Usage:
 *   node tools/update-handlers-with-tool-definitions.js [--help]
 * 
 * Options:
 *   --help, -h    Show this help message
 * 
 * What it does:
 *   1. Scans all handler files in src/handlers/
 *   2. Checks if each handler has TOOL_DEFINITION
 *   3. If missing, suggests a basic TOOL_DEFINITION based on handler function name
 *   4. Adds the definition to the file (you must review and update parameters!)
 * 
 * Note:
 *   Auto-generated TOOL_DEFINITION may be incomplete. Always review and update:
 *   - Description should be accurate and descriptive
 *   - inputSchema.properties should match the handler function parameters
 *   - required array should list all mandatory parameters
 * 
 * Example:
 *   $ node tools/update-handlers-with-tool-definitions.js
 *   🔍 Checking handler files for TOOL_DEFINITION...
 *   ✓ handleGetProgram.ts - TOOL_DEFINITION already exists
 *   ✎ handleNewHandler.ts - Added TOOL_DEFINITION (please review and update parameters!)
 * 
 * See also:
 *   • tools/generate-tools-docs.js - Generate documentation from TOOL_DEFINITION
 *   • TOOLS_ARCHITECTURE.md - Architecture documentation
 */

const fs = require('fs');
const path = require('path');

// Show help if requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: node tools/update-handlers-with-tool-definitions.js [options]

Update handler files with TOOL_DEFINITION if missing

Options:
  --help, -h    Show this help message

What it does:
  • Scans all handler files in src/handlers/
  • Checks if each handler has TOOL_DEFINITION export
  • If missing, attempts to generate a basic TOOL_DEFINITION:
    - Extracts tool name from handler function (handleXxx -> Xxx)
    - Tries to find description in JSDoc comments
    - Creates basic inputSchema structure
  • Adds TOOL_DEFINITION to the file after imports
  • ⚠️  WARNING: Auto-generated definitions are incomplete!
     You MUST review and update:
     - Description accuracy
     - inputSchema.properties (match handler parameters)
     - required array (list mandatory parameters)
     - Default values if any

Examples:
  $ node tools/update-handlers-with-tool-definitions.js
  $ # Check if all handlers have TOOL_DEFINITION

When to use:
  • When creating a new handler file
  • When migrating old handlers to new architecture
  • To verify all handlers have TOOL_DEFINITION

Best practice:
  • Manually add TOOL_DEFINITION following existing patterns
  • Use this script only as a starting point
  • Always review and complete the generated definition

See also:
  • tools/generate-tools-docs.js - Generate documentation
  • TOOLS_ARCHITECTURE.md - Architecture documentation
  • doc/AVAILABLE_TOOLS.md - Generated tool documentation
`);
  process.exit(0);
}

// Reuse the extraction logic from generate-tools-docs.js
function extractToolDefinition(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check if TOOL_DEFINITION already exists
    if (content.includes('export const TOOL_DEFINITION')) {
      return { exists: true };
    }
    
    // Try to extract from handler function signature and comments
    // This is a fallback - ideally TOOL_DEFINITION should be added manually
    const handlerMatch = content.match(/export\s+(async\s+)?function\s+handle(\w+)/);
    if (!handlerMatch) {
      return { exists: false, error: 'No handler function found' };
    }
    
    const toolName = handlerMatch[2];
    
    // Try to find description in comments
    const commentMatch = content.match(/\/\*\*[\s\S]*?\*\//);
    const description = commentMatch 
      ? commentMatch[0].replace(/\/\*\*|\*\//g, '').trim().split('\n')[0].replace(/^\*\s*/, '').trim()
      : `Handler for ${toolName}`;
    
    return {
      exists: false,
      suggested: {
        name: toolName,
        description: description,
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      }
    };
  } catch (error) {
    return { exists: false, error: error.message };
  }
}

function updateHandlerFile(filePath, handlerName) {
  const result = extractToolDefinition(filePath);
  
  if (result.exists) {
    console.log(`✓ ${path.basename(filePath)} - TOOL_DEFINITION already exists`);
    return false;
  }
  
  if (result.error) {
    console.log(`⚠ ${path.basename(filePath)} - ${result.error}`);
    return false;
  }
  
  if (!result.suggested) {
    console.log(`⚠ ${path.basename(filePath)} - Cannot generate TOOL_DEFINITION automatically`);
    console.log(`  Please add TOOL_DEFINITION manually following the pattern in other handlers.`);
    return false;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  // Find insertion point (after imports)
  let insertIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('import ')) {
      insertIndex = i + 1;
    } else if (lines[i].trim() === '' && insertIndex > 0) {
      insertIndex = i + 1;
      break;
    }
  }
  
  // Generate TOOL_DEFINITION
  const toolDefinition = `export const TOOL_DEFINITION = ${JSON.stringify(result.suggested, null, 2)} as const;

`;
  
  // Insert the definition
  lines.splice(insertIndex, 0, toolDefinition);
  
  // Write the file back
  fs.writeFileSync(filePath, lines.join('\n'));
  console.log(`✎ ${path.basename(filePath)} - Added TOOL_DEFINITION (please review and update parameters!)`);
  return true;
}

function main() {
  console.log('🔍 Checking handler files for TOOL_DEFINITION...\n');
  
  const handlersDir = path.join(__dirname, '..', 'src', 'handlers');
  if (!fs.existsSync(handlersDir)) {
    console.error(`❌ Handlers directory not found: ${handlersDir}`);
    process.exit(1);
  }
  
  const files = fs.readdirSync(handlersDir)
    .filter(file => file.endsWith('.ts') && file.startsWith('handle'));
  
  let updatedCount = 0;
  
  files.forEach(file => {
    const handlerName = path.basename(file, '.ts');
    const filePath = path.join(handlersDir, file);
    
    if (updateHandlerFile(filePath, handlerName)) {
      updatedCount++;
    }
  });
  
  console.log(`\n${updatedCount === 0 ? '✅ All handlers already have TOOL_DEFINITION' : `📝 Updated ${updatedCount} file(s) - please review and update parameters!`}`);
  
  if (updatedCount > 0) {
    console.log('\n⚠️  WARNING: Auto-generated TOOL_DEFINITION may be incomplete!');
    console.log('   Please review and update the inputSchema properties based on the handler function.');
  }
}

if (require.main === module) {
  main();
}

module.exports = { updateHandlerFile, extractToolDefinition };
