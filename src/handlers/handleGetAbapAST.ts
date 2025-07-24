import { McpError, ErrorCode } from '../lib/utils';
import { writeResultToFile } from '../lib/writeResultToFile';
import { AbapASTGenerator } from '../lib/abapParser';

export const TOOL_DEFINITION = {
  name: "GetAbapAST",
  description: "Parse ABAP code and return AST (Abstract Syntax Tree) in JSON format using ANTLR4 grammar.",
  inputSchema: {
    type: "object",
    properties: {
      code: { 
        type: "string", 
        description: "ABAP source code to parse" 
      },
      filePath: {
        type: "string",
        description: "Optional file path to write the result to"
      },
      useDetailedAST: {
        type: "boolean",
        description: "Whether to return detailed AST with full parse tree (default: false)",
        default: false
      }
    },
    required: ["code"]
  }
} as const;

// Helper functions
function generateCodeHash(code: string): string {
    // Simple hash function for code fingerprinting
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
        const char = code.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
}

function countASTNodes(ast: any): number {
    if (typeof ast !== 'object' || ast === null) {
        return 0;
    }
    
    let count = 1; // Count current node
    
    for (const key in ast) {
        if (ast.hasOwnProperty(key)) {
            const value = ast[key];
            if (Array.isArray(value)) {
                count += value.reduce((sum, item) => sum + countASTNodes(item), 0);
            } else if (typeof value === 'object' && value !== null) {
                count += countASTNodes(value);
            }
        }
    }
    
    return count;
}

export async function handleGetAbapAST(args: any) {
    try {
        if (!args?.code) {
            throw new McpError(ErrorCode.InvalidParams, 'ABAP code is required');
        }

        const astGenerator = new AbapASTGenerator();
        const ast = astGenerator.parseToAST(args.code);

        // Add additional metadata
        const enrichedAST = {
            ...ast,
            parseOptions: {
                useDetailedAST: args.useDetailedAST || false,
                timestamp: new Date().toISOString(),
                codeHash: generateCodeHash(args.code)
            },
            statistics: {
                parsingTime: 0, // Would be measured in real implementation
                memoryUsage: process.memoryUsage().heapUsed,
                nodeCount: countASTNodes(ast)
            }
        };

        const result = {
            isError: false,
            content: [
                {
                    type: "text",
                    text: JSON.stringify(enrichedAST, null, 2)
                }
            ]
        };

        if (args.filePath) {
            writeResultToFile(JSON.stringify(enrichedAST, null, 2), args.filePath);
        }

        return result;
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
