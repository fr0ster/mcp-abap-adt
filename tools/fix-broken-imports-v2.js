#!/usr/bin/env node
/**
 * Script to fix broken imports where AbapConnection import was incorrectly inserted
 * This version fixes the issues created by the previous script
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HANDLERS_DIR = path.join(__dirname, '../src/handlers');

function findHandlerFiles() {
  try {
    const result = execSync(`find "${HANDLERS_DIR}" -name "*.ts" -type f`, { encoding: 'utf8' });
    return result.trim().split('\n').filter(f => f && !f.includes('.test.') && !f.includes('.spec.'));
  } catch (error) {
    console.error('Error finding files:', error.message);
    return [];
  }
}

function fixBrokenImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  const originalContent = content;

  // Pattern 1: import { ... } from '...\nimport { AbapConnection } from '@mcp-abap-adt/connection';...';
  // Fix: Move AbapConnection import to separate line and fix the broken import
  content = content.replace(/import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]*)\nimport\s*\{\s*AbapConnection\s*\}\s*from\s*['"]@mcp-abap-adt\/connection['"];([^'"]+)['"];?\s*\n/g, (match, imports, fromPath1, fromPath2) => {
    modified = true;
    return `import { ${imports.trim()} } from '${fromPath1}${fromPath2}';\nimport { AbapConnection } from '@mcp-abap-adt/connection';\n`;
  });

  // Pattern 2: import { ... } from '...\nimport { AbapConnection } from '@mcp-abap-adt/connection';...';
  // Where the import path was split
  content = content.replace(/import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]*)\nimport\s*\{\s*AbapConnection\s*\}\s*from\s*['"]@mcp-abap-adt\/connection['"];([^\n]+)/g, (match, imports, fromPath1, fromPath2) => {
    modified = true;
    // Try to reconstruct the full path
    const fullPath = fromPath1 + fromPath2.replace(/['"];?\s*$/, '');
    return `import { ${imports.trim()} } from '${fullPath}';\nimport { AbapConnection } from '@mcp-abap-adt/connection';\n`;
  });

  // Pattern 3: import { ... } from '...\nimport { AbapConnection } from '@mcp-abap-adt/connection';...';
  // Where import statement is broken in the middle
  content = content.replace(/import\s*\{\s*([^}]*)\s*\}\s*from\s*['"]([^'"]*)\nimport\s*\{\s*AbapConnection\s*\}\s*from\s*['"]@mcp-abap-adt\/connection['"];([^\n]+)/g, (match, imports, fromPath1, rest) => {
    modified = true;
    // The rest might be part of the original import path or a new line
    // Try to reconstruct
    const fullPath = fromPath1 + rest.replace(/['"];?\s*$/, '').trim();
    return `import { ${imports.trim()} } from '${fullPath}';\nimport { AbapConnection } from '@mcp-abap-adt/connection';\n`;
  });

  // Pattern 4: import statement broken with AbapConnection in the middle of the path
  // import { ... } from '...\nimport { AbapConnection } from '@mcp-abap-adt/connection';...';
  content = content.replace(/(import\s*\{\s*[^}]+\s*\}\s*from\s*['"][^'"]*)\nimport\s*\{\s*AbapConnection\s*\}\s*from\s*['"]@mcp-abap-adt\/connection['"];([^'"]+)['"];?\s*\n/g, (match, importPart1, importPart2) => {
    modified = true;
    return `${importPart1}${importPart2}';\nimport { AbapConnection } from '@mcp-abap-adt/connection';\n`;
  });

  // Pattern 5: import { ... } from '...\nimport { AbapConnection } from '@mcp-abap-adt/connection';...';
  // More specific pattern for common cases
  content = content.replace(/import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]*)\nimport\s*\{\s*AbapConnection\s*\}\s*from\s*['"]@mcp-abap-adt\/connection['"];([a-zA-Z_][a-zA-Z0-9_/.]*)/g, (match, imports, fromPath1, fromPath2) => {
    modified = true;
    return `import { ${imports.trim()} } from '${fromPath1}${fromPath2}';\nimport { AbapConnection } from '@mcp-abap-adt/connection';\n`;
  });

  // Pattern 6: Handle cases where the import statement is completely broken
  // import { getHandlerLogger, noopLogger } from '...\nimport { AbapConnection } from '@mcp-abap-adt/connection';...';
  content = content.replace(/import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]*)\nimport\s*\{\s*AbapConnection\s*\}\s*from\s*['"]@mcp-abap-adt\/connection['"];([^\n]+)/g, (match, imports, fromPath1, fromPath2) => {
    modified = true;
    // Clean up the path
    const cleanPath = (fromPath1 + fromPath2).replace(/['"];?\s*$/, '').trim();
    return `import { ${imports.trim()} } from '${cleanPath}';\nimport { AbapConnection } from '@mcp-abap-adt/connection';\n`;
  });

  // Pattern 7: import { ... } from\nimport { AbapConnection } from '@mcp-abap-adt/connection'; '...';
  // Where the import statement is split across lines with AbapConnection in between
  content = content.replace(/import\s*\{\s*([^}]+)\s*\}\s*from\s*\nimport\s*\{\s*AbapConnection\s*\}\s*from\s*['"]@mcp-abap-adt\/connection['"];([^\n]+)/g, (match, imports, fromPath) => {
    modified = true;
    const cleanPath = fromPath.replace(/['"];?\s*$/, '').trim();
    return `import { ${imports.trim()} } from '${cleanPath}';\nimport { AbapConnection } from '@mcp-abap-adt/connection';\n`;
  });

  // Pattern 8: import { ... } from '...\nimport { AbapConnection } from '@mcp-abap-adt/connection';...';
  // More aggressive pattern to catch remaining cases
  content = content.replace(/import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]*)\s*\nimport\s*\{\s*AbapConnection\s*\}\s*from\s*['"]@mcp-abap-adt\/connection['"];([^\n'"]+)/g, (match, imports, fromPath1, fromPath2) => {
    modified = true;
    const cleanPath = (fromPath1 + fromPath2).replace(/['"];?\s*$/, '').trim();
    return `import { ${imports.trim()} } from '${cleanPath}';\nimport { AbapConnection } from '@mcp-abap-adt/connection';\n`;
  });

  // Pattern 9: Handle cases where import statement has no quotes and AbapConnection is inserted
  content = content.replace(/import\s*\{\s*([^}]+)\s*\}\s*from\s*([^\n]*)\nimport\s*\{\s*AbapConnection\s*\}\s*from\s*['"]@mcp-abap-adt\/connection['"];([^\n]+)/g, (match, imports, fromPath1, fromPath2) => {
    // Only fix if it looks like a broken import (has path-like content)
    if (fromPath2.match(/['"]/)) {
      modified = true;
      const cleanPath = (fromPath1 + fromPath2).replace(/['"];?\s*$/, '').trim();
      return `import { ${imports.trim()} } from '${cleanPath}';\nimport { AbapConnection } from '@mcp-abap-adt/connection';\n`;
    }
    return match;
  });

  // Pattern 10: import { ... } fro\nimport { AbapConnection } from '@mcp-abap-adt/connection';m '...';
  content = content.replace(/import\s*\{\s*([^}]+)\s*\}\s*from\s*([a-z]+)\nimport\s*\{\s*AbapConnection\s*\}\s*from\s*['"]@mcp-abap-adt\/connection['"];([a-z])\s*['"]([^'"]+)['"];?\s*\n/g, (match, imports, fromPart1, fromPart2, fromPath) => {
    modified = true;
    return `import { ${imports.trim()} } from '${fromPart1}${fromPart2}${fromPath}';\nimport { AbapConnection } from '@mcp-abap-adt/connection';\n`;
  });

  // Pattern 11: import\nimport { AbapConnection } from '@mcp-abap-adt/connection'; { ... } from '...';
  content = content.replace(/import\s*\nimport\s*\{\s*AbapConnection\s*\}\s*from\s*['"]@mcp-abap-adt\/connection['"];\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]+)['"];?\s*\n/g, (match, imports, fromPath) => {
    modified = true;
    return `import { ${imports.trim()} } from '${fromPath}';\nimport { AbapConnection } from '@mcp-abap-adt/connection';\n`;
  });

  // Pattern 12: import type { ...\nimport { AbapConnection } from '@mcp-abap-adt/connection';... } from '...';
  content = content.replace(/import\s+type\s*\{\s*([^}]*)\nimport\s*\{\s*AbapConnection\s*\}\s*from\s*['"]@mcp-abap-adt\/connection['"];([^}]+)\s*\}\s*from\s*['"]([^'"]+)['"];?\s*\n/g, (match, typePart1, typePart2, fromPath) => {
    modified = true;
    return `import type { ${typePart1.trim()}${typePart2.trim()} } from '${fromPath}';\nimport { AbapConnection } from '@mcp-abap-adt/connection';\n`;
  });

  // Pattern 13: import { ... }\nimport { AbapConnection } from '@mcp-abap-adt/connection'; } from '...';
  content = content.replace(/import\s*\{\s*([^}]+)\s*\}\s*\nimport\s*\{\s*AbapConnection\s*\}\s*from\s*['"]@mcp-abap-adt\/connection['"];\s*\}\s*from\s*['"]([^'"]+)['"];?\s*\n/g, (match, imports, fromPath) => {
    modified = true;
    return `import { ${imports.trim()} } from '${fromPath}';\nimport { AbapConnection } from '@mcp-abap-adt/connection';\n`;
  });

  if (modified && content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed: ${path.relative(process.cwd(), filePath)}`);
    return true;
  }
  return false;
}

function main() {
  const handlerFiles = findHandlerFiles();

  console.log(`Found ${handlerFiles.length} handler files`);

  let fixedCount = 0;
  for (const file of handlerFiles) {
    if (fixBrokenImports(file)) {
      fixedCount++;
    }
  }

  console.log(`\nFixed ${fixedCount} files`);
}

main();
