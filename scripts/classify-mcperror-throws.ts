/**
 * Classify every `throw new McpError(...)` in src/ by the function that encloses it.
 *
 * Layer 3 of the tool-error-contract work converts these to `return return_error(...)`,
 * which is only valid when `return` leaves the tool handler itself. Inside a helper
 * with its own return contract the same edit turns an error into domain data —
 * e.g. parseTransportXml() feeding `{ success: true, ...transportData }`.
 *
 * Usage: npx tsx scripts/classify-mcperror-throws.ts [--json]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

interface Site {
  file: string;
  line: number;
  enclosing: string;
  kind: 'handler' | 'helper' | 'callback' | 'top-level';
  exported: boolean;
  returnsToolResult: boolean;
}

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walkFiles(full, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Local names bound to the SDK's McpError in this file, including aliases. */
function mcpErrorAliases(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  sf.forEachChild((node) => {
    if (!ts.isImportDeclaration(node)) return;
    // Deliberately not filtered by module specifier: McpError is re-exported
    // from src/lib/utils.ts:85, so most handlers import it from '../../lib/utils'.
    const bindings = node.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) {
        const original = (el.propertyName ?? el.name).text;
        if (original === 'McpError') names.add(el.name.text);
      }
    }
  });
  return names;
}

function describeEnclosing(node: ts.Node): {
  name: string;
  kind: Site['kind'];
  exported: boolean;
  fn?: ts.SignatureDeclaration;
} {
  let current: ts.Node | undefined = node.parent;
  let innermost: ts.Node | undefined;

  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current)
    ) {
      if (!innermost) innermost = current;

      // A named declaration is a real boundary; arrows/expressions may be callbacks.
      if (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) {
        const name = current.name?.getText() ?? '<anonymous>';
        const exported = !!current.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword,
        );
        const isCallback = innermost !== current;
        return {
          name,
          kind: isCallback ? 'callback' : exported ? 'handler' : 'helper',
          exported,
          fn: current,
        };
      }

      // Arrow assigned to an exported const counts as a handler boundary.
      const parent = current.parent;
      if (parent && ts.isVariableDeclaration(parent)) {
        const stmt = parent.parent?.parent;
        const exported =
          !!stmt &&
          ts.isVariableStatement(stmt) &&
          !!stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        const isCallback = innermost !== current;
        return {
          name: parent.name.getText(),
          kind: isCallback ? 'callback' : exported ? 'handler' : 'helper',
          exported,
          fn: current,
        };
      }
    }
    current = current.parent;
  }
  return { name: '<module>', kind: 'top-level', exported: false };
}

/** Heuristic: does the function's declared return type look like a tool result? */
function returnsToolResult(fn?: ts.SignatureDeclaration): boolean {
  if (!fn?.type) return false;
  const text = fn.type.getText();
  return /ToolResult|isError|content\s*:/.test(text);
}

function main() {
  const root = path.resolve(process.cwd(), 'src');
  const sites: Site[] = [];

  for (const file of walkFiles(root)) {
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('McpError')) continue;

    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const aliases = mcpErrorAliases(sf);
    if (aliases.size === 0) continue;

    const visit = (node: ts.Node) => {
      if (ts.isThrowStatement(node) && node.expression) {
        const expr = node.expression;
        if (ts.isNewExpression(expr) && ts.isIdentifier(expr.expression)) {
          if (aliases.has(expr.expression.text)) {
            const { name, kind, exported, fn } = describeEnclosing(node);
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
            sites.push({
              file: path.relative(process.cwd(), file),
              line: line + 1,
              enclosing: name,
              kind,
              exported,
              returnsToolResult: returnsToolResult(fn),
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(sites, null, 2));
    return;
  }

  const byKind = new Map<string, Site[]>();
  for (const s of sites) {
    const list = byKind.get(s.kind) ?? [];
    list.push(s);
    byKind.set(s.kind, list);
  }

  console.log(`Total throw-new-McpError sites: ${sites.length}\n`);
  for (const [kind, list] of [...byKind.entries()].sort()) {
    console.log(`--- ${kind}: ${list.length} ---`);
    const fns = new Map<string, number>();
    for (const s of list) {
      const key = `${s.file} :: ${s.enclosing}${s.returnsToolResult ? ' [returns ToolResult]' : ''}`;
      fns.set(key, (fns.get(key) ?? 0) + 1);
    }
    for (const [key, n] of [...fns.entries()].sort()) {
      console.log(`  ${n}x  ${key}`);
    }
    console.log();
  }
}

main();
