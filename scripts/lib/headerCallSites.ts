import ts from 'typescript';
import { compilerOptions } from './analyseOmissions';

/**
 * Every call of a member that takes a header pair (`options.headers:
 * IAdtHeaders`, adt-clients 36) goes through `withAdtHeaders`: the pair it
 * passes is the `headers` parameter of the function `withAdtHeaders` was
 * handed, and the operation `withAdtHeaders` was given names that member.
 *
 * A header-taking call is found by its resolved signature, not by its name:
 * a parameter whose type has a `headers` property of type `IAdtHeaders` —
 * adt-clients' members and every structural interface over them alike.
 *
 * Reported: a pair passed any other way (a literal pair, a constant, a
 * spread the source cannot show), a call outside `withAdtHeaders`, and an
 * operation naming another member. `inspected` counts the header-taking
 * calls seen.
 */
export function headerCallSites(files: string[]): {
  offenders: string[];
  inspected: number;
} {
  const program = ts.createProgram(files, compilerOptions());
  const checker = program.getTypeChecker();
  const offenders: string[] = [];
  let inspected = 0;
  for (const file of files) {
    const source = program.getSourceFile(file);
    if (source === undefined) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const at = headersParameter(node, checker);
        if (at !== undefined) {
          inspected += 1;
          const problem = problemOf(node, at, checker);
          if (problem !== undefined) {
            offenders.push(
              `${file}:${lineOf(source, node)} — ${node.expression.getText()} — ${problem}`,
            );
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { offenders, inspected };
}

/** The index of the call's parameter whose type carries `headers: IAdtHeaders`. */
function headersParameter(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
): number | undefined {
  const signature = checker.getResolvedSignature(call);
  if (signature === undefined) return undefined;
  const parameters = signature.getParameters();
  for (let i = 0; i < parameters.length; i += 1) {
    const parameter = parameters[i];
    if (parameter === undefined) continue;
    const type = checker.getNonNullableType(
      checker.getTypeOfSymbolAtLocation(parameter, call),
    );
    const headers = type.getProperty('headers');
    if (headers === undefined) continue;
    const headersType = checker.getTypeOfSymbolAtLocation(headers, call);
    const name = (headersType.aliasSymbol ?? headersType.getSymbol())?.getName();
    if (name === 'IAdtHeaders') return i;
  }
  return undefined;
}

function problemOf(
  call: ts.CallExpression,
  at: number,
  checker: ts.TypeChecker,
): string | undefined {
  const options = call.arguments[at];
  if (options === undefined || !ts.isObjectLiteralExpression(options)) {
    return 'its options are not an object literal naming `headers`';
  }
  // Read right to left: the last writer of `headers` wins, so a spread after
  // the property may replace it and one before it cannot.
  let value: ts.Expression | undefined;
  for (let i = options.properties.length - 1; i >= 0; i -= 1) {
    const property = options.properties[i];
    if (property === undefined) continue;
    if (ts.isSpreadAssignment(property)) {
      return 'a spread after its `headers`: the pair is not provable from the source';
    }
    if (property.name?.getText() !== 'headers') continue;
    if (ts.isShorthandPropertyAssignment(property)) value = property.name;
    else if (ts.isPropertyAssignment(property)) value = property.initializer;
    break;
  }
  if (value === undefined) return 'no `headers` in its options';
  if (!ts.isIdentifier(value)) {
    return 'its `headers` is not the pair `withAdtHeaders` hands it';
  }
  const symbol = ts.isShorthandPropertyAssignment(value.parent)
    ? checker.getShorthandAssignmentValueSymbol(value.parent)
    : checker.getSymbolAtLocation(value);
  const declaration = symbol?.declarations?.[0];
  if (declaration === undefined || !ts.isParameter(declaration)) {
    return 'its `headers` is not the pair `withAdtHeaders` hands it';
  }
  const callback = declaration.parent;
  const wrapper = callback.parent;
  if (
    !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) ||
    wrapper === undefined ||
    !ts.isCallExpression(wrapper) ||
    !ts.isIdentifier(wrapper.expression) ||
    wrapper.expression.text !== 'withAdtHeaders' ||
    wrapper.arguments[2] !== callback ||
    callback.parameters[0] !== declaration
  ) {
    return 'its `headers` is not the pair `withAdtHeaders` hands it';
  }
  const member = memberName(call);
  const named = operationMember(wrapper.arguments[1]);
  if (member !== undefined && named !== undefined && named !== member) {
    return `\`withAdtHeaders\` names the operation of \`${named}\`, the call is \`${member}\``;
  }
  return undefined;
}

/** The member a call reaches: `x.member(…)`. */
function memberName(call: ts.CallExpression): string | undefined {
  return ts.isPropertyAccessExpression(call.expression)
    ? call.expression.name.text
    : undefined;
}

/**
 * The member an operation names: `'<object>.<member>'`, or
 * `adtOperation(object, '<member>')`; `undefined` when not literal.
 */
function operationMember(
  operation: ts.Expression | undefined,
): string | undefined {
  if (operation === undefined) return undefined;
  if (ts.isStringLiteral(operation)) {
    const dot = operation.text.lastIndexOf('.');
    return dot < 0 ? undefined : operation.text.slice(dot + 1);
  }
  if (
    ts.isCallExpression(operation) &&
    ts.isIdentifier(operation.expression) &&
    operation.expression.text === 'adtOperation'
  ) {
    const member = operation.arguments[1];
    return member !== undefined && ts.isStringLiteral(member)
      ? member.text
      : undefined;
  }
  return undefined;
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
}
