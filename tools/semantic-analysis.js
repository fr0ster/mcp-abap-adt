#!/usr/bin/env node

/**
 * СЕМАНТИЧНИЙ АНАЛІЗ ABAP
 * Usage: node semantic-analysis.js OBJECT_NAME [TYPE]
 */

const path = require('path');
const projectRoot = path.resolve(__dirname, '..');

const { handleGetClass } = require(path.join(projectRoot, 'dist/handlers/handleGetClass'));
const { handleGetFunction } = require(path.join(projectRoot, 'dist/handlers/handleGetFunction'));
const { handleGetInterface } = require(path.join(projectRoot, 'dist/handlers/handleGetInterface'));
const { handleGetProgram } = require(path.join(projectRoot, 'dist/handlers/handleGetProgram'));
const { handleGetFunctionGroup } = require(path.join(projectRoot, 'dist/handlers/handleGetFunctionGroup'));
const { handleGetInclude } = require(path.join(projectRoot, 'dist/handlers/handleGetInclude'));
const { handleGetAbapSemanticAnalysis } = require(path.join(projectRoot, 'dist/handlers/handleGetAbapSemanticAnalysis'));
const { handleGetAbapAST } = require(path.join(projectRoot, 'dist/handlers/handleGetAbapAST'));
const { handleGetAbapSystemSymbols } = require(path.join(projectRoot, 'dist/handlers/handleGetAbapSystemSymbols'));

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

async function semanticAnalysis(objectName, objectType) {
    if (!objectName) {
        console.error('Usage: node semantic-analysis.js OBJECT_NAME [TYPE]');
        process.exit(1);
    }

    console.log(`SEMANTIC ANALYSIS: ${objectName}`);
    console.log('===================================');

    try {
        const code = await fetchSourceCode(objectName, objectType);
        console.log(`Source: ${code.length} chars, ${code.split('\n').length} lines`);
        
        // Отримую AST для додаткової інформації про зовнішні скоупи
        const astResult = await handleGetAbapAST({ code });
        const ast = astResult.isError ? null : JSON.parse(astResult.content[0].text);

        const semanticResult = await handleGetAbapSemanticAnalysis({ 
            code, 
            analyzeComplexity: true,
            includeDetailedScopes: true
        });
        
        if (semanticResult.isError) {
            console.error('SEMANTIC FAILED:', semanticResult.content[0]?.text);
            process.exit(1);
        }

        const analysis = JSON.parse(semanticResult.content[0].text);
        
        // Використовую handleGetAbapSystemSymbols для отримання повної інформації про зовнішні символи
        const systemResult = await handleGetAbapSystemSymbols({ 
            code, 
            resolveSystemInfo: true,  // Отримуємо інформацію з SAP системи
            includeLocalSymbols: true 
        });
        
        const systemAnalysis = systemResult.isError ? null : JSON.parse(systemResult.content[0].text);
        
        // Розділяю символи на internal та external з повною системною інформацією
        const externalSymbols = [];
        const internalSymbols = [];
        
        if (systemAnalysis && systemAnalysis.symbols) {
            systemAnalysis.symbols.forEach(symbol => {
                if (symbol.systemInfo && symbol.systemInfo.exists) {
                    // Зовнішній символ з повною інформацією з SAP
                    externalSymbols.push({
                        name: symbol.name,
                        type: symbol.type,
                        definitionType: 'external',
                        line: symbol.line,
                        systemInfo: {
                            objectType: symbol.systemInfo.objectType,
                            description: symbol.systemInfo.description || 'No description',
                            package: symbol.systemInfo.package || 'Unknown',
                            responsible: symbol.systemInfo.responsible,
                            lastChanged: symbol.systemInfo.lastChanged,
                            methods: symbol.systemInfo.methods,
                            interfaces: symbol.systemInfo.interfaces,
                            superClass: symbol.systemInfo.superClass,
                            attributes: symbol.systemInfo.attributes
                        }
                    });
                } else {
                    // Внутрішній символ
                    internalSymbols.push({
                        name: symbol.name,
                        type: symbol.type,
                        definitionType: 'internal',
                        line: symbol.line,
                        scope: symbol.scope,
                        visibility: symbol.visibility
                    });
                }
            });
        }
        
        // Створюю розширений результат з правильним поділом скоупів
        const result = {
            objectName,
            objectType: objectType || 'auto-detected',
            sourceStats: {
                chars: code.length,
                lines: code.split('\n').length,
                symbols: analysis.symbols?.length || 0,
                dependencies: analysis.dependencies?.length || 0,
                scopes: analysis.scopes?.length || 0,
                errors: analysis.errors?.length || 0,
                externalSymbols: externalSymbols.length,
                systemResolution: systemAnalysis?.systemResolutionStats || {}
            },
            complexityMetrics: analysis.complexityMetrics || {},
            astData: ast ? {
                classes: ast.classes?.length || 0,
                methods: ast.methods?.length || 0,
                dataDeclarations: ast.dataDeclarations?.length || 0,
                includes: ast.includes?.length || 0
            } : null,
            symbols: {
                internal: internalSymbols,
                external: externalSymbols
            },
            scopes: {
                internal: analysis.scopes?.map(scope => ({
                    ...scope,
                    scopeType: scope.parent ? 'nested' : 'root',
                    definitionType: 'internal'
                })) || [],
                external: systemAnalysis?.scopes?.filter(scope => 
                    scope.definitionType === 'external'
                ) || []
            },
            dependencies: analysis.dependencies || [],
            errors: analysis.errors || []
        };

        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error('ERROR:', error.message);
        process.exit(1);
    }
    
    process.exit(0);
}

const objectName = process.argv[2];
const objectType = process.argv[3];

if (require.main === module) {
    semanticAnalysis(objectName, objectType);
}
