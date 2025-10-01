import { McpError, ErrorCode } from '../lib/utils';
import { writeResultToFile } from '../lib/writeResultToFile';
import { handleGetClass } from './handleGetClass';
import { handleGetFunction } from './handleGetFunction';
import { handleGetInterface } from './handleGetInterface';
import { handleGetObjectInfo } from './handleGetObjectInfo';
import { 
    AbapSemanticAnalyzer, 
    AbapSemanticAnalysisResult, 
    AbapSymbolInfo, 
    AbapParameterInfo, 
    AbapParseError, 
    AbapScopeInfo 
} from '../lib/abapParser';

export const TOOL_DEFINITION = {
  name: "GetAbapSystemSymbols",
  description: "Resolve ABAP symbols from semantic analysis with SAP system information including types, scopes, descriptions, and packages.",
  inputSchema: {
    type: "object",
    properties: {
      code: { 
        type: "string", 
        description: "ABAP source code to analyze and resolve symbols for" 
      },
      filePath: {
        type: "string",
        description: "Optional file path to write the result to"
      },
      resolveSystemInfo: {
        type: "boolean",
        description: "Whether to resolve symbols with SAP system information (default: true)",
        default: true
      },
      includeLocalSymbols: {
        type: "boolean",
        description: "Whether to include local symbols in system resolution (default: false)",
        default: false
      }
    },
    required: ["code"]
  }
} as const;

interface AbapSystemInfo {
    exists: boolean;
    objectType?: string;
    description?: string;
    package?: string;
    responsible?: string;
    lastChanged?: string;
    sapRelease?: string;
    techName?: string;
    methods?: string[];
    interfaces?: string[];
    superClass?: string;
    attributes?: string[];
    error?: string;
}

interface AbapSystemSymbolsResult {
    symbols: (AbapSymbolInfo & { systemInfo?: AbapSystemInfo })[];
    dependencies: string[];
    errors: AbapParseError[];
    scopes: AbapScopeInfo[];
    systemResolutionStats: {
        totalSymbols: number;
        resolvedSymbols: number;
        failedSymbols: number;
        resolutionRate: string;
    };
}

type AbapSymbolWithSystemInfo = AbapSymbolInfo & { systemInfo?: AbapSystemInfo };

class AbapSystemSymbolResolver {
    public async resolveSymbols(symbols: AbapSymbolInfo[]): Promise<{ resolvedSymbols: AbapSymbolWithSystemInfo[], stats: any }> {
        const resolvedSymbols: AbapSymbolWithSystemInfo[] = [];
        let resolvedCount = 0;
        let failedCount = 0;

        for (const symbol of symbols) {
            try {
                const resolved = await this.resolveSymbol(symbol);
                resolvedSymbols.push(resolved);
                if (resolved.systemInfo?.exists) {
                    resolvedCount++;
                } else {
                    failedCount++;
                }
            } catch (error) {
                // If resolution fails, add original symbol with error info
                resolvedSymbols.push({
                    ...symbol,
                    systemInfo: {
                        exists: false,
                        error: error instanceof Error ? error.message : String(error)
                    }
                });
                failedCount++;
            }
        }

        const stats = {
            totalSymbols: symbols.length,
            resolvedSymbols: resolvedCount,
            failedSymbols: failedCount,
            resolutionRate: `${((resolvedCount / symbols.length) * 100).toFixed(1)}%`
        };

        return { resolvedSymbols, stats };
    }

    private async resolveSymbol(symbol: AbapSymbolInfo): Promise<AbapSymbolWithSystemInfo> {
        try {
            switch (symbol.type) {
                case 'class':
                    return await this.resolveClassSymbol(symbol);
                case 'function':
                    return await this.resolveFunctionSymbol(symbol);
                case 'interface':
                    return await this.resolveInterfaceSymbol(symbol);
                default:
                    return await this.resolveGenericSymbol(symbol);
            }
        } catch (error) {
            return {
                ...symbol,
                systemInfo: {
                    exists: false,
                    error: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }

    private async resolveClassSymbol(symbol: AbapSymbolInfo): Promise<AbapSymbolWithSystemInfo> {
        try {
            const classInfo = await handleGetClass({ class_name: symbol.name });
            
            if (classInfo.isError) {
                return {
                    ...symbol,
                    systemInfo: {
                        exists: false,
                        error: 'Class not found in SAP system'
                    }
                };
            }

            // Parse the response to extract information
            const responseText = (classInfo.content[0] as any)?.text || '';
            let classData;
            
            try {
                classData = JSON.parse(responseText);
            } catch {
                // If not JSON, treat as plain text
                classData = { source: responseText };
            }

            return {
                ...symbol,
                systemInfo: {
                    exists: true,
                    objectType: 'CLAS',
                    description: classData.description || `ABAP Class ${symbol.name}`,
                    package: classData.package || 'Unknown',
                    methods: classData.methods || [],
                    interfaces: classData.interfaces || [],
                    superClass: classData.superClass,
                    attributes: classData.attributes || []
                }
            };
        } catch (error) {
            return {
                ...symbol,
                systemInfo: {
                    exists: false,
                    error: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }

    private async resolveFunctionSymbol(symbol: AbapSymbolInfo): Promise<AbapSymbolWithSystemInfo> {
        try {
            const functionInfo = await handleGetFunction({ function_name: symbol.name });
            
            if (functionInfo.isError) {
                return {
                    ...symbol,
                    systemInfo: {
                        exists: false,
                        error: 'Function not found in SAP system'
                    }
                };
            }

            const responseText = (functionInfo.content[0] as any)?.text || '';
            let functionData;
            
            try {
                functionData = JSON.parse(responseText);
            } catch {
                functionData = { source: responseText };
            }

            return {
                ...symbol,
                systemInfo: {
                    exists: true,
                    objectType: 'FUNC',
                    description: functionData.description || `ABAP Function ${symbol.name}`,
                    package: functionData.package || 'Unknown',
                    techName: functionData.name || symbol.name
                }
            };
        } catch (error) {
            return {
                ...symbol,
                systemInfo: {
                    exists: false,
                    error: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }

    private async resolveInterfaceSymbol(symbol: AbapSymbolInfo): Promise<AbapSymbolWithSystemInfo> {
        try {
            const interfaceInfo = await handleGetInterface({ interface_name: symbol.name });
            
            if (interfaceInfo.isError) {
                return {
                    ...symbol,
                    systemInfo: {
                        exists: false,
                        error: 'Interface not found in SAP system'
                    }
                };
            }

            const responseText = (interfaceInfo.content[0] as any)?.text || '';
            let interfaceData;
            
            try {
                interfaceData = JSON.parse(responseText);
            } catch {
                interfaceData = { source: responseText };
            }

            return {
                ...symbol,
                systemInfo: {
                    exists: true,
                    objectType: 'INTF',
                    description: interfaceData.description || `ABAP Interface ${symbol.name}`,
                    package: interfaceData.package || 'Unknown',
                    methods: interfaceData.methods || []
                }
            };
        } catch (error) {
            return {
                ...symbol,
                systemInfo: {
                    exists: false,
                    error: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }

    private async resolveGenericSymbol(symbol: AbapSymbolInfo): Promise<AbapSymbolWithSystemInfo> {
        try {
            // For generic symbols, we don't have a specific handler
            // Return symbol with basic system info indicating it exists locally
            return {
                ...symbol,
                systemInfo: {
                    exists: false,
                    objectType: 'LOCAL',
                    description: `Local ${symbol.type} ${symbol.name}`,
                    package: 'LOCAL',
                    error: 'No system resolution available for this symbol type'
                }
            };
        } catch (error) {
            return {
                ...symbol,
                systemInfo: {
                    exists: false,
                    error: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }
}

export async function handleGetAbapSystemSymbols(args: any) {
    try {
        if (!args?.code) {
            throw new McpError(ErrorCode.InvalidParams, 'ABAP code is required');
        }

        // First, perform semantic analysis
        const analyzer = new AbapSemanticAnalyzer();
        const semanticResult = analyzer.analyze(args.code);

        // Then, resolve symbols with SAP system information if requested
        let symbols: AbapSymbolWithSystemInfo[] = semanticResult.symbols;
        let stats = {
            totalSymbols: symbols.length,
            resolvedSymbols: 0,
            failedSymbols: 0,
            resolutionRate: '0%'
        };

        if (args.resolveSystemInfo !== false) {
            const resolver = new AbapSystemSymbolResolver();
            const resolverResult = await resolver.resolveSymbols(semanticResult.symbols);
            symbols = resolverResult.resolvedSymbols;
            stats = resolverResult.stats;
        }

        // Filter local symbols if not requested
        if (args.includeLocalSymbols === false) {
            symbols = symbols.filter(symbol => 
                symbol.type === 'class' || 
                symbol.type === 'function' || 
                symbol.type === 'interface'
            );
        }

        const result: AbapSystemSymbolsResult = {
            symbols,
            dependencies: semanticResult.dependencies,
            errors: semanticResult.errors,
            scopes: semanticResult.scopes,
            systemResolutionStats: stats
        };

        const response = {
            isError: false,
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };

        if (args.filePath) {
            writeResultToFile(JSON.stringify(result, null, 2), args.filePath);
        }

        return response;
    } catch (error) {
        return {
            isError: true,
            content: [
                {
                    type: "text",
                    text: error instanceof Error ? error.message : String(error)
                }
            ]
        };
    }
}
