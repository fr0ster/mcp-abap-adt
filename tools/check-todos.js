#!/usr/bin/env node

/**
 * Check for TODO comments in TypeScript source files
 * Outputs a formatted list of TODOs found in the codebase
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '../src');
const EXCLUDE_DIRS = ['node_modules', 'dist', '__tests__'];
const TODO_PATTERN = /@TODO|TODO:/gi;

function findTodos(dir, todos = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(SRC_DIR, fullPath);

    // Skip excluded directories
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.includes(entry.name)) {
        continue;
      }
      findTodos(fullPath, todos);
      continue;
    }

    // Only process .ts files
    if (!entry.name.endsWith('.ts')) {
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      if (TODO_PATTERN.test(line)) {
        const lineNumber = index + 1;
        const trimmedLine = line.trim();
        todos.push({
          file: relativePath,
          line: lineNumber,
          text: trimmedLine,
        });
      }
    });
  }

  return todos;
}

function main() {
  console.error('\n🔍 Searching for TODO comments in source files...\n');

  const todos = findTodos(SRC_DIR);

  if (todos.length === 0) {
    console.error('✅ No TODO comments found.\n');
    return;
  }

  console.error(`⚠️  Found ${todos.length} TODO comment(s):\n`);

  // Group by file
  const byFile = {};
  for (const todo of todos) {
    if (!byFile[todo.file]) {
      byFile[todo.file] = [];
    }
    byFile[todo.file].push(todo);
  }

  // Output grouped by file
  for (const [file, fileTodos] of Object.entries(byFile)) {
    console.error(`📄 ${file}:`);
    for (const todo of fileTodos) {
      console.error(`   Line ${todo.line}: ${todo.text}`);
    }
    console.error('');
  }

  console.error(`Summary: ${todos.length} TODO(s) found across ${Object.keys(byFile).length} file(s)\n`);
}

main();
