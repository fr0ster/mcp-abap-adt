#!/usr/bin/env node

/**
 * Простий утилітний скрипт для парсингу ABAP коду
 * Usage: node parse-abap-code.js "DATA: lv_test TYPE string."
 */

const { handleGetAbapAST } = require('../dist/handlers/handleGetAbapAST');
const { handleGetAbapSemanticAnalysis } = require('../dist/handlers/handleGetAbapSemanticAnalysis');
const { handleGetAbapSystemSymbols } = require('../dist/handlers/handleGetAbapSystemSymbols');

async function parseAbapCode(code) {
    if (!code) {
        console.error('❌ Помилка: Не вказано ABAP код');
        console.log('Usage: node parse-abap-code.js "DATA: lv_test TYPE string."');
        process.exit(1);
    }

    console.log('🔧 ABAP CODE PARSER');
    console.log('==================');
    console.log(`📝 Input: ${code}`);
    console.log('');

    try {
        // 1. AST PARSING
        console.log('📊 AST PARSING:');
        const astResult = await handleGetAbapAST({ code });
        
        if (!astResult.isError) {
            const ast = JSON.parse(astResult.content[0].text);
            console.log(`   Length: ${ast.sourceLength}, Lines: ${ast.lineCount}`);
            console.log(`   Classes: ${ast.classes?.length || 0}, Methods: ${ast.methods?.length || 0}`);
            console.log(`   Data: ${ast.dataDeclarations?.length || 0}, Forms: ${ast.forms?.length || 0}`);
            console.log(`   Includes: ${ast.includes?.length || 0}`);
        } else {
            console.log('   ❌ Failed');
        }
        console.log('');

        // 2. SEMANTIC ANALYSIS
        console.log('🔍 SEMANTIC ANALYSIS:');
        const semanticResult = await handleGetAbapSemanticAnalysis({ 
            code, 
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
            }
            
            // Show symbols
            if (analysis.symbols && analysis.symbols.length > 0) {
                console.log('   📋 SYMBOLS:');
                analysis.symbols.forEach(symbol => {
                    console.log(`      ${symbol.name} (${symbol.type}) line:${symbol.line} ${symbol.visibility || ''}`);
                });
            }
        } else {
            console.log('   ❌ Failed');
        }
        console.log('');

        // 3. SYSTEM SYMBOLS (local only, no SAP connection)
        console.log('🌐 SYSTEM SYMBOLS:');
        const systemResult = await handleGetAbapSystemSymbols({ 
            code, 
            resolveSystemInfo: false,
            includeLocalSymbols: true 
        });
        
        if (!systemResult.isError) {
            const system = JSON.parse(systemResult.content[0].text);
            console.log(`   Total: ${system.systemResolutionStats?.totalSymbols || 0}`);
            console.log(`   Resolution: ${system.systemResolutionStats?.resolutionRate || '0%'}`);
            
            // Show dependencies
            if (system.dependencies && system.dependencies.length > 0) {
                console.log(`   📦 DEPENDENCIES: ${system.dependencies.join(', ')}`);
            }
            
            // Show scopes
            if (system.scopes && system.scopes.length > 0) {
                console.log('   🎯 SCOPES:');
                system.scopes.forEach(scope => {
                    console.log(`      ${scope.name} (${scope.type}) ${scope.startLine}-${scope.endLine}`);
                });
            }
        } else {
            console.log('   ❌ Failed');
        }

    } catch (error) {
        console.error('💥 Error:', error.message);
        process.exit(1);
    }
    
    process.exit(0);
}

// Get code from command line argument
const code = process.argv[2];

if (require.main === module) {
    parseAbapCode(code);
}

module.exports = { parseAbapCode };
