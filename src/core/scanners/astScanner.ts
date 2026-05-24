import { readFile } from 'fs/promises';
import { extname } from 'node:path';
import ts from 'typescript';

export interface FunctionInfo {
  name: string;
  filePath: string;
  line: number;
  normalizedBody: string;
}

const SCRIPT_KINDS: Record<string, ts.ScriptKind> = {
  '.ts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX,
  '.js': ts.ScriptKind.JS,
  '.jsx': ts.ScriptKind.JSX
};

function getScriptKind(filePath: string): ts.ScriptKind {
  return SCRIPT_KINDS[extname(filePath).toLowerCase()] ?? ts.ScriptKind.JS;
}

function resolveFunctionName(node: ts.Node): string {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return node.name.text;
  }

  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }

  if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    const parent = node.parent;

    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }

    if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }

    if (ts.isPropertyAssignment(parent) && ts.isStringLiteral(parent.name)) {
      return parent.name.text;
    }

    if (ts.isBinaryExpression(parent) && ts.isPropertyAccessExpression(parent.left)) {
      return parent.left.name.text;
    }
  }

  return 'anonymous';
}

function normalizeFunctionBody(node: ts.Node, sourceFile: ts.SourceFile): string {
  const identifierMap = new Map<string, string>();
  let identifierCounter = 0;

  function getIdentifierPlaceholder(text: string): string {
    if (!identifierMap.has(text)) {
      identifierMap.set(text, `__id${++identifierCounter}`);
    }
    return identifierMap.get(text)!;
  }

  function isPreservedIdentifier(child: ts.Identifier): boolean {
    const parent = child.parent;
    return (
      (ts.isPropertyAccessExpression(parent) && parent.name === child) ||
      (ts.isPropertyAssignment(parent) && parent.name === child) ||
      (ts.isShorthandPropertyAssignment(parent) && parent.name === child) ||
      (ts.isPropertySignature(parent) && parent.name === child) ||
      (ts.isMethodDeclaration(parent) && parent.name === child) ||
      (ts.isMethodSignature(parent) && parent.name === child) ||
      ts.isQualifiedName(parent)
    );
  }

  const transformer = (context: ts.TransformationContext) => {
    const visitor = (child: ts.Node): ts.VisitResult<ts.Node> => {
      if (ts.isIdentifier(child)) {
        if (isPreservedIdentifier(child)) {
          return child;
        }
        return ts.factory.createIdentifier(getIdentifierPlaceholder(child.text));
      }

      if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) {
        return ts.factory.createStringLiteral('__str');
      }

      if (ts.isNumericLiteral(child)) {
        return ts.factory.createNumericLiteral('0');
      }

      if (ts.isBigIntLiteral(child)) {
        return ts.factory.createBigIntLiteral('0n');
      }

      if (ts.isRegularExpressionLiteral(child)) {
        return ts.factory.createRegularExpressionLiteral('/_/');
      }

      if (ts.isTemplateExpression(child)) {
        return ts.factory.createStringLiteral('__template');
      }

      return ts.visitEachChild(child, visitor, context);
    };

    return (root: ts.Node) => ts.visitNode(root, visitor);
  };

  const transformed = ts.transform(node, [transformer]);
  const printer = ts.createPrinter({ removeComments: true });
  const result = printer.printNode(ts.EmitHint.Unspecified, transformed.transformed[0], sourceFile);
  transformed.dispose();
  return result.replace(/\s+/g, '');
}

/**
 * Parses a JS/TS file using the TypeScript Compiler API and extracts its functions.
 */
export async function extractFunctions(filePath: string): Promise<FunctionInfo[]> {
  const functions: FunctionInfo[] = [];

  try {
    const content = await readFile(filePath, 'utf-8');
    const scriptKind = getScriptKind(filePath);

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind
    );

    const parseDiagnostics = (sourceFile as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics;

    if (parseDiagnostics && parseDiagnostics.length > 0) {
      const diagnostics = parseDiagnostics
        .map((diagnostic: ts.Diagnostic) => diagnostic.messageText.toString())
        .join('; ');
      console.warn(`Warning: ${filePath} has parse issues; function extraction will continue: ${diagnostics}`);
    }

    function visitor(node: ts.Node) {
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node)
      ) {
        const name = resolveFunctionName(node);

        if (node.body) {
          const normalizedBody = normalizeFunctionBody(node.body, sourceFile);
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

          if (normalizedBody.length > 16) {
            functions.push({
              name,
              filePath,
              line: line + 1,
              normalizedBody
            });
          }
        }
      }

      ts.forEachChild(node, visitor);
    }

    visitor(sourceFile);
  } catch (error) {
    console.warn(`Failed to extract functions from ${filePath}: ${error}`);
  }

  return functions;
}

/**
 * Clusters matching structural functions together to pinpoint identical duplicates.
 */
export function findDuplicates(allFunctions: FunctionInfo[]): FunctionInfo[][] {
  const clusters: { [key: string]: FunctionInfo[] } = {};

  for (const fn of allFunctions) {
    const key = fn.normalizedBody;
    clusters[key] = clusters[key] ?? [];
    clusters[key].push(fn);
  }

  return Object.values(clusters)
    .filter((cluster) => cluster.length > 1)
    .sort((a, b) => b.length - a.length);
}
