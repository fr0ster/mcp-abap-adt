import * as z from 'zod';
import type { AdtCodes, TableMainOf } from '../../../lib/adtProjections';
import {
  answerCaught,
  type FailureEntry,
  failedPayloadOf,
  isCredentialFailure,
  isCredentialPayload,
  type JsonAnswer,
  type McpResult,
  thrownEntry,
} from '../../../lib/answer';
import { runPhase, withSequentialFallback } from '../../../lib/batch/phases';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { TIMEOUT_FIELD, withLongToolAdvice } from '../../../lib/longTools';
import { return_error } from '../../../lib/utils';
import { child, text } from '../../../lib/xml/tree';
import { handleGetClass } from '../../class/high/handleGetClass';
import { handleGetFunctionModule } from '../../function_module/high/handleGetFunctionModule';
import { handleGetInterface } from '../../interface/high/handleGetInterface';
import {
  handleSearchObject,
  parseSearchHits,
  type SearchHit,
} from '../../search/readonly/handleSearchObject';
export const TOOL_DEFINITION = {
  name: 'GetAbapSystemSymbols',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] Resolve ABAP symbols from semantic analysis with SAP system information including types, scopes, descriptions, and packages.',
  ),
  inputSchema: z.object({
    timeout: TIMEOUT_FIELD,
    code: z
      .string()
      .describe('ABAP source code to analyze and resolve symbols for'),
  }),
} as const;

interface AbapSymbolInfo {
  name: string;
  type:
    | 'class'
    | 'method'
    | 'function'
    | 'variable'
    | 'constant'
    | 'type'
    | 'interface'
    | 'form'
    | 'program'
    | 'report'
    | 'include';
  scope: string;
  line: number;
  column: number;
  description?: string;
  package?: string;
  visibility?: 'public' | 'protected' | 'private';
  dataType?: string;
  parameters?: AbapParameterInfo[];
  systemInfo?: AbapSystemInfo;
  /** The symbol's read failed: its error as it is, with the step. */
  error?: FailureEntry;
}

interface AbapParameterInfo {
  name: string;
  type: 'importing' | 'exporting' | 'changing' | 'returning';
  dataType?: string;
  optional?: boolean;
  defaultValue?: string;
}

/**
 * What a symbol resolved to: a class or an interface by main type, a function
 * module by this tool's own word for one (`FUNC`), or a symbol of the source
 * alone.
 */
type SymbolObjectType =
  | TableMainOf<AdtCodes<'CLAS/OC' | 'INTF/OI'>>
  | 'FUNC'
  | 'LOCAL';

/** A class, by its main type. */
const CLASS_SYMBOL: TableMainOf<AdtCodes<'CLAS/OC'>> = 'CLAS';
/** An interface, by its main type. */
const INTERFACE_SYMBOL: TableMainOf<AdtCodes<'INTF/OI'>> = 'INTF';

interface AbapSystemInfo {
  exists: boolean;
  objectType?: SymbolObjectType;
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
  /** A function module's group, as the repository search named it. */
  functionGroup?: string;
  error?: string;
}

interface AbapSystemSymbolsResult {
  symbols: AbapSymbolInfo[];
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

interface AbapParseError {
  message: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
}

interface AbapScopeInfo {
  name: string;
  type: 'global' | 'class' | 'method' | 'form' | 'function' | 'local';
  startLine: number;
  endLine: number;
  parent?: string;
}

// Import semantic analyzer from the previous handler
class SimpleAbapSemanticAnalyzer {
  private symbols: AbapSymbolInfo[] = [];
  private scopes: AbapScopeInfo[] = [];
  private dependencies: string[] = [];
  private errors: AbapParseError[] = [];
  private currentScope: string = 'global';

  public analyze(code: string): {
    symbols: AbapSymbolInfo[];
    dependencies: string[];
    errors: AbapParseError[];
    scopes: AbapScopeInfo[];
  } {
    // Reset state
    this.symbols = [];
    this.scopes = [];
    this.dependencies = [];
    this.errors = [];
    this.currentScope = 'global';

    try {
      this.analyzeCode(code);
    } catch (error) {
      this.errors.push({
        message: error instanceof Error ? error.message : String(error),
        line: 1,
        column: 1,
        severity: 'error',
      });
    }

    return {
      symbols: this.symbols,
      dependencies: this.dependencies,
      errors: this.errors,
      scopes: this.scopes,
    };
  }

  private analyzeCode(code: string): void {
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      if (line === '' || line.startsWith('*') || line.startsWith('"')) {
        continue;
      }

      try {
        this.analyzeClassDefinition(line, lineNumber);
        this.analyzeClassImplementation(line, lineNumber);
        this.analyzeMethodDefinition(line, lineNumber);
        this.analyzeMethodImplementation(line, lineNumber);
        this.analyzeDataDeclaration(line, lineNumber);
        this.analyzeConstantsDeclaration(line, lineNumber);
        this.analyzeTypesDeclaration(line, lineNumber);
        this.analyzeFormDefinition(line, lineNumber);
        this.analyzeFunctionDefinition(line, lineNumber);
        this.analyzeIncludeStatement(line, lineNumber);
        this.analyzeInterfaceDefinition(line, lineNumber);
        this.analyzeScopeEnders(line, lineNumber);
      } catch (error) {
        this.errors.push({
          message: `Error analyzing line ${lineNumber}: ${error instanceof Error ? error.message : String(error)}`,
          line: lineNumber,
          column: 1,
          severity: 'warning',
        });
      }
    }
  }

  private analyzeClassDefinition(line: string, lineNumber: number): void {
    const classDefMatch = line
      .toLowerCase()
      .match(/^class\s+([a-zA-Z0-9_]+)\s+definition/);
    if (classDefMatch) {
      const className = classDefMatch[1].toUpperCase();
      this.addSymbol({
        name: className,
        type: 'class',
        scope: this.currentScope,
        line: lineNumber,
        column: 1,
        visibility: this.extractVisibility(line),
      });
      this.pushScope(className, 'class', lineNumber);
    }
  }

  private analyzeClassImplementation(line: string, lineNumber: number): void {
    const classImplMatch = line
      .toLowerCase()
      .match(/^class\s+([a-zA-Z0-9_]+)\s+implementation/);
    if (classImplMatch) {
      const className = classImplMatch[1].toUpperCase();
      this.pushScope(`${className}_IMPL`, 'class', lineNumber);
    }
  }

  private analyzeMethodDefinition(line: string, lineNumber: number): void {
    const methodMatch = line
      .toLowerCase()
      .match(/^(methods|class-methods)\s+([a-zA-Z0-9_]+)/);
    if (methodMatch) {
      const methodName = methodMatch[2].toUpperCase();
      const isStatic = methodMatch[1] === 'class-methods';

      this.addSymbol({
        name: methodName,
        type: 'method',
        scope: this.currentScope,
        line: lineNumber,
        column: 1,
        visibility: this.extractVisibility(line),
        description: isStatic ? 'Static method' : 'Instance method',
        parameters: this.extractMethodParameters(line),
      });
    }
  }

  private analyzeMethodImplementation(line: string, lineNumber: number): void {
    const methodImplMatch = line
      .toLowerCase()
      .match(/^method\s+([a-zA-Z0-9_~\->]+)/);
    if (methodImplMatch) {
      const methodName = methodImplMatch[1].toUpperCase();
      this.pushScope(methodName, 'method', lineNumber);
    }
  }

  private analyzeDataDeclaration(line: string, lineNumber: number): void {
    const dataMatches = [
      line.toLowerCase().match(/^data:?\s+([a-zA-Z0-9_]+)/),
      line.toLowerCase().match(/^class-data:?\s+([a-zA-Z0-9_]+)/),
      line.toLowerCase().match(/^statics:?\s+([a-zA-Z0-9_]+)/),
    ];

    for (const match of dataMatches) {
      if (match) {
        const varName = match[1].toUpperCase();
        this.addSymbol({
          name: varName,
          type: 'variable',
          scope: this.currentScope,
          line: lineNumber,
          column: 1,
          dataType: this.extractDataType(line),
          visibility: this.extractVisibility(line),
        });
        break;
      }
    }
  }

  private analyzeConstantsDeclaration(line: string, lineNumber: number): void {
    const constantMatch = line
      .toLowerCase()
      .match(/^constants:?\s+([a-zA-Z0-9_]+)/);
    if (constantMatch) {
      const constName = constantMatch[1].toUpperCase();
      this.addSymbol({
        name: constName,
        type: 'constant',
        scope: this.currentScope,
        line: lineNumber,
        column: 1,
        dataType: this.extractDataType(line),
        visibility: this.extractVisibility(line),
      });
    }
  }

  private analyzeTypesDeclaration(line: string, lineNumber: number): void {
    const typeMatch = line.toLowerCase().match(/^types:?\s+([a-zA-Z0-9_]+)/);
    if (typeMatch) {
      const typeName = typeMatch[1].toUpperCase();
      this.addSymbol({
        name: typeName,
        type: 'type',
        scope: this.currentScope,
        line: lineNumber,
        column: 1,
        dataType: this.extractDataType(line),
        visibility: this.extractVisibility(line),
      });
    }
  }

  private analyzeFormDefinition(line: string, lineNumber: number): void {
    const formMatch = line.toLowerCase().match(/^form\s+([a-zA-Z0-9_]+)/);
    if (formMatch) {
      const formName = formMatch[1].toUpperCase();
      this.addSymbol({
        name: formName,
        type: 'form',
        scope: this.currentScope,
        line: lineNumber,
        column: 1,
      });
      this.pushScope(formName, 'form', lineNumber);
    }
  }

  private analyzeFunctionDefinition(line: string, lineNumber: number): void {
    const functionMatch = line
      .toLowerCase()
      .match(/^function\s+([a-zA-Z0-9_]+)/);
    if (functionMatch) {
      const functionName = functionMatch[1].toUpperCase();
      this.addSymbol({
        name: functionName,
        type: 'function',
        scope: this.currentScope,
        line: lineNumber,
        column: 1,
      });
      this.pushScope(functionName, 'function', lineNumber);
    }
  }

  private analyzeIncludeStatement(line: string, lineNumber: number): void {
    const includeMatch = line
      .toLowerCase()
      .match(/^include\s+([a-zA-Z0-9_/<>]+)/);
    if (includeMatch) {
      const includeName = includeMatch[1].toUpperCase();
      this.dependencies.push(includeName);
      this.addSymbol({
        name: includeName,
        type: 'include',
        scope: this.currentScope,
        line: lineNumber,
        column: 1,
      });
    }
  }

  private analyzeInterfaceDefinition(line: string, lineNumber: number): void {
    const interfaceMatch = line
      .toLowerCase()
      .match(/^interface\s+([a-zA-Z0-9_]+)/);
    if (interfaceMatch) {
      const interfaceName = interfaceMatch[1].toUpperCase();
      this.addSymbol({
        name: interfaceName,
        type: 'interface',
        scope: this.currentScope,
        line: lineNumber,
        column: 1,
        visibility: this.extractVisibility(line),
      });
      this.pushScope(interfaceName, 'class', lineNumber);
    }
  }

  private analyzeScopeEnders(line: string, lineNumber: number): void {
    const lowerLine = line.toLowerCase();
    if (
      lowerLine.match(
        /^(endclass|endmethod|endform|endfunction|endinterface)\.?$/,
      )
    ) {
      this.popScope(lineNumber);
    }
  }

  private addSymbol(symbol: AbapSymbolInfo): void {
    this.symbols.push(symbol);
  }

  private pushScope(
    name: string,
    type: AbapScopeInfo['type'],
    startLine: number,
  ): void {
    const scope: AbapScopeInfo = {
      name,
      type,
      startLine,
      endLine: startLine,
      parent: this.currentScope !== 'global' ? this.currentScope : undefined,
    };

    this.scopes.push(scope);
    this.currentScope = name;
  }

  private popScope(endLine: number): void {
    const currentScopeInfo = this.scopes.find(
      (s) => s.name === this.currentScope,
    );
    if (currentScopeInfo) {
      currentScopeInfo.endLine = endLine;
    }

    const parentScope = this.scopes.find(
      (s) => s.name === currentScopeInfo?.parent,
    );
    this.currentScope = parentScope?.name || 'global';
  }

  private extractVisibility(line: string): 'public' | 'protected' | 'private' {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('private')) return 'private';
    if (lowerLine.includes('protected')) return 'protected';
    return 'public';
  }

  private extractDataType(line: string): string | undefined {
    const typeMatches = [
      line.toLowerCase().match(/type\s+([a-zA-Z0-9_]+)/),
      line.toLowerCase().match(/like\s+([a-zA-Z0-9_]+)/),
      line.toLowerCase().match(/type\s+ref\s+to\s+([a-zA-Z0-9_]+)/),
    ];

    for (const match of typeMatches) {
      if (match) {
        return match[1].toUpperCase();
      }
    }

    return undefined;
  }

  private extractMethodParameters(line: string): AbapParameterInfo[] {
    const parameters: AbapParameterInfo[] = [];
    const paramTypes = [
      'importing',
      'exporting',
      'changing',
      'returning',
    ] as const;

    for (const paramType of paramTypes) {
      const regex = new RegExp(`${paramType}\\s+([a-zA-Z0-9_\\s,]+)`, 'gi');
      const match = regex.exec(line);
      if (match) {
        const paramNames = match[1].split(',').map((p) => p.trim());
        for (const paramName of paramNames) {
          if (paramName) {
            parameters.push({
              name: paramName.toUpperCase(),
              type: paramType,
              optional: line.toLowerCase().includes('optional'),
            });
          }
        }
      }
    }

    return parameters;
  }
}

/**
 * A delegated read that failed: the read's error as it is, with the step —
 * this symbol's answer, beside the others'. A symbol that is not there
 * (`ExceptionResourceNotFound`) stays what it was: not found.
 */
function refusalOf(
  result: McpResult | undefined,
  step: string,
): FailureEntry | undefined {
  const payload = failedPayloadOf(result, step);
  if (payload === undefined) return;
  if (payload.adt_type === 'ExceptionResourceNotFound') return;
  // A credential failure is every symbol's: the call ends with the answer as
  // it came (`resolveSymbols` finds it by the entry).
  if (isCredentialPayload(payload) && result !== undefined)
    credentialAnswers.set(payload, result);
  return payload;
}

/** The delegated answers that were credential failures, by their entry. */
const credentialAnswers = new WeakMap<object, McpResult>();

/**
 * A throw while resolving a symbol: that symbol's failure in the shape of
 * every other — the carried error as it is, or `client_threw` — with the
 * step. A credential failure is every symbol's: rethrown as it came, so the
 * call ends with it and no further symbol is read.
 */
function threwAt(
  symbol: AbapSymbolInfo,
  thrown: unknown,
  step: string,
): AbapSymbolInfo {
  if (isCredentialFailure(thrown)) throw thrown;
  return { ...symbol, error: thrownEntry(thrown, step) };
}

/** How many symbols were asked, and how many the system resolved. */
type ResolutionStats = AbapSystemSymbolsResult['systemResolutionStats'];

/**
 * What resolving the symbols came to: each symbol and the counts, or the
 * credential failure's answer, as it came — the call ends with it.
 */
type Resolution =
  | { ended: McpResult }
  | {
      ended?: undefined;
      resolvedSymbols: AbapSymbolInfo[];
      stats: ResolutionStats;
    };

/** The counts of a resolution. */
function statsOf(
  total: number,
  resolvedCount: number,
  failedCount: number,
): ResolutionStats {
  return {
    totalSymbols: total,
    resolvedSymbols: resolvedCount,
    failedSymbols: failedCount,
    resolutionRate: `${((resolvedCount / total) * 100).toFixed(1)}%`,
  };
}

/** A function module, by its type code: what its search hit answers. */
const FUNCTION_MODULE: AdtCodes<'FUGR/FF'> = 'FUGR/FF';

/** The address of a function module's group, before the group's name. */
const FUNCTION_GROUPS = '/sap/bc/adt/functions/groups/';

/**
 * The function group a function module's address names: SAP answers a
 * module's search hit with `…/functions/groups/{group}/fmodules/{name}`, the
 * group URI-encoded in lower case (`%2f` for a namespace's `/`; measured on
 * premise and on ABAP cloud). `undefined` for any other address.
 */
function functionGroupOf(uri: string): string | undefined {
  if (!uri.startsWith(FUNCTION_GROUPS)) return undefined;
  const rest = uri.slice(FUNCTION_GROUPS.length);
  const end = rest.indexOf('/');
  if (end <= 0 || !rest.startsWith('/fmodules/', end)) return undefined;
  try {
    return decodeURIComponent(rest.slice(0, end)).toUpperCase();
  } catch {
    return undefined;
  }
}

/**
 * Where a function module symbol stands after its search: resolved already
 * (not found, or the search failed), or found in its group, with the hit.
 */
type FunctionLocation =
  | { resolved: AbapSymbolInfo }
  | { resolved?: undefined; group: string; hit: SearchHit };

/** A delegated read's text, parsed: `{}` when it is none or no JSON. */
function parsedText(item: { text: string }): unknown {
  if (!item.text) return {};
  try {
    return JSON.parse(item.text);
  } catch {
    // If parsing fails, use empty object
    return {};
  }
}

class AbapSystemSymbolResolver {
  public async resolveSymbols(
    context: HandlerContext,
    symbols: AbapSymbolInfo[],
  ): Promise<Resolution> {
    const resolvedSymbols: AbapSymbolInfo[] = [];
    let resolvedCount = 0;
    let failedCount = 0;

    for (const symbol of symbols) {
      try {
        const resolved = await this.resolveSymbol(context, symbol);
        const ended = resolved.error
          ? credentialAnswers.get(resolved.error)
          : undefined;
        if (ended !== undefined) return { ended };
        resolvedSymbols.push(resolved);
        if (resolved.systemInfo?.exists) {
          resolvedCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        resolvedSymbols.push(threwAt(symbol, error, 'resolve symbol'));
        failedCount++;
      }
    }

    return {
      resolvedSymbols,
      stats: statsOf(symbols.length, resolvedCount, failedCount),
    };
  }

  /**
   * `resolveSymbols` in ADT batch envelopes (spec §11): every symbol's first
   * read — a class's or an interface's source GET, a function module's
   * search; a local symbol sends none — recorded on one batch connection and
   * sent together; then, in a second envelope, the source GET of every
   * function module found, at the group its search named. Assembled as
   * `resolveSymbols` assembles them: the first credential failure in the
   * order of the symbols ends the call with its answer, and one in the first
   * envelope sends no second. Nothing is sent again.
   */
  public async resolveSymbolsInEnvelope(
    context: HandlerContext,
    symbols: AbapSymbolInfo[],
  ): Promise<Resolution> {
    const firsts = await runPhase(
      context,
      symbols,
      async (symbol, batch): Promise<FunctionLocation> => {
        const on = { ...context, connection: batch };
        if (symbol.type === 'function') {
          return this.locateFunctionSymbol(on, symbol);
        }
        return { resolved: await this.resolveSymbol(on, symbol) };
      },
    );
    const located: FunctionLocation[] = [];
    for (const [i, symbol] of symbols.entries()) {
      const result = firsts[i];
      if (result === undefined || !result.ok) {
        located.push({
          resolved: threwAt(symbol, result?.error, 'resolve symbol'),
        });
      } else {
        located.push(result.value);
      }
    }
    for (const step of located) {
      const ended = step.resolved?.error
        ? credentialAnswers.get(step.resolved.error)
        : undefined;
      if (ended !== undefined) return { ended };
    }

    const pending: Array<{
      at: number;
      symbol: AbapSymbolInfo;
      location: { group: string; hit: SearchHit };
    }> = [];
    for (const [at, step] of located.entries()) {
      const symbol = symbols[at];
      if (step.resolved === undefined && symbol !== undefined) {
        pending.push({ at, symbol, location: step });
      }
    }
    const reads =
      pending.length === 0
        ? []
        : await runPhase(context, pending, (item, batch) =>
            this.readFunctionSymbol(
              { ...context, connection: batch },
              item.symbol,
              item.location,
            ),
          );
    const readAt = new Map<number, AbapSymbolInfo>();
    for (const [j, item] of pending.entries()) {
      const result = reads[j];
      readAt.set(
        item.at,
        result !== undefined && result.ok
          ? result.value
          : threwAt(item.symbol, result?.error, 'resolve symbol'),
      );
    }

    const resolvedSymbols: AbapSymbolInfo[] = [];
    let resolvedCount = 0;
    let failedCount = 0;
    for (const [i, step] of located.entries()) {
      const resolved = step.resolved ?? readAt.get(i);
      if (resolved === undefined) continue;
      const ended = resolved.error
        ? credentialAnswers.get(resolved.error)
        : undefined;
      if (ended !== undefined) return { ended };
      resolvedSymbols.push(resolved);
      if (resolved.systemInfo?.exists) {
        resolvedCount++;
      } else {
        failedCount++;
      }
    }

    return {
      resolvedSymbols,
      stats: statsOf(symbols.length, resolvedCount, failedCount),
    };
  }

  private async resolveSymbol(
    context: HandlerContext,
    symbol: AbapSymbolInfo,
  ): Promise<AbapSymbolInfo> {
    try {
      switch (symbol.type) {
        case 'class':
          return await this.resolveClassSymbol(context, symbol);
        case 'function':
          return await this.resolveFunctionSymbol(context, symbol);
        case 'interface':
          return await this.resolveInterfaceSymbol(context, symbol);
        default:
          return await this.resolveGenericSymbol(context, symbol);
      }
    } catch (error) {
      return threwAt(symbol, error, 'resolve symbol');
    }
  }

  private async resolveClassSymbol(
    context: HandlerContext,
    symbol: AbapSymbolInfo,
  ): Promise<AbapSymbolInfo> {
    const { connection, logger } = context;
    try {
      const classInfo = await handleGetClass(context, {
        class_name: symbol.name,
      });
      const refused = refusalOf(classInfo, 'read class');
      if (refused) return { ...symbol, error: refused };
      if (
        !classInfo ||
        classInfo.isError ||
        !classInfo.content ||
        classInfo.content.length === 0
      ) {
        return {
          ...symbol,
          systemInfo: {
            exists: false,
            error: 'Class not found in SAP system',
          },
        };
      }
      const contentItem = classInfo.content[0];
      if (!contentItem) {
        return {
          ...symbol,
          systemInfo: {
            exists: false,
            error: 'Invalid response format from GetClass',
          },
        };
      }
      // Parse JSON from text field (handleGetClass returns text with JSON string)
      const classData = parsedText(contentItem);
      return {
        ...symbol,
        systemInfo: {
          exists: true,
          objectType: CLASS_SYMBOL,
          description:
            text(child(classData, 'description')) ||
            `ABAP Class ${symbol.name}`,
          package: text(child(classData, 'packageName')) || 'Unknown',
          superClass: text(child(classData, 'superclass')) || '',
        },
      };
    } catch (error) {
      return threwAt(symbol, error, 'read class');
    }
  }

  private async resolveFunctionSymbol(
    context: HandlerContext,
    symbol: AbapSymbolInfo,
  ): Promise<AbapSymbolInfo> {
    const location = await this.locateFunctionSymbol(context, symbol);
    if (location.resolved !== undefined) return location.resolved;
    return this.readFunctionSymbol(context, symbol, location);
  }

  /**
   * A function module's group: a repository search for the module (type
   * `FUNC`), its hit of the same name, and the group its address names.
   */
  private async locateFunctionSymbol(
    context: HandlerContext,
    symbol: AbapSymbolInfo,
  ): Promise<FunctionLocation> {
    const notFound = {
      resolved: {
        ...symbol,
        systemInfo: {
          exists: false,
          error: 'Function not found in SAP system',
        },
      },
    };
    try {
      const found = await handleSearchObject(context, {
        object_name: symbol.name,
        object_type: 'FUNC',
        maxResults: 10,
        detail: 'full',
      });
      const refused = refusalOf(found, 'search function module');
      if (refused) return { resolved: { ...symbol, error: refused } };
      const [item] = found.isError ? [] : found.content;
      if (item === undefined) return notFound;
      const hit = parseSearchHits(parsedText(item)).find(
        (each) =>
          each.type === FUNCTION_MODULE &&
          each.name.toUpperCase() === symbol.name,
      );
      const group =
        hit?.uri === undefined ? undefined : functionGroupOf(hit.uri);
      if (hit === undefined || group === undefined) return notFound;
      return { group, hit };
    } catch (error) {
      return { resolved: threwAt(symbol, error, 'search function module') };
    }
  }

  /** A function module read at the group its search found. */
  private async readFunctionSymbol(
    context: HandlerContext,
    symbol: AbapSymbolInfo,
    location: { group: string; hit: SearchHit },
  ): Promise<AbapSymbolInfo> {
    try {
      const functionInfo = await handleGetFunctionModule(context, {
        function_module_name: symbol.name,
        function_group_name: location.group,
      });
      const refused = refusalOf(functionInfo, 'read function module');
      if (refused) return { ...symbol, error: refused };
      if (functionInfo.isError || functionInfo.content.length === 0) {
        return {
          ...symbol,
          systemInfo: {
            exists: false,
            error: 'Function not found in SAP system',
          },
        };
      }
      return {
        ...symbol,
        systemInfo: {
          exists: true,
          objectType: 'FUNC',
          description:
            location.hit.description || `ABAP Function ${symbol.name}`,
          package: location.hit.packageName || 'Unknown',
          functionGroup: location.group,
        },
      };
    } catch (error) {
      return threwAt(symbol, error, 'read function module');
    }
  }

  private async resolveInterfaceSymbol(
    context: HandlerContext,
    symbol: AbapSymbolInfo,
  ): Promise<AbapSymbolInfo> {
    try {
      const interfaceInfo = await handleGetInterface(context, {
        interface_name: symbol.name,
      });

      const refused = refusalOf(interfaceInfo, 'read interface');
      if (refused) return { ...symbol, error: refused };
      if (
        !interfaceInfo ||
        interfaceInfo.isError ||
        !interfaceInfo.content ||
        interfaceInfo.content.length === 0
      ) {
        return {
          ...symbol,
          systemInfo: {
            exists: false,
            error: 'Interface not found in SAP system',
          },
        };
      }

      const contentItem = interfaceInfo.content[0];
      if (!contentItem) {
        return {
          ...symbol,
          systemInfo: {
            exists: false,
            error: 'Invalid response format from GetInterface',
          },
        };
      }
      // Parse JSON from text field (handleGetInterface returns text with JSON string)
      const interfaceData = parsedText(contentItem);
      return {
        ...symbol,
        systemInfo: {
          exists: true,
          objectType: INTERFACE_SYMBOL,
          description:
            text(child(interfaceData, 'description')) ||
            `ABAP Interface ${symbol.name}`,
          package: text(child(interfaceData, 'packageName')) || 'Unknown',
        },
      };
    } catch (error) {
      return threwAt(symbol, error, 'read interface');
    }
  }

  private async resolveGenericSymbol(
    _context: HandlerContext,
    symbol: AbapSymbolInfo,
  ): Promise<AbapSymbolInfo> {
    // For generic symbols, we don't have a specific handler
    // Return symbol with basic system info indicating it exists locally
    const systemInfo: AbapSystemInfo = {
      exists: false,
      objectType: 'LOCAL',
      description: `Local ${symbol.type} ${symbol.name}`,
      package: 'LOCAL',
      error: 'No system resolution available for this symbol type',
    };
    return { ...symbol, systemInfo };
  }
}

/** GetAbapSystemSymbols' arguments, as its schema parses them. */
type SystemSymbolsArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

async function systemSymbolsOneByOne(
  context: HandlerContext,
  args: SystemSymbolsArgs,
): Promise<McpResult | JsonAnswer> {
  const { logger } = context;
  try {
    if (!args?.code) {
      return return_error('ABAP code is required');
    }
    logger?.debug('Running semantic analysis and system symbol resolution');

    // First, perform semantic analysis
    const analyzer = new SimpleAbapSemanticAnalyzer();
    const semanticResult = analyzer.analyze(args.code);

    // Then, resolve symbols with SAP system information
    const resolver = new AbapSystemSymbolResolver();
    const resolution = await resolver.resolveSymbols(
      context,
      semanticResult.symbols,
    );
    if (resolution.ended !== undefined) return resolution.ended;
    const { resolvedSymbols, stats } = resolution;
    logger?.info(
      `Resolved ${stats.resolvedSymbols}/${stats.totalSymbols} symbols from system`,
    );

    const result: AbapSystemSymbolsResult = {
      symbols: resolvedSymbols,
      dependencies: semanticResult.dependencies,
      errors: semanticResult.errors,
      scopes: semanticResult.scopes,
      systemResolutionStats: stats,
    };

    const response: JsonAnswer = {
      isError: false,
      content: [
        {
          type: 'json',
          json: result,
        },
      ],
    };

    return response;
  } catch (error) {
    logger?.error('Failed to resolve ABAP system symbols', error);
    // A credential failure as the chain made it, a carried error as it is,
    // a throw of our own `client_threw` — never its message as bare text.
    return answerCaught(error, {
      tool: 'GetAbapSystemSymbols',
      detail: 'terse',
    });
  }
}

/**
 * The symbols resolved in one ADT batch envelope: the sequential version's
 * analysis and answer, its resolution `resolveSymbolsInEnvelope`.
 */
async function systemSymbolsInEnvelope(
  context: HandlerContext,
  args: SystemSymbolsArgs,
): Promise<McpResult | JsonAnswer> {
  const { logger } = context;
  logger?.debug('Running semantic analysis and system symbol resolution');

  const analyzer = new SimpleAbapSemanticAnalyzer();
  const semanticResult = analyzer.analyze(args.code);

  const resolver = new AbapSystemSymbolResolver();
  const resolution = await resolver.resolveSymbolsInEnvelope(
    context,
    semanticResult.symbols,
  );
  if (resolution.ended !== undefined) return resolution.ended;
  const { resolvedSymbols, stats } = resolution;
  logger?.info(
    `Resolved ${stats.resolvedSymbols}/${stats.totalSymbols} symbols from system`,
  );

  const result: AbapSystemSymbolsResult = {
    symbols: resolvedSymbols,
    dependencies: semanticResult.dependencies,
    errors: semanticResult.errors,
    scopes: semanticResult.scopes,
    systemResolutionStats: stats,
  };

  const response: JsonAnswer = {
    isError: false,
    content: [
      {
        type: 'json',
        json: result,
      },
    ],
  };
  return response;
}

export async function handleGetAbapSystemSymbols(
  context: HandlerContext,
  args: SystemSymbolsArgs,
) {
  if (!args?.code) return systemSymbolsOneByOne(context, args);
  try {
    return await withSequentialFallback<McpResult | JsonAnswer>(
      context,
      () => systemSymbolsInEnvelope(context, args),
      () => systemSymbolsOneByOne(context, args),
    );
  } catch (error) {
    context.logger?.error('Failed to resolve ABAP system symbols', error);
    return answerCaught(error, {
      tool: 'GetAbapSystemSymbols',
      detail: 'terse',
    });
  }
}
