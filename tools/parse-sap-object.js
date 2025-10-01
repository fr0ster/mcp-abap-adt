#!/usr/bin/env node

/**
 * Парсер SAP об'єктів - качає з системи та парсить
 * Usage: 
 *   node parse-sap-object.js CL_SALV_TABLE
 *   node parse-sap-object.js CL_SALV_TABLE class
 *   node parse-sap-object.js Z_MY_FUNCTION function
 *   node parse-sap-object.js ZIF_MY_INTERFACE interface
 */

const { handleGetClass } = require('../dist/handlers/handleGetClass');
const { handleGetFunction } = require('../dist/handlers/handleGetFunction');
const { handleGetInterface } = require('../dist/handlers/handleGetInterface');
const { handleGetProgram } = require('../dist/handlers/handleGetProgram');
const { handleGetFunctionGroup } = require('../dist/handlers/handleGetFunctionGroup');
const { handleGetInclude } = require('../dist/handlers/handleGetInclude');
const { handleGetAbapAST } = require('../dist/handlers/handleGetAbapAST');
const { handleGetAbapSemanticAnalysis } = require('../dist/handlers/handleGetAbapSemanticAnalysis');
const { handleGetAbapSystemSymbols } = require('../dist/handlers/handleGetAbapSystemSymbols');

async function parseObject(objectName, objectType) {
    if (!objectName) {
        console.error('❌ Не вказано ім\'я об\'єкта');
        console.log('Usage: node parse-sap-object.js OBJECT_NAME TYPE');
        console.log('');
        console.log('Available types:');
        console.log('  class     - ABAP Class (CL_*, ZCL_*)');
        console.log('  function  - Function Module (Z*, Y*)');
        console.log('  interface - ABAP Interface (IF_*, ZIF_*)');
        console.log('  program   - ABAP Program/Report');
        console.log('  fugr      - Function Group (FUGR)');
        console.log('  include   - Include Program');
        console.log('');
        console.log('Examples:');
        console.log('  node parse-sap-object.js CL_SALV_TABLE class');
        console.log('  node parse-sap-object.js Z_MY_FUNC function');
        console.log('  node parse-sap-object.js SAPMV45A program');
        console.log('  node parse-sap-object.js V45A fugr');
        process.exit(1);
    }

    if (!objectType) {
        console.error('❌ Не вказано тип об\'єкта');
        console.log('Тип об\'єкта ОБОВ\'ЯЗКОВИЙ! Програма і FUGR можуть мати однакові імена.');
        console.log('Використайте: node parse-sap-object.js OBJECT_NAME TYPE');
        process.exit(1);
    }

    console.log(`🔍 SAP OBJECT PARSER: ${objectName} (${objectType.toUpperCase()})`);
    console.log('=======================================================');

    try {
        // 1. Get source code from SAP
        console.log(`📥 Fetching ${objectType} from SAP...`);
        let sourceResult;
        
        switch (objectType.toLowerCase()) {
            case 'class':
                sourceResult = await handleGetClass({ class_name: objectName });
                break;
            case 'function':
                sourceResult = await handleGetFunction({ function_name: objectName });
                break;
            case 'interface':
                sourceResult = await handleGetInterface({ interface_name: objectName });
                break;
            case 'program':
                sourceResult = await handleGetProgram({ program_name: objectName });
                break;
            case 'fugr':
                sourceResult = await handleGetFunctionGroup({ function_group_name: objectName });
                break;
            case 'include':
                sourceResult = await handleGetInclude({ include_name: objectName });
                break;
            default:
                console.error(`❌ Unknown type: ${objectType}`);
                console.log('Available types: class, function, interface, program, fugr, include');
                process.exit(1);
        }

        if (sourceResult.isError) {
            console.error(`❌ Failed to get ${objectType}: ${sourceResult.content[0]?.text}`);
            process.exit(1);
        }

        // Extract source code
        const sourceData = sourceResult.content[0].text;
        let abapCode;
        
        try {
            // Try to parse as JSON first
            const jsonData = JSON.parse(sourceData);
            abapCode = jsonData.source || jsonData.code || sourceData;
        } catch {
            // Use as plain text
            abapCode = sourceData;
        }

        console.log(`✅ Source fetched (${abapCode.length} chars)`);
        console.log('');

        // 2. Parse the code
        console.log('📊 AST ANALYSIS:');
        const astResult = await handleGetAbapAST({ code: abapCode });
        
        if (!astResult.isError) {
            const ast = JSON.parse(astResult.content[0].text);
            console.log(`   Length: ${ast.sourceLength}, Lines: ${ast.lineCount}`);
            console.log(`   Classes: ${ast.classes?.length || 0}, Methods: ${ast.methods?.length || 0}`);
            console.log(`   Data: ${ast.dataDeclarations?.length || 0}, Forms: ${ast.forms?.length || 0}`);
            console.log(`   Includes: ${ast.includes?.length || 0}`);
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
            }
            
            // Show first 10 symbols
            if (analysis.symbols && analysis.symbols.length > 0) {
                console.log('   📋 TOP SYMBOLS:');
                analysis.symbols.slice(0, 10).forEach(symbol => {
                    console.log(`      ${symbol.name} (${symbol.type}) line:${symbol.line} ${symbol.visibility || ''}`);
                });
                if (analysis.symbols.length > 10) {
                    console.log(`      ... and ${analysis.symbols.length - 10} more`);
                }
            }
        } else {
            console.log('   ❌ Semantic Failed');
        }

        console.log('');
        console.log('🌐 SYSTEM INTEGRATION:'); 
        const systemResult = await handleGetAbapSystemSymbols({ 
            code: abapCode, 
            resolveSystemInfo: true,  // Try to resolve with SAP
            includeLocalSymbols: true 
        });
        
        if (!systemResult.isError) {
            const system = JSON.parse(systemResult.content[0].text);
            console.log(`   Total symbols: ${system.systemResolutionStats?.totalSymbols || 0}`);
            console.log(`   Resolved from SAP: ${system.systemResolutionStats?.resolvedSymbols || 0}`);
            console.log(`   Resolution rate: ${system.systemResolutionStats?.resolutionRate || '0%'}`);
            
            if (system.dependencies && system.dependencies.length > 0) {
                console.log(`   📦 Dependencies: ${system.dependencies.slice(0, 5).join(', ')}${system.dependencies.length > 5 ? '...' : ''}`);
            }
            
            // Show resolved symbols
            const resolvedSymbols = system.symbols.filter(s => s.systemInfo?.exists);
            if (resolvedSymbols.length > 0) {
                console.log('   ✅ RESOLVED SYMBOLS:');
                resolvedSymbols.slice(0, 5).forEach(symbol => {
                    console.log(`      ${symbol.name} (${symbol.systemInfo.objectType}) - ${symbol.systemInfo.description || 'No description'}`);
                });
            }
        } else {
            console.log('   ❌ System Analysis Failed');
        }

        console.log('');
        console.log(`✅ Analysis complete for ${objectName}`);

    } catch (error) {
        console.error('💥 Error:', error.message);
        process.exit(1);
    }
    
    process.exit(0);
}

// Get parameters from command line
const objectName = process.argv[2];
const objectType = process.argv[3];

if (require.main === module) {
    parseObject(objectName, objectType);
}

module.exports = { parseObject };
