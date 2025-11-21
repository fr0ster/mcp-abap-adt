#!/usr/bin/env node

/**
 * Sync optional parameters from adt-clients TypeScript interfaces
 *
 * This script reads TypeScript interfaces from @mcp-abap-adt/adt-clients
 * and updates handler TOOL_DEFINITION to mark optional parameters correctly.
 */

const fs = require('fs');
const path = require('path');

const ADT_CLIENTS_PATH = path.join(__dirname, '../../mcp-abap-adt-clients/src');
const HANDLERS_DIR = path.join(__dirname, '../src/handlers');

// Mapping of handlers to their config interfaces
const HANDLER_TO_INTERFACE = {
  'handleCreateDomain.ts': {
    path: 'core/domain/DomainBuilder.ts',
    interface: 'DomainBuilderConfig',
    requiredFields: ['domainName'] // From TypeScript: domainName without ?
  },
  'handleCreateDataElement.ts': {
    path: 'core/dataElement/DataElementBuilder.ts',
    interface: 'DataElementBuilderConfig',
    requiredFields: ['dataElementName'] // Need to check actual interface
  },
  'handleCreateTable.ts': {
    path: 'core/table/TableBuilder.ts',
    interface: 'TableBuilderConfig',
    requiredFields: ['tableName'] // Need to check actual interface
  },
  // Add more mappings as needed
};

/**
 * Extract optional fields from TypeScript interface
 */
function extractOptionalFields(filePath, interfaceName) {
  const content = fs.readFileSync(filePath, 'utf8');

  // Find interface definition
  const interfacePattern = new RegExp(`export interface ${interfaceName}\\s*\\{([^}]+)\\}`, 's');
  const match = content.match(interfacePattern);

  if (!match) {
    return null;
  }

  const interfaceBody = match[1];
  const fields = [];
  const optionalFields = [];
  const requiredFields = [];

  // Parse fields: fieldName?: type or fieldName: type
  const fieldPattern = /(\w+)(\?)?:\s*([^;]+);/g;
  let fieldMatch;

  while ((fieldMatch = fieldPattern.exec(interfaceBody)) !== null) {
    const fieldName = fieldMatch[1];
    const isOptional = fieldMatch[2] === '?';

    fields.push(fieldName);
    if (isOptional) {
      optionalFields.push(fieldName);
    } else {
      requiredFields.push(fieldName);
    }
  }

  return {
    fields,
    optionalFields,
    requiredFields
  };
}

function main() {
  console.log('🔍 Analyzing TypeScript interfaces from adt-clients...\n');

  for (const [handlerFile, mapping] of Object.entries(HANDLER_TO_INTERFACE)) {
    const interfacePath = path.join(ADT_CLIENTS_PATH, mapping.path);

    if (!fs.existsSync(interfacePath)) {
      console.log(`⚠️  ${handlerFile}: Interface file not found: ${mapping.path}`);
      continue;
    }

    const result = extractOptionalFields(interfacePath, mapping.interface);

    if (!result) {
      console.log(`⚠️  ${handlerFile}: Interface ${mapping.interface} not found`);
      continue;
    }

    console.log(`✅ ${handlerFile}:`);
    console.log(`   Interface: ${mapping.interface}`);
    console.log(`   Required fields: ${result.requiredFields.join(', ')}`);
    console.log(`   Optional fields: ${result.optionalFields.join(', ')}`);
    console.log('');
  }
}

main();
