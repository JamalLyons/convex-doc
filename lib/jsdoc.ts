import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import type { ParsedFunctionSpec } from "./function-spec.js";

export interface ExtractedJsDoc {
	summary?: string;
	detailsMarkdown?: string;
	examples?: string[];
	deprecated?: boolean;
	tags?: string[];
}

function listTsFiles(dir: string): string[] {
	const out: string[] = [];
	for (const ent of readdirSync(dir)) {
		// skip common build/output folders
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

function isExported(node: ts.Node): boolean {
	if (!ts.canHaveModifiers(node)) return false;
	const mods = ts.getModifiers(node);
	return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function calledName(expr: ts.Expression): string | null {
	if (!ts.isCallExpression(expr)) return null;
	const callee = expr.expression;
	if (ts.isIdentifier(callee)) return callee.text;
	if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
	return null;
}

function getJSDocText(node: ts.Node): {
	summary?: string;
	detailsMarkdown?: string;
	examples: string[];
	deprecated: boolean;
	tags: string[];
} {
	const jsDocs = ts
		.getJSDocCommentsAndTags(node)
		.filter((n): n is ts.JSDoc => ts.isJSDoc(n));

	let fullComment = "";
	const examples: string[] = [];
	let deprecated = false;
	const tags: string[] = [];

	for (const doc of jsDocs) {
		if (typeof doc.comment === "string") {
			fullComment = String(doc.comment);
		}
		for (const tag of doc.tags ?? []) {
			const tagName = tag.tagName.getText();
			if (tagName === "deprecated") deprecated = true;
			if (tagName === "example") {
				const c = (tag.comment ?? "").toString();
				if (c.trim()) examples.push(c.trim());
			}
			if (tagName === "tag" || tagName === "tags") {
				const c = (tag.comment ?? "").toString();
				for (const t of c.split(/[,\n]/g)) {
					const trimmed = t.trim();
					if (trimmed) tags.push(trimmed);
				}
			}
		}
	}

	const lines = fullComment
		.split(/\r?\n/g)
		.map((l) => l.trim())
		.filter(Boolean);
	const summary = lines[0];
	const detailsMarkdown =
		lines.length > 1 ? lines.slice(1).join("\n") : undefined;

	return {
		summary,
		detailsMarkdown,
		examples,
		deprecated,
		tags,
	};
}

function moduleNameFromConvexFile(convexDir: string, filePath: string): string {
	const rel = relative(convexDir, filePath);
	const noExt = rel.replace(/\.ts$/i, "");
	// normalize to forward slashes for identifiers
	return noExt.split(sep).join("/");
}

/**
 * Best-effort JSDoc extraction for Convex function bindings in `convex/` TS files.
 *
 * Matches the common Convex patterns:
 * - `export const list = query(...)`
 * - `export const create = mutation(...)`
 * - `export const doThing = action(...)`
 * - `export const handler = httpAction(...)`
 */
export async function extractJsDocs(
	projectDir: string,
	spec: ParsedFunctionSpec,
): Promise<Record<string, ExtractedJsDoc>> {
	const convexDir = join(projectDir, "convex");
	let files: string[] = [];
	try {
		files = listTsFiles(convexDir);
	} catch {
		return {};
	}

	const out: Record<string, ExtractedJsDoc> = {};

	for (const file of files) {
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
		const moduleName = moduleNameFromConvexFile(convexDir, file);

		const visit = (node: ts.Node) => {
			// export const foo = query(...)
			if (ts.isVariableStatement(node) && isExported(node)) {
				for (const decl of node.declarationList.declarations) {
					if (!ts.isIdentifier(decl.name)) continue;
					const exportName = decl.name.text;
					const init = decl.initializer;
					if (!init) continue;
					const callee = calledName(init);
					if (!callee) continue;
					if (
						callee !== "query" &&
						callee !== "mutation" &&
						callee !== "action" &&
						callee !== "httpAction" &&
						callee !== "internalQuery" &&
						callee !== "internalMutation" &&
						callee !== "internalAction"
					) {
						continue;
					}

					const identifier = `${moduleName}:${exportName}`;
					if (!spec.byIdentifier.has(identifier)) continue;

					const doc = getJSDocText(decl) ?? getJSDocText(node);
					if (
						!doc.summary &&
						!doc.detailsMarkdown &&
						!doc.examples.length &&
						!doc.deprecated &&
						!doc.tags.length
					) {
						continue;
					}
					out[identifier] = {
						summary: doc.summary,
						detailsMarkdown: doc.detailsMarkdown,
						examples: doc.examples.length ? doc.examples : undefined,
						deprecated: doc.deprecated || undefined,
						tags: doc.tags.length ? doc.tags : undefined,
					};
				}
			}

			ts.forEachChild(node, visit);
		};

		visit(sf);
	}

	return out;
}
