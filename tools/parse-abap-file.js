#!/usr/bin/env node

/**
 * Парсер ABAP файлів - читає з файлу та парсить
 * Usage: 
 *   node parse-abap-file.js program.abap
 *   node parse-abap-file.js class.abap class
 */

const fs = require('fs');
const path = require('path');
const { handleGetAbapAST } = require('../dist/handlers/handleGetAbapAST');
const { handleGetAbapSemanticAnalysis } = require('../dist/handlers/handleGetAbapSemanticAnalysis');
const { handleGetAbapSystemSymbols } = require('../dist/handlers/handleGetAbapSystemSymbols');

async function parseFile(filePath, objectType) {
    if (!filePath) {
        console.error('❌ Не вказано файл');
        console.log('Usage: node parse-abap-file.js FILE_PATH [TYPE]');
        console.log('Examples:');
        console.log('  node parse-abap-file.js program.abap');
        console.log('  node parse-abap-file.js class.abap class');
        process.exit(1);
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
        console.error(`❌ Файл не знайдено: ${filePath}`);
        process.exit(1);
    }

    const fileName = path.basename(filePath);
    console.log(`📁 ABAP FILE PARSER: ${fileName}`);
    console.log('====================================');

    try {
        // Read file
        console.log('📥 Reading file...');
        const abapCode = fs.readFileSync(filePath, 'utf8');
        console.log(`✅ File read (${abapCode.length} chars, ${abapCode.split('\n').length} lines)`);
        
        // Auto-detect type from filename or content
        if (!objectType) {
            if (/class|cl_/i.test(fileName) || /^CLASS\s+/im.test(abapCode)) {
                objectType = 'class';
            } else if (/interface|if_/i.test(fileName) || /^INTERFACE\s+/im.test(abapCode)) {
                objectType = 'interface';
            } else if (/function|func/i.test(fileName) || /^FUNCTION\s+/im.test(abapCode)) {
                objectType = 'function';
            } else if (/form/i.test(fileName) || /^FORM\s+/im.test(abapCode)) {
                objectType = 'form';
            } else if (/report|prog/i.test(fileName) || /^REPORT\s+/im.test(abapCode)) {
                objectType = 'report';
            } else {
                objectType = 'program';
            }
            console.log(`🎯 Auto-detected type: ${objectType}`);
        }
        console.log('');

        // AST
        console.log('📊 AST ANALYSIS:');
        const astResult = await handleGetAbapAST({ code: abapCode });
        
        if (!astResult.isError) {
            const ast = JSON.parse(astResult.content[0].text);
            console.log(`   Length: ${ast.sourceLength}, Lines: ${ast.lineCount}`);
            console.log(`   Classes: ${ast.classes?.length || 0}, Methods: ${ast.methods?.length || 0}`);
            console.log(`   Data: ${ast.dataDeclarations?.length || 0}, Forms: ${ast.forms?.length || 0}`);
            console.log(`   Includes: ${ast.includes?.length || 0}`);
            
            // Show structures
            if (ast.structures && ast.structures.length > 0) {
                console.log('   📋 STRUCTURES:');
                ast.structures.slice(0, 5).forEach(struct => {
                    console.log(`      ${struct.type} at line ${struct.line}`);
                });
            }
        } else {
            console.log('   ❌ AST Failed');
        }

        console.log('');
        console.log('🔍 SEMANTIC ANALYSIS:');
        const semanticResult = await handleGetAbapSemanticAnalysis({ 
            code: abapCode, 
            analyzeComplexity: true 
        });
        
        if (!semanticResult.isError) {
            const analysis = JSON.parse(semanticResult.content[0].text);
            console.log(`   Symbols: ${analysis.symbols?.length || 0}`);
            console.log(`   Dependencies: ${analysis.dependencies?.length || 0}`);
            console.log(`   Scopes: ${analysis.scopes?.length || 0}`);
            console.log(`   Errors: ${analysis.errors?.length || 0}`);
            
            if (analysis.complexityMetrics) {
                console.log(`   Complexity: ${analysis.complexityMetrics.cyclomaticComplexity}`);
                console.log(`   Max Depth: ${analysis.complexityMetrics.maxNestingDepth}`);
                console.log(`   Non-empty lines: ${analysis.complexityMetrics.nonEmptyLines}`);
                console.log(`   Comment lines: ${analysis.complexityMetrics.commentLines}`);
            }
            
            // Show symbols by type
            if (analysis.symbols && analysis.symbols.length > 0) {
                const symbolsByType = {};
                analysis.symbols.forEach(symbol => {
                    if (!symbolsByType[symbol.type]) symbolsByType[symbol.type] = [];
                    symbolsByType[symbol.type].push(symbol);
                });
                
                console.log('   📋 SYMBOLS BY TYPE:');
                Object.entries(symbolsByType).forEach(([type, symbols]) => {
                    console.log(`      ${type.toUpperCase()}: ${symbols.length}`);
                    symbols.slice(0, 3).forEach(symbol => {
                        console.log(`        ${symbol.name} (line:${symbol.line}) ${symbol.visibility || ''}`);
                    });
                    if (symbols.length > 3) {
                        console.log(`        ... and ${symbols.length - 3} more`);
                    }
                });
            }
            
            // Show errors if any
            if (analysis.errors && analysis.errors.length > 0) {
                console.log('   ❗ ERRORS:');
                analysis.errors.forEach(error => {
                    console.log(`      ${error.severity}: ${error.message} (line:${error.line})`);
                });
            }
        } else {
            console.log('   ❌ Semantic Failed');
        }

        console.log('');
        console.log('🌐 SYSTEM SYMBOLS:');
        const systemResult = await handleGetAbapSystemSymbols({ 
            code: abapCode, 
            resolveSystemInfo: false,  // Skip SAP connection for file parsing
            includeLocalSymbols: true 
        });
        
        if (!systemResult.isError) {
            const system = JSON.parse(systemResult.content[0].text);
            console.log(`   Total symbols: ${system.systemResolutionStats?.totalSymbols || 0}`);
            console.log(`   Local symbols: ${system.symbols?.length || 0}`);
            
            if (system.dependencies && system.dependencies.length > 0) {
                console.log(`   📦 DEPENDENCIES (${system.dependencies.length}):`);
                system.dependencies.forEach(dep => {
                    console.log(`      ${dep}`);
                });
            }
            
            if (system.scopes && system.scopes.length > 0) {
                console.log(`   🎯 SCOPES (${system.scopes.length}):`);
                system.scopes.forEach(scope => {
                    console.log(`      ${scope.name} (${scope.type}) ${scope.startLine}-${scope.endLine}`);
                });
            }
        } else {
            console.log('   ❌ System Analysis Failed');
        }

        console.log('');
        console.log(`✅ Analysis complete for ${fileName}`);
        console.log(`📁 File: ${path.resolve(filePath)}`);

    } catch (error) {
        console.error('💥 Error:', error.message);
        process.exit(1);
    }
    
    process.exit(0);
}

// Get parameters from command line
const filePath = process.argv[2];
const objectType = process.argv[3];

if (require.main === module) {
    parseFile(filePath, objectType);
}

module.exports = { parseFile };
