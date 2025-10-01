#!/usr/bin/env node

/**
 * ЛЕКСИЧНИЙ АНАЛІЗ ABAP
 * Usage: node lexical-analysis.js OBJECT_NAME [TYPE]
 */

const path = require('path');
const projectRoot = path.resolve(__dirname, '..');

const { handleGetClass } = require(path.join(projectRoot, 'dist/handlers/handleGetClass'));
const { handleGetFunction } = require(path.join(projectRoot, 'dist/handlers/handleGetFunction'));
const { handleGetInterface } = require(path.join(projectRoot, 'dist/handlers/handleGetInterface'));
const { handleGetProgram } = require(path.join(projectRoot, 'dist/handlers/handleGetProgram'));
const { handleGetFunctionGroup } = require(path.join(projectRoot, 'dist/handlers/handleGetFunctionGroup'));
const { handleGetInclude } = require(path.join(projectRoot, 'dist/handlers/handleGetInclude'));
const { handleGetAbapAST } = require(path.join(projectRoot, 'dist/handlers/handleGetAbapAST'));

async function fetchSourceCode(objectName, objectType) {
    // Auto-detect type if not provided
    if (!objectType) {
        if (objectName.startsWith('CL_') || objectName.startsWith('ZCL_')) {
            objectType = 'class';
        } else if (objectName.startsWith('IF_') || objectName.startsWith('ZIF_')) {
            objectType = 'interface';
        } else if (objectName.startsWith('Z') || objectName.startsWith('Y')) {
            objectType = 'function';
        } else {
            objectType = 'program';
        }
    }

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
            throw new Error(`Unknown type: ${objectType}`);
    }

    if (sourceResult.isError) {
        throw new Error(`Failed to get ${objectType}: ${sourceResult.content[0]?.text}`);
    }

    const sourceData = sourceResult.content[0].text;
    try {
        const jsonData = JSON.parse(sourceData);
        return jsonData.source || jsonData.code || sourceData;
    } catch {
        return sourceData;
    }
}

async function lexicalAnalysis(objectName, objectType) {
    if (!objectName) {
        console.error('Usage: node lexical-analysis.js OBJECT_NAME [TYPE]');
        process.exit(1);
    }

    console.log(`LEXICAL ANALYSIS: ${objectName}`);
    console.log('=================================');

    try {
        const code = await fetchSourceCode(objectName, objectType);
        console.log(`Source: ${code.length} chars, ${code.split('\n').length} lines`);
        
        const astResult = await handleGetAbapAST({ code });
        
        if (astResult.isError) {
            console.error('AST FAILED:', astResult.content[0]?.text);
            process.exit(1);
        }

        const ast = JSON.parse(astResult.content[0].text);
        
        console.log(`Classes: ${ast.classes?.length || 0}`);
        console.log(`Methods: ${ast.methods?.length || 0}`);
        console.log(`Data declarations: ${ast.dataDeclarations?.length || 0}`);
        console.log(`Forms: ${ast.forms?.length || 0}`);
        console.log(`Includes: ${ast.includes?.length || 0}`);
        
        if (ast.structures && ast.structures.length > 0) {
            console.log('\nSTRUCTURES:');
            ast.structures.forEach(struct => {
                console.log(`  ${struct.type} at line ${struct.line}`);
            });
        }

        if (ast.classes && ast.classes.length > 0) {
            console.log('\nCLASSES:');
            ast.classes.forEach(cls => {
                console.log(`  ${cls.name} at line ${cls.line}`);
            });
        }

        if (ast.methods && ast.methods.length > 0) {
            console.log('\nMETHODS:');
            ast.methods.forEach(method => {
                console.log(`  ${method.name} at line ${method.line}`);
            });
        }

        if (ast.dataDeclarations && ast.dataDeclarations.length > 0) {
            console.log('\nDATA DECLARATIONS:');
            ast.dataDeclarations.forEach(data => {
                console.log(`  ${data.name} at line ${data.line}`);
            });
        }

    } catch (error) {
        console.error('ERROR:', error.message);
        process.exit(1);
    }
    
    process.exit(0);
}

const objectName = process.argv[2];
const objectType = process.argv[3];

if (require.main === module) {
    lexicalAnalysis(objectName, objectType);
}
