#!/usr/bin/env node

/**
 * Raw ABAP parser - тільки результати, без пояснень
 * Usage: node parse-abap-raw.js "DATA: lv_test TYPE string."
 */

const { handleGetAbapAST } = require('../dist/handlers/handleGetAbapAST');
const { handleGetAbapSemanticAnalysis } = require('../dist/handlers/handleGetAbapSemanticAnalysis');
const { handleGetAbapSystemSymbols } = require('../dist/handlers/handleGetAbapSystemSymbols');

async function parseRaw(code) {
    if (!code) {
        console.log('Usage: node parse-abap-raw.js "ABAP_CODE"');
        process.exit(1);
    }

    try {
        // AST
        const astResult = await handleGetAbapAST({ code });
        const ast = astResult.isError ? null : JSON.parse(astResult.content[0].text);

        // Semantic
        const semanticResult = await handleGetAbapSemanticAnalysis({ code, analyzeComplexity: true });
        const semantic = semanticResult.isError ? null : JSON.parse(semanticResult.content[0].text);

        // System symbols
        const systemResult = await handleGetAbapSystemSymbols({ 
            code, 
            resolveSystemInfo: false,
            includeLocalSymbols: true 
        });
        const system = systemResult.isError ? null : JSON.parse(systemResult.content[0].text);

        // Output results
        console.log('=== AST ===');
        if (ast) {
            console.log(`Length: ${ast.sourceLength}`);
            console.log(`Lines: ${ast.lineCount}`);
            console.log(`Classes: ${ast.classes?.length || 0}`);
            console.log(`Methods: ${ast.methods?.length || 0}`);
            console.log(`Data: ${ast.dataDeclarations?.length || 0}`);
            console.log(`Forms: ${ast.forms?.length || 0}`);
            console.log(`Includes: ${ast.includes?.length || 0}`);
        } else {
            console.log('FAILED');
        }

        console.log('\n=== SEMANTIC ===');
        if (semantic) {
            console.log(`Symbols: ${semantic.symbols?.length || 0}`);
            console.log(`Dependencies: ${semantic.dependencies?.length || 0}`);
            console.log(`Scopes: ${semantic.scopes?.length || 0}`);
            console.log(`Errors: ${semantic.errors?.length || 0}`);
            if (semantic.complexityMetrics) {
                console.log(`Complexity: ${semantic.complexityMetrics.cyclomaticComplexity}`);
                console.log(`Depth: ${semantic.complexityMetrics.maxNestingDepth}`);
            }
            
            if (semantic.symbols && semantic.symbols.length > 0) {
                console.log('\nSYMBOLS:');
                semantic.symbols.forEach(s => {
                    console.log(`${s.name}|${s.type}|${s.line}|${s.scope}|${s.visibility || 'none'}`);
                });
            }
        } else {
            console.log('FAILED');
        }

        console.log('\n=== SYSTEM ===');
        if (system) {
            console.log(`Total: ${system.systemResolutionStats?.totalSymbols || 0}`);
            console.log(`Resolution: ${system.systemResolutionStats?.resolutionRate || '0%'}`);
            
            if (system.dependencies && system.dependencies.length > 0) {
                console.log(`Dependencies: ${system.dependencies.join(',')}`);
            }
            
            if (system.scopes && system.scopes.length > 0) {
                console.log('\nSCOPES:');
                system.scopes.forEach(s => {
                    console.log(`${s.name}|${s.type}|${s.startLine}-${s.endLine}|${s.parent || 'none'}`);
                });
            }
        } else {
            console.log('FAILED');
        }

    } catch (error) {
        console.log(`ERROR: ${error.message}`);
        process.exit(1);
    }
    
    process.exit(0);
}

const code = process.argv[2];
if (require.main === module) {
    parseRaw(code);
}
