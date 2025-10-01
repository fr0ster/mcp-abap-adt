#!/usr/bin/env node

/**
 * АНАЛІЗ СИМВОЛІВ З ТИПАМИ, ПАКЕТАМИ, СКОУПАМИ, ДЕСКРИПШИНАМИ
 * Usage: node symbols-analysis.js OBJECT_NAME [TYPE]
 */

const path = require('path');
const projectRoot = path.resolve(__dirname, '..');

const { handleGetClass } = require(path.join(projectRoot, 'dist/handlers/handleGetClass'));
const { handleGetFunction } = require(path.join(projectRoot, 'dist/handlers/handleGetFunction'));
const { handleGetInterface } = require(path.join(projectRoot, 'dist/handlers/handleGetInterface'));
const { handleGetProgram } = require(path.join(projectRoot, 'dist/handlers/handleGetProgram'));
const { handleGetFunctionGroup } = require(path.join(projectRoot, 'dist/handlers/handleGetFunctionGroup'));
const { handleGetInclude } = require(path.join(projectRoot, 'dist/handlers/handleGetInclude'));
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

async function symbolsAnalysis(objectName, objectType) {
    if (!objectName) {
        console.error('Usage: node symbols-analysis.js OBJECT_NAME [TYPE]');
        process.exit(1);
    }

    console.log(`SYMBOLS ANALYSIS: ${objectName}`);
    console.log('==================================');

    try {
        const code = await fetchSourceCode(objectName, objectType);
        console.log(`Source: ${code.length} chars, ${code.split('\n').length} lines`);
        
        const systemResult = await handleGetAbapSystemSymbols({ 
            code, 
            resolveSystemInfo: true,  // Resolve with SAP system
            includeLocalSymbols: true
        });
        
        if (systemResult.isError) {
            console.error('SYMBOLS FAILED:', systemResult.content[0]?.text);
            process.exit(1);
        }

        const system = JSON.parse(systemResult.content[0].text);
        
        console.log(`Total Symbols: ${system.systemResolutionStats?.totalSymbols || 0}`);
        console.log(`Resolved from SAP: ${system.systemResolutionStats?.resolvedSymbols || 0}`);
        console.log(`Failed Resolution: ${system.systemResolutionStats?.failedSymbols || 0}`);
        console.log(`Resolution Rate: ${system.systemResolutionStats?.resolutionRate || '0%'}`);

        if (system.symbols && system.symbols.length > 0) {
            console.log('\nSYMBOLS WITH FULL INFO:');
            system.symbols.forEach((symbol, index) => {
                console.log(`\n${index + 1}. ${symbol.name} (${symbol.type})`);
                console.log(`   Line: ${symbol.line}, Scope: ${symbol.scope}`);
                console.log(`   Visibility: ${symbol.visibility || 'none'}`);
                
                if (symbol.dataType) {
                    console.log(`   Data Type: ${symbol.dataType}`);
                }
                
                if (symbol.description) {
                    console.log(`   Description: ${symbol.description}`);
                }
                
                if (symbol.parameters && symbol.parameters.length > 0) {
                    console.log(`   Parameters:`);
                    symbol.parameters.forEach(param => {
                        console.log(`     ${param.name} (${param.type}) - ${param.dataType || 'no type'} ${param.optional ? '[optional]' : ''}`);
                    });
                }
                
                if (symbol.systemInfo) {
                    console.log(`   SYSTEM INFO:`);
                    console.log(`     Exists in SAP: ${symbol.systemInfo.exists ? 'YES' : 'NO'}`);
                    console.log(`     Object Type: ${symbol.systemInfo.objectType || 'unknown'}`);
                    
                    if (symbol.systemInfo.description) {
                        console.log(`     SAP Description: ${symbol.systemInfo.description}`);
                    }
                    
                    if (symbol.systemInfo.package) {
                        console.log(`     Package: ${symbol.systemInfo.package}`);
                    }
                    
                    if (symbol.systemInfo.responsible) {
                        console.log(`     Responsible: ${symbol.systemInfo.responsible}`);
                    }
                    
                    if (symbol.systemInfo.lastChanged) {
                        console.log(`     Last Changed: ${symbol.systemInfo.lastChanged}`);
                    }
                    
                    if (symbol.systemInfo.methods && symbol.systemInfo.methods.length > 0) {
                        console.log(`     Methods (${symbol.systemInfo.methods.length}): ${symbol.systemInfo.methods.slice(0, 5).join(', ')}${symbol.systemInfo.methods.length > 5 ? '...' : ''}`);
                    }
                    
                    if (symbol.systemInfo.interfaces && symbol.systemInfo.interfaces.length > 0) {
                        console.log(`     Interfaces: ${symbol.systemInfo.interfaces.join(', ')}`);
                    }
                    
                    if (symbol.systemInfo.superClass) {
                        console.log(`     Super Class: ${symbol.systemInfo.superClass}`);
                    }
                    
                    if (symbol.systemInfo.attributes && symbol.systemInfo.attributes.length > 0) {
                        console.log(`     Attributes: ${symbol.systemInfo.attributes.join(', ')}`);
                    }
                    
                    if (symbol.systemInfo.error) {
                        console.log(`     Error: ${symbol.systemInfo.error}`);
                    }
                }
            });
        }

        if (system.scopes && system.scopes.length > 0) {
            console.log('\nSCOPES HIERARCHY:');
            system.scopes.forEach(scope => {
                console.log(`  ${scope.name} (${scope.type}) lines:${scope.startLine}-${scope.endLine}`);
                console.log(`    Parent: ${scope.parent || 'none'}`);
            });
        }

        if (system.dependencies && system.dependencies.length > 0) {
            console.log('\nDEPENDENCIES:');
            system.dependencies.forEach(dep => {
                console.log(`  ${dep}`);
            });
        }

        if (system.errors && system.errors.length > 0) {
            console.log('\nERRORS:');
            system.errors.forEach(error => {
                console.log(`  ${error.severity}: ${error.message} (line:${error.line})`);
            });
        }

        // Show resolved vs unresolved symbols
        const resolvedSymbols = system.symbols.filter(s => s.systemInfo?.exists);
        const unresolvedSymbols = system.symbols.filter(s => !s.systemInfo?.exists);

        if (resolvedSymbols.length > 0) {
            console.log('\nRESOLVED SYMBOLS FROM SAP:');
            resolvedSymbols.forEach(symbol => {
                console.log(`  ${symbol.name} (${symbol.systemInfo.objectType}) - ${symbol.systemInfo.description || 'No description'}`);
                if (symbol.systemInfo.package) {
                    console.log(`    Package: ${symbol.systemInfo.package}`);
                }
            });
        }

        if (unresolvedSymbols.length > 0) {
            console.log('\nLOCAL/UNRESOLVED SYMBOLS:');
            unresolvedSymbols.forEach(symbol => {
                console.log(`  ${symbol.name} (${symbol.type}) - Local symbol`);
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
    symbolsAnalysis(objectName, objectType);
}
