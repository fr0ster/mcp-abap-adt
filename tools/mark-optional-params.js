#!/usr/bin/env node

/**
 * Mark optional parameters in TOOL_DEFINITION descriptions
 *
 * This script scans all handlers and adds "(optional)" to parameter descriptions
 * that are not in the required array.
 */

const fs = require('fs');
const path = require('path');

const HANDLERS_DIR = path.join(__dirname, '../src/handlers');

function processHandler(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;

  // Check if file has TOOL_DEFINITION
  if (!content.includes('TOOL_DEFINITION')) {
    return { processed: false, reason: 'No TOOL_DEFINITION found' };
  }

  // Find required array - extract it carefully
  const requiredPattern = /required:\s*\[([^\]]+)\]/g;
  const matches = [...content.matchAll(requiredPattern)];

  if (matches.length === 0) {
    return { processed: false, reason: 'No required array found' };
  }

  // Get the first required array (main inputSchema one)
  const requiredParams = matches[0][1]
    .split(',')
    .map(s => s.trim().replace(/["']/g, ''))
    .filter(Boolean);

  if (requiredParams.length === 0) {
    return { processed: false, reason: 'Empty required array' };
  }

  let modified = false;

  // Process each line
  const lines = content.split('\n');
  const newLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for description lines: description: "some text"
    const descMatch = line.match(/^(\s+)description:\s*["']([^"']+)["'](.*)/);

    if (descMatch) {
      const indent = descMatch[1];
      const description = descMatch[2];
      const rest = descMatch[3];

      // Check if already marked
      if (description.startsWith('(optional)') || description.toLowerCase().startsWith('optional')) {
        newLines.push(line);
        continue;
      }

      // Look backwards to find the property name
      let propertyName = null;
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const prevLine = lines[j];
        const propMatch = prevLine.match(/(\w+):\s*\{/);
        if (propMatch) {
          propertyName = propMatch[1];
          break;
        }
      }

      if (!propertyName) {
        newLines.push(line);
        continue;
      }

      // Check if this property is required
      const isRequired = requiredParams.includes(propertyName);

      if (!isRequired) {
        // Mark as optional
        const newLine = `${indent}description: "(optional) ${description}"${rest}`;
        newLines.push(newLine);
        modified = true;
      } else {
        newLines.push(line);
      }
    } else {
      newLines.push(line);
    }
  }

  if (!modified) {
    return { processed: false, reason: 'No changes needed' };
  }

  // Write back
  const newContent = newLines.join('\n');
  fs.writeFileSync(filePath, newContent, 'utf8');

  return { processed: true, changes: 'Marked optional parameters' };
}

function main() {
  console.log('🔍 Scanning handlers for optional parameters...\n');

  const files = fs.readdirSync(HANDLERS_DIR)
    .filter(f => f.endsWith('.ts') && f.startsWith('handle'))
    .map(f => path.join(HANDLERS_DIR, f));

  let processedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const fileName = path.basename(file);
    const result = processHandler(file);

    if (result.processed) {
      console.log(`✅ ${fileName}`);
      processedCount++;
    } else {
      console.log(`⏭️  ${fileName}: ${result.reason}`);
      skippedCount++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Processed: ${processedCount}`);
  console.log(`   Skipped: ${skippedCount}`);
  console.log(`   Total: ${files.length}`);
}

main();
