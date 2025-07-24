import { McpError, ErrorCode } from '../lib/utils';
import { writeResultToFile } from '../lib/writeResultToFile';
import { 
    AbapSemanticAnalyzer, 
    AbapSemanticAnalysisResult, 
    AbapSymbolInfo, 
    AbapParameterInfo, 
    AbapParseError, 
    AbapScopeInfo 
} from '../lib/abapParser';

export const TOOL_DEFINITION = {
  name: "GetAbapSemanticAnalysis",
  description: "Perform semantic analysis on ABAP code and return symbols, types, scopes, and dependencies with detailed metadata.",
  inputSchema: {
    type: "object",
    properties: {
      code: { 
        type: "string", 
        description: "ABAP source code to analyze" 
      },
      filePath: {
        type: "string",
        description: "Optional file path to write the result to"
      },
      includeDetailedScopes: {
        type: "boolean",
        description: "Whether to include detailed scope information (default: true)",
        default: true
      },
      analyzeComplexity: {
        type: "boolean", 
        description: "Whether to analyze code complexity metrics (default: false)",
        default: false
      }
    },
    required: ["code"]
  }
} as const;

// Helper function to calculate complexity metrics
function calculateComplexityMetrics(code: string): any {
    const lines = code.split('\n');
    let cyclomaticComplexity = 1; // Base complexity
    let nestingDepth = 0;
    let maxNestingDepth = 0;
    
    for (const line of lines) {
        const trimmedLine = line.trim().toLowerCase();
        
        // Count decision points for cyclomatic complexity
        if (trimmedLine.includes('if ') || 
            trimmedLine.includes('elseif ') ||
            trimmedLine.includes('case ') ||
            trimmedLine.includes('while ') ||
            trimmedLine.includes('loop ') ||
            trimmedLine.includes('catch ')) {
            cyclomaticComplexity++;
        }
        
        // Track nesting depth
        if (trimmedLine.includes('if ') || 
            trimmedLine.includes('loop ') ||
            trimmedLine.includes('case ') ||
            trimmedLine.includes('try ')) {
            nestingDepth++;
            maxNestingDepth = Math.max(maxNestingDepth, nestingDepth);
        }
        
        if (trimmedLine.includes('endif') || 
            trimmedLine.includes('endloop') ||
            trimmedLine.includes('endcase') ||
            trimmedLine.includes('endtry')) {
            nestingDepth = Math.max(0, nestingDepth - 1);
        }
    }
    
    return {
        cyclomaticComplexity,
        maxNestingDepth,
        linesOfCode: lines.length,
        nonEmptyLines: lines.filter(line => line.trim() !== '').length,
        commentLines: lines.filter(line => line.trim().startsWith('*') || line.trim().startsWith('"')).length
    };
}

export async function handleGetAbapSemanticAnalysis(args: any) {
    try {
        if (!args?.code) {
            throw new McpError(ErrorCode.InvalidParams, 'ABAP code is required');
        }

        const analyzer = new AbapSemanticAnalyzer();
        const analysis = analyzer.analyze(args.code);

        // Add complexity metrics if requested
        let enhancedAnalysis: any = { ...analysis };
        
        if (args.analyzeComplexity) {
            enhancedAnalysis.complexityMetrics = calculateComplexityMetrics(args.code);
        }

        // Add additional metadata
        enhancedAnalysis.metadata = {
            timestamp: new Date().toISOString(),
            codeLength: args.code.length,
            includeDetailedScopes: args.includeDetailedScopes !== false,
            analyzeComplexity: args.analyzeComplexity === true,
            analysisMethod: 'simplified_regex_based'
        };

        // Filter scopes if detailed scopes not requested
        if (args.includeDetailedScopes === false) {
            enhancedAnalysis.scopes = enhancedAnalysis.scopes.filter((scope: AbapScopeInfo) => 
                scope.type === 'global' || scope.type === 'class'
            );
        }

        const result = {
            isError: false,
            content: [
                {
                    type: "text",
                    text: JSON.stringify(enhancedAnalysis, null, 2)
                }
            ]
        };

        if (args.filePath) {
            writeResultToFile(JSON.stringify(enhancedAnalysis, null, 2), args.filePath);
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
