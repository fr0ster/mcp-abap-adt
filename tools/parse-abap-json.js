#!/usr/bin/env node

/**
 * JSON ABAP parser - повертає чистий JSON для програмного використання
 * Usage: node parse-abap-json.js "DATA: lv_test TYPE string."
 */

const { handleGetAbapAST } = require('../dist/handlers/handleGetAbapAST');
const { handleGetAbapSemanticAnalysis } = require('../dist/handlers/handleGetAbapSemanticAnalysis');
const { handleGetAbapSystemSymbols } = require('../dist/handlers/handleGetAbapSystemSymbols');

async function parseJson(code) {
    if (!code) {
        console.log(JSON.stringify({ error: 'No ABAP code provided' }));
        process.exit(1);
    }

    try {
        // Get all parsing results
        const [astResult, semanticResult, systemResult] = await Promise.all([
            handleGetAbapAST({ code }),
            handleGetAbapSemanticAnalysis({ code, analyzeComplexity: true }),
            handleGetAbapSystemSymbols({ code, resolveSystemInfo: false, includeLocalSymbols: true })
        ]);

        const result = {
            input: code,
            timestamp: new Date().toISOString(),
            ast: astResult.isError ? { error: astResult.content[0]?.text } : JSON.parse(astResult.content[0].text),
            semantic: semanticResult.isError ? { error: semanticResult.content[0]?.text } : JSON.parse(semanticResult.content[0].text),
            system: systemResult.isError ? { error: systemResult.content[0]?.text } : JSON.parse(systemResult.content[0].text)
        };

        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.log(JSON.stringify({ error: error.message }));
        process.exit(1);
    }
    
    process.exit(0);
}

const code = process.argv[2];
if (require.main === module) {
    parseJson(code);
}
