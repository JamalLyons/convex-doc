import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import type { ParsedFunctionSpec } from "./function-spec.js";

export interface HttpRoute {
	method: string;
	path: string;
	handlerIdentifier?: string;
	handlerExpression?: string;
	sourceFile?: string;
}

function listTsFiles(dir: string): string[] {
	const out: string[] = [];
	for (const ent of readdirSync(dir)) {
		if (ent === "node_modules" || ent === "dist" || ent === ".git") continue;
		const full = join(dir, ent);
		let st: ReturnType<typeof statSync>;
		try {
			st = statSync(full);
		} catch {
			continue;
		}
		if (st.isDirectory()) {
			out.push(...listTsFiles(full));
			continue;
		}
		if (!st.isFile()) continue;
		if (!ent.endsWith(".ts")) continue;
		if (ent.endsWith(".d.ts")) continue;
		out.push(full);
	}
	return out;
}

function moduleNameFromConvexFile(convexDir: string, filePath: string): string {
	const rel = relative(convexDir, filePath);
	const noExt = rel.replace(/\.ts$/i, "");
	return noExt.split(sep).join("/");
}

function tryStringLiteral(expr: ts.Expression | undefined): string | null {
	if (!expr) return null;
	if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
		return expr.text;
	}
	return null;
}

function handlerExpressionToString(expr: ts.Expression): string {
	if (ts.isIdentifier(expr)) return expr.text;
	if (ts.isPropertyAccessExpression(expr)) return expr.getText();
	if (ts.isCallExpression(expr)) return expr.expression.getText();
	return expr.getText();
}

/**
 * Best-effort HTTP route extraction from `convex/http.ts` (and any `convex/` TS files with `http` in the name).
 * Looks for `.route({ path, method, handler })` calls.
 */
export async function extractHttpRoutes(
	projectDir: string,
	spec: ParsedFunctionSpec,
): Promise<HttpRoute[]> {
	const convexDir = join(projectDir, "convex");
	let files: string[] = [];
	try {
		files = listTsFiles(convexDir);
	} catch {
		return [];
	}

	const routeFiles = files.filter((f) => {
		const rel = relative(convexDir, f).toLowerCase();
		return (
			rel === "http.ts" || rel.endsWith("/http.ts") || rel.includes("http")
		);
	});

	const routes: HttpRoute[] = [];

	for (const file of routeFiles) {
		let sourceText = "";
		try {
			sourceText = readFileSync(file, "utf-8");
		} catch {
			continue;
		}
		const sf = ts.createSourceFile(
			file,
			sourceText,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		);

		const visit = (node: ts.Node) => {
			if (
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression)
			) {
				const prop = node.expression.name.text;
				if (prop === "route" && node.arguments.length >= 1) {
					const arg0 = node.arguments[0];
					if (ts.isObjectLiteralExpression(arg0)) {
						let path: string | null = null;
						let method: string | null = null;
						let handlerExpr: ts.Expression | null = null;

						for (const p of arg0.properties) {
							if (!ts.isPropertyAssignment(p)) continue;
							const key = ts.isIdentifier(p.name)
								? p.name.text
								: ts.isStringLiteral(p.name)
									? p.name.text
									: null;
							if (!key) continue;
							if (key === "path") path = tryStringLiteral(p.initializer);
							if (key === "method") method = tryStringLiteral(p.initializer);
							if (key === "handler") handlerExpr = p.initializer;
						}

						if (path && method) {
							const handlerExpression = handlerExpr
								? handlerExpressionToString(handlerExpr)
								: undefined;

							// We can only confidently map to a Convex identifier when handler is a
							// simple identifier from a module file and matches the function spec.
							let handlerIdentifier: string | undefined;
							if (handlerExpr && ts.isIdentifier(handlerExpr)) {
								const moduleName = moduleNameFromConvexFile(convexDir, file);
								const candidate = `${moduleName}:${handlerExpr.text}`;
								if (spec.byIdentifier.has(candidate))
									handlerIdentifier = candidate;
							}

							routes.push({
								method,
								path,
								handlerIdentifier,
								handlerExpression,
								sourceFile: relative(projectDir, file).split(sep).join("/"),
							});
						}
					}
				}
			}
			ts.forEachChild(node, visit);
		};

		visit(sf);
	}

	// Dedupe (method+path)
	const seen = new Set<string>();
	const deduped: HttpRoute[] = [];
	for (const r of routes) {
		const k = `${r.method} ${r.path}`;
		if (seen.has(k)) continue;
		seen.add(k);
		deduped.push(r);
	}
	return deduped;
}
