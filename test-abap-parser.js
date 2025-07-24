#!/usr/bin/env node

/**
 * Simple test script for ABAP Parser functionality
 * Usage: node test-abap-parser.js
 */

const { handleGetAbapAST } = require('./dist/handlers/handleGetAbapAST');
const { handleGetAbapSemanticAnalysis } = require('./dist/handlers/handleGetAbapSemanticAnalysis');
const { handleGetAbapSystemSymbols } = require('./dist/handlers/handleGetAbapSystemSymbols');

// Sample ABAP code for testing
const sampleAbapCode = `
REPORT z_test_program.

* Global data declarations
DATA: gv_counter TYPE i,
      gv_message TYPE string.

CONSTANTS: gc_max_count TYPE i VALUE 100.

CLASS lcl_test_class DEFINITION.
  PUBLIC SECTION.
    METHODS: test_method
      IMPORTING iv_input TYPE string
      EXPORTING ev_output TYPE string,
      
      class_method IMPORTING iv_data TYPE i.
      
    DATA: lv_instance_var TYPE string.
    
  PRIVATE SECTION.
    CONSTANTS: lc_private_const TYPE string VALUE 'TEST'.
ENDCLASS.

CLASS lcl_test_class IMPLEMENTATION.
  METHOD test_method.
    DATA: lv_local_var TYPE i.
    
    lv_local_var = iv_input.
    ev_output = |Result: { lv_local_var }|.
  ENDMETHOD.
  
  METHOD class_method.
    DATA: lv_temp TYPE i.
    lv_temp = iv_data * 2.
  ENDMETHOD.
ENDCLASS.

FORM process_data USING p_input TYPE string
                  CHANGING p_output TYPE string.
  DATA: lv_work TYPE string.
  lv_work = p_input.
  p_output = lv_work.
ENDFORM.

FUNCTION z_test_function.
  DATA: lv_function_var TYPE i.
  lv_function_var = 42.
ENDFUNCTION.

INCLUDE z_test_include.

START-OF-SELECTION.
  gv_counter = 1.
  gv_message = 'Hello World'.
  
  PERFORM process_data USING gv_message CHANGING gv_message.
`;

async function testAbapParser() {
    console.log('🧪 Testing ABAP Parser Integration');
    console.log('==================================\n');
    
    try {
        // Test 1: AST Generation
        console.log('📊 Test 1: AST Generation');
        console.log('--------------------------');
        
        const astResult = await handleGetAbapAST({
            code: sampleAbapCode,
            useDetailedAST: true
        });
        
        if (astResult.isError) {
            console.error('❌ AST Generation failed:', astResult.content[0]?.text);
        } else {
            const ast = JSON.parse(astResult.content[0].text);
            console.log('✅ AST Generated successfully');
            console.log(`   - Source length: ${ast.sourceLength}`);
            console.log(`   - Line count: ${ast.lineCount}`);
            console.log(`   - Parse method: ${ast.parseMethod}`);
            console.log(`   - Classes found: ${ast.classes?.length || 0}`);
            console.log(`   - Methods found: ${ast.methods?.length || 0}`);
            console.log(`   - Data declarations: ${ast.dataDeclarations?.length || 0}`);
            console.log(`   - Forms found: ${ast.forms?.length || 0}`);
            console.log(`   - Includes found: ${ast.includes?.length || 0}`);
        }
        
        console.log('');
        
        // Test 2: Semantic Analysis
        console.log('🔍 Test 2: Semantic Analysis');
        console.log('-----------------------------');
        
        const semanticResult = await handleGetAbapSemanticAnalysis({
            code: sampleAbapCode,
            includeDetailedScopes: true,
            analyzeComplexity: true
        });
        
        if (semanticResult.isError) {
            console.error('❌ Semantic Analysis failed:', semanticResult.content[0]?.text);
        } else {
            const analysis = JSON.parse(semanticResult.content[0].text);
            console.log('✅ Semantic Analysis completed successfully');
            console.log(`   - Symbols found: ${analysis.symbols?.length || 0}`);
            console.log(`   - Dependencies: ${analysis.dependencies?.length || 0}`);
            console.log(`   - Scopes: ${analysis.scopes?.length || 0}`);
            console.log(`   - Errors: ${analysis.errors?.length || 0}`);
            
            if (analysis.complexityMetrics) {
                console.log('   - Complexity metrics:');
                console.log(`     * Cyclomatic complexity: ${analysis.complexityMetrics.cyclomaticComplexity}`);
                console.log(`     * Max nesting depth: ${analysis.complexityMetrics.maxNestingDepth}`);
                console.log(`     * Lines of code: ${analysis.complexityMetrics.linesOfCode}`);
                console.log(`     * Non-empty lines: ${analysis.complexityMetrics.nonEmptyLines}`);
                console.log(`     * Comment lines: ${analysis.complexityMetrics.commentLines}`);
            }
            
            // Show some symbol details
            if (analysis.symbols && analysis.symbols.length > 0) {
                console.log('   - Sample symbols:');
                analysis.symbols.slice(0, 5).forEach(symbol => {
                    console.log(`     * ${symbol.name} (${symbol.type}) at line ${symbol.line}`);
                });
            }
        }
        
        console.log('');
        
        // Test 3: System Symbol Resolution (without actual SAP connection)
        console.log('🔗 Test 3: System Symbol Resolution');
        console.log('------------------------------------');
        
        const systemResult = await handleGetAbapSystemSymbols({
            code: sampleAbapCode,
            resolveSystemInfo: false, // Skip SAP system calls for testing
            includeLocalSymbols: true
        });
        
        if (systemResult.isError) {
            console.error('❌ System Symbol Resolution failed:', systemResult.content[0]?.text);
        } else {
            const systemSymbols = JSON.parse(systemResult.content[0].text);
            console.log('✅ System Symbol Resolution completed successfully');
            console.log(`   - Total symbols: ${systemSymbols.systemResolutionStats?.totalSymbols || 0}`);
            console.log(`   - Resolution rate: ${systemSymbols.systemResolutionStats?.resolutionRate || '0%'}`);
            console.log(`   - Dependencies: ${systemSymbols.dependencies?.length || 0}`);
            console.log(`   - Scopes: ${systemSymbols.scopes?.length || 0}`);
            
            // Show some resolved symbols
            if (systemSymbols.symbols && systemSymbols.symbols.length > 0) {
                console.log('   - Sample resolved symbols:');
                systemSymbols.symbols.slice(0, 3).forEach(symbol => {
                    console.log(`     * ${symbol.name} (${symbol.type})`);
                    if (symbol.systemInfo) {
                        console.log(`       - System info available: ${symbol.systemInfo.exists}`);
                        if (symbol.systemInfo.objectType) {
                            console.log(`       - Object type: ${symbol.systemInfo.objectType}`);
                        }
                    }
                });
            }
        }
        
        console.log('');
        console.log('🎉 All tests completed!');
        console.log('');
        console.log('💡 Tips:');
        console.log('   - Run "make setup" to download ANTLR4 JAR');
        console.log('   - Run "make generate" to create actual ANTLR4 parser');
        console.log('   - Run "make build" to compile with latest parser');
        console.log('   - See README_ABAP_PARSER.md for detailed documentation');
        
    } catch (error) {
        console.error('💥 Test failed with error:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run tests if script is executed directly
if (require.main === module) {
    testAbapParser().catch(error => {
        console.error('💥 Unexpected error:', error);
        process.exit(1);
    });
}

module.exports = { testAbapParser, sampleAbapCode };
