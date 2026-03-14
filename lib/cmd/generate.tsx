/*--------------------------------------------------------------------------

ConvexDoc

The MIT License (MIT)

Copyright (c) 2026 Jamal Lyons

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

---------------------------------------------------------------------------*/

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmdirSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { renderToStaticMarkup } from "react-dom/server";
import { x } from "tinyexec";
import ts from "typescript";
import typia from "typia";
import { IndexPage, ModulePage } from "../client/components.js";
import { TAILWIND_INPUT_CSS } from "../client/css.js";
import type { Customization } from "../config.js";
import { type ParsedFunctionSpec, Parser } from "../parser.js";
import { Command } from "./mod.js";

interface HttpRoute {
	method: string;
	path: string;
	handlerIdentifier?: string;
	handlerExpression?: string;
	sourceFile?: string;
}

export class GenerateCommand extends Command {
	public constructor(private readonly parser: Parser = new Parser()) {
		super();
	}

	public async run(
		spec: ParsedFunctionSpec,
		outputDir: string,
		projectDir: string,
		options?: {
			httpActionDeployUrl?: string;
			deploymentEnv?: "dev" | "prod";
			deploymentUrl?: string;
			customization?: Customization;
			/** When true, the function runner is disabled (manifest + static site). */
			disableFunctionRunner?: boolean;
			/**
			 * When true, the function runner UI will surface full error strings
			 * (including stack traces) instead of a compact summary.
			 */
			verboseErrorsInUi?: boolean;
		},
	): Promise<void> {
		const customization = options?.customization ?? {};
		this.resetOutputDir(outputDir);
		this.copyStaticAssets(outputDir);

		const { filteredSpec, moduleSlugs } = this.buildFilteredSpec(
			spec,
			customization,
		);

		// Build the React client runtime.
		await this.bundleClientApp(outputDir);

		const httpRoutes = await this.extractHttpRoutes(projectDir, spec);
		const buildInfo = this.buildBuildInfo(options);

		this.writeManifest(
			outputDir,
			filteredSpec,
			moduleSlugs,
			customization,
			buildInfo,
			httpRoutes,
		);

		this.renderHtmlPages(
			outputDir,
			projectDir,
			filteredSpec,
			moduleSlugs,
			customization,
			buildInfo,
		);

		await this.buildTailwindStyles(outputDir, customization);
	}

	private resetOutputDir(outputDir: string): void {
		if (existsSync(outputDir)) {
			rmSync(outputDir, { recursive: true });
		}
		mkdirSync(outputDir, { recursive: true });
	}

	private copyStaticAssets(outputDir: string): void {
		// Copy static assets (e.g. Convex logo) into docs output so header images work.
		try {
			const moduleDir = dirname(fileURLToPath(import.meta.url));
			// Support both source (lib/) and built (dist/) layouts by walking up and
			// looking for an assets/convex.png folder near the package root.
			let logoSource: string | null = null;
			let searchDir = moduleDir;
			for (let i = 0; i < 4; i += 1) {
				const candidate = resolve(searchDir, "assets/convex.png");
				if (existsSync(candidate)) {
					logoSource = candidate;
					break;
				}
				const parent = dirname(searchDir);
				if (parent === searchDir) break;
				searchDir = parent;
			}
			if (!logoSource) return;
			const assetsDir = join(outputDir, "assets");
			mkdirSync(assetsDir, { recursive: true });
			const logoTarget = join(assetsDir, "convex.png");
			rmSync(logoTarget, { force: true });
			writeFileSync(logoTarget, readFileSync(logoSource));
		} catch {
			// Best-effort; ignore asset copy failures.
		}
	}

	private buildFilteredSpec(
		spec: ParsedFunctionSpec,
		customization: Customization,
	): {
		filteredSpec: ParsedFunctionSpec;
		moduleSlugs: Map<string, string>;
	} {
		const filteredSpec = this.parser.filterByFunction(
			spec,
			customization.excludeFunctionTypes ?? [],
		);
		const moduleSlugs = this.buildModuleSlugs(filteredSpec);
		return { filteredSpec, moduleSlugs };
	}

	private buildBuildInfo(
		options: {
			httpActionDeployUrl?: string;
			deploymentEnv?: "dev" | "prod";
			deploymentUrl?: string;
			disableFunctionRunner?: boolean;
			verboseErrorsInUi?: boolean;
		} = {},
	): {
		generatedAt: string;
		defaultHttpActionDeployUrl: string;
		deploymentEnv: "dev" | "prod";
		deploymentUrl?: string;
		functionRunnerDisabled: boolean;
		verboseErrors: boolean;
	} {
		return {
			generatedAt: new Date().toISOString(),
			defaultHttpActionDeployUrl:
				options.httpActionDeployUrl ?? "http://localhost:3218",
			deploymentEnv: options.deploymentEnv ?? "dev",
			deploymentUrl: options.deploymentUrl,
			functionRunnerDisabled: options.disableFunctionRunner === true,
			verboseErrors: options.verboseErrorsInUi === true,
		};
	}

	/**
	 * Normalize validator-like objects so typia never sees undefined for array/record
	 * properties (avoids "Cannot read properties of undefined (reading 'map')").
	 */
	private normalizeValidatorForManifest(v: unknown): unknown {
		if (v == null || typeof v !== "object") return v;
		const o = v as Record<string, unknown>;
		const type = o.type as string | undefined;
		if (type === "union") {
			const members = Array.isArray(o.members) ? o.members : [];
			return {
				...o,
				members: members.map((m) => this.normalizeValidatorForManifest(m)),
			};
		}
		if (type === "object") {
			const fields = o.fields && typeof o.fields === "object" ? o.fields : {};
			const value = o.value && typeof o.value === "object" ? o.value : {};
			const normalizedFields: Record<string, unknown> = {};
			for (const [k, f] of Object.entries(fields)) {
				const field = f as Record<string, unknown>;
				if (field && typeof field.fieldType !== "undefined") {
					normalizedFields[k] = {
						...field,
						fieldType: this.normalizeValidatorForManifest(field.fieldType),
					};
				} else {
					normalizedFields[k] = field;
				}
			}
			const normalizedValue: Record<string, unknown> = {};
			for (const [k, f] of Object.entries(value)) {
				const field = f as Record<string, unknown>;
				if (field && typeof field.fieldType !== "undefined") {
					normalizedValue[k] = {
						...field,
						fieldType: this.normalizeValidatorForManifest(field.fieldType),
					};
				} else {
					normalizedValue[k] = field;
				}
			}
			return { ...o, fields: normalizedFields, value: normalizedValue };
		}
		if (type === "array" && typeof o.items !== "undefined") {
			return { ...o, items: this.normalizeValidatorForManifest(o.items) };
		}
		if (type === "record") {
			const keys = this.normalizeValidatorForManifest(o.keys);
			const values = o.values && typeof o.values === "object" ? o.values : {};
			const valuesOut = values as Record<string, unknown>;
			if (typeof valuesOut.fieldType !== "undefined") {
				return {
					...o,
					keys,
					values: {
						...valuesOut,
						fieldType: this.normalizeValidatorForManifest(valuesOut.fieldType),
					},
				};
			}
			return { ...o, keys, values: valuesOut };
		}
		return o;
	}

	/** Ensure customization has no undefined arrays/records so typia can stringify. */
	private normalizeCustomizationForManifest(
		customization: Customization,
	): Customization {
		const modules = customization.modules ?? {};
		const modulesNormalized: Record<
			string,
			{
				description?: string;
				functions?: Record<string, { description?: string }>;
			}
		> = {};
		for (const [name, mod] of Object.entries(modules)) {
			modulesNormalized[name] = {
				...(mod ?? {}),
				functions: mod?.functions ?? {},
			};
		}
		return {
			...customization,
			excludeFunctionTypes: customization.excludeFunctionTypes ?? [],
			modules: modulesNormalized,
		};
	}

	private writeManifest(
		outputDir: string,
		filteredSpec: ParsedFunctionSpec,
		moduleSlugs: Map<string, string>,
		customization: Customization,
		buildInfo: {
			generatedAt: string;
			defaultHttpActionDeployUrl: string;
			deploymentEnv: "dev" | "prod";
			deploymentUrl?: string;
			functionRunnerDisabled: boolean;
			verboseErrors: boolean;
		},
		httpRoutes: HttpRoute[],
	): void {
		const functions = filteredSpec.raw.map((fn) => {
			const moduleName = this.parser.getModuleName(fn.identifier);
			const moduleSlug =
				moduleSlugs.get(moduleName) ?? this.moduleToSlug(moduleName);
			const anchor = `fn-${fn.identifier.replace(/:/g, "-")}`;
			return {
				identifier: fn.identifier,
				name: this.parser.getFunctionName(fn.identifier),
				moduleName,
				moduleDisplayName: this.moduleDisplayName(moduleName),
				functionType: fn.functionType,
				visibility: fn.visibility?.kind ?? "public",
				args:
					fn.args != null ? this.normalizeValidatorForManifest(fn.args) : null,
				returns:
					fn.returns != null
						? this.normalizeValidatorForManifest(fn.returns)
						: null,
				httpMethod: fn.httpMethod ?? null,
				httpPath: fn.httpPath ?? null,
				href: `${moduleSlug}.html#${anchor}`,
			};
		});

		const manifest = {
			buildInfo,
			customization: this.normalizeCustomizationForManifest(customization),
			summary: filteredSpec.summary,
			modules: filteredSpec.modules.map((m) => ({
				name: m.name,
				displayName: this.moduleDisplayName(m.name),
				slug: moduleSlugs.get(m.name) ?? this.moduleToSlug(m.name),
				functionCount: m.functions.length,
			})),
			functions,
			httpRoutes,
		};
		writeFileSync(
			join(outputDir, "convexdoc.manifest.json"),
			typia.json.stringify(manifest),
			"utf-8",
		);
	}

	private renderHtmlPages(
		outputDir: string,
		projectDir: string,
		filteredSpec: ParsedFunctionSpec,
		moduleSlugs: Map<string, string>,
		customization: Customization,
		buildInfo: {
			generatedAt: string;
			defaultHttpActionDeployUrl: string;
			deploymentEnv: "dev" | "prod";
			deploymentUrl?: string;
			functionRunnerDisabled: boolean;
			verboseErrors: boolean;
		},
	): void {
		const baseHref = ""; // same dir as index

		// Index page: optional custom landing content from file
		const landingPageHtml = this.loadLandingPageContent(
			projectDir,
			customization.landingPage,
		);
		const indexHtml =
			"<!DOCTYPE html>\n" +
			renderToStaticMarkup(
				<IndexPage
					spec={filteredSpec}
					title="API Overview"
					baseHref={baseHref}
					nav={{ spec: filteredSpec, moduleSlugs }}
					buildInfo={buildInfo}
					customization={customization}
					landingPageHtml={landingPageHtml}
				/>,
			);
		writeFileSync(join(outputDir, "index.html"), indexHtml, "utf-8");

		// Per-module pages
		for (const mod of filteredSpec.modules) {
			const slug = moduleSlugs.get(mod.name) ?? this.moduleToSlug(mod.name);
			const filename = `${slug}.html`;
			const pageHtml =
				"<!DOCTYPE html>\n" +
				renderToStaticMarkup(
					<ModulePage
						module={mod}
						title={mod.name}
						baseHref={baseHref}
						nav={{
							spec: filteredSpec,
							moduleSlugs,
							activeModuleName: mod.name,
						}}
						buildInfo={buildInfo}
						customization={customization}
					/>,
				);
			writeFileSync(join(outputDir, filename), pageHtml, "utf-8");
		}
	}

	private async buildTailwindStyles(
		outputDir: string,
		customization: Customization,
	): Promise<void> {
		const require = createRequire(import.meta.url);

		// Tailwind: use a temp dir for config and input so only styles.css is written to outputDir
		const contentGlob = join(outputDir, "*.html")
			.replace(/\\/g, "/")
			.replace(/"/g, '\\"');
		const jsContent = join(outputDir, "app.js")
			.replace(/\\/g, "/")
			.replace(/"/g, '\\"');
		const tmpId = `convexdoc-tailwind-${Date.now()}`;
		const tmpDir = join(tmpdir(), tmpId);
		mkdirSync(tmpDir, { recursive: true });

		const tailwindConfigPath = join(tmpDir, "tailwind.config.cjs");
		const inputCssPath = join(tmpDir, "input.css");
		const outputCssPath = join(outputDir, "styles.css");

		const tailwindConfig = `/** @type {import('tailwindcss').Config} */
   module.exports = {
     content: ["${contentGlob}", "${jsContent}"],
     theme: { extend: {} },
     plugins: [],
   };
   `;
		writeFileSync(tailwindConfigPath, tailwindConfig, "utf-8");
		writeFileSync(
			inputCssPath,
			`${TAILWIND_INPUT_CSS}\n${this.buildAccentCss(customization)}`,
			"utf-8",
		);

		try {
			// Use npx so Tailwind’s CLI entry point is resolved by the package; avoids
			// depending on tailwindcss/lib/cli.js across major versions.
			const tailwindPkg = require.resolve("tailwindcss/package.json");
			const packageRoot = dirname(dirname(tailwindPkg));
			await x(
				"npx",
				[
					"tailwindcss@3.4.17",
					"-i",
					inputCssPath,
					"-o",
					outputCssPath,
					"-c",
					tailwindConfigPath,
					"--minify",
				],
				{
					nodeOptions: { cwd: packageRoot },
				},
			);
		} finally {
			try {
				unlinkSync(tailwindConfigPath);
				unlinkSync(inputCssPath);
				rmdirSync(tmpDir);
			} catch {
				// ignore cleanup errors
			}
		}
	}

	private async extractHttpRoutes(
		projectDir: string,
		spec: ParsedFunctionSpec,
	): Promise<HttpRoute[]> {
		const convexDir = join(projectDir, "convex");
		let files: string[] = [];
		try {
			files = this.listTsFiles(convexDir);
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
			const localIdentifierMap = new Map<string, string>();
			for (const stmt of sf.statements) {
				if (!ts.isImportDeclaration(stmt)) continue;
				if (!stmt.importClause || !stmt.moduleSpecifier) continue;
				if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
				const source = stmt.moduleSpecifier.text;
				if (!source.startsWith(".")) continue;
				const fromModule = this.moduleNameFromConvexFile(
					convexDir,
					join(dirname(file), source).replace(/\\/g, "/"),
				);

				if (
					stmt.importClause.namedBindings &&
					ts.isNamedImports(stmt.importClause.namedBindings)
				) {
					for (const specifier of stmt.importClause.namedBindings.elements) {
						const localName = specifier.name.text;
						const importedName = specifier.propertyName?.text ?? localName;
						localIdentifierMap.set(localName, `${fromModule}:${importedName}`);
					}
				}
			}

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
								if (key === "path") path = this.tryStringLiteral(p.initializer);
								if (key === "method")
									method = this.tryStringLiteral(p.initializer);
								if (key === "handler") handlerExpr = p.initializer;
							}

							if (path && method) {
								const handlerExpression = handlerExpr
									? this.handlerExpressionToString(handlerExpr)
									: undefined;

								// We can only confidently map to a Convex identifier when handler is a
								// simple identifier from a module file and matches the function spec.
								let handlerIdentifier: string | undefined;
								if (handlerExpr && ts.isIdentifier(handlerExpr)) {
									const moduleName = this.moduleNameFromConvexFile(
										convexDir,
										file,
									);
									const candidate = `${moduleName}:${handlerExpr.text}`;
									if (spec.byIdentifier.has(candidate)) {
										handlerIdentifier = candidate;
									} else {
										const imported = localIdentifierMap.get(handlerExpr.text);
										if (imported && spec.byIdentifier.has(imported)) {
											handlerIdentifier = imported;
										}
									}
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

	private listTsFiles(dir: string): string[] {
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
				out.push(...this.listTsFiles(full));
				continue;
			}
			if (!st.isFile()) continue;
			if (!ent.endsWith(".ts")) continue;
			if (ent.endsWith(".d.ts")) continue;
			out.push(full);
		}
		return out;
	}

	private moduleNameFromConvexFile(
		convexDir: string,
		filePath: string,
	): string {
		const rel = relative(convexDir, filePath);
		const noExt = rel.replace(/\.ts$/i, "");
		return noExt.split(sep).join("/");
	}

	private tryStringLiteral(expr: ts.Expression | undefined): string | null {
		if (!expr) return null;
		if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
			return expr.text;
		}
		return null;
	}

	private handlerExpressionToString(expr: ts.Expression): string {
		if (ts.isIdentifier(expr)) return expr.text;
		if (ts.isPropertyAccessExpression(expr)) return expr.getText();
		if (ts.isCallExpression(expr)) return expr.expression.getText();
		return expr.getText();
	}

	private moduleDisplayName(name: string): string {
		if (name === "http") return "built-in: http";
		if (name === "(root)") return "root";
		if (name === "unresolved") return "unresolved";
		return name;
	}

	private hexToRgb(value: string): { r: number; g: number; b: number } | null {
		const raw = value.trim().replace(/^#/, "");
		const normalized =
			raw.length === 3
				? raw
						.split("")
						.map((ch) => `${ch}${ch}`)
						.join("")
				: raw;
		if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
		const int = Number.parseInt(normalized, 16);
		return {
			r: (int >> 16) & 255,
			g: (int >> 8) & 255,
			b: int & 255,
		};
	}

	private rgbToHex(rgb: { r: number; g: number; b: number }): string {
		const toHex = (n: number) => n.toString(16).padStart(2, "0");
		return `#${toHex(this.clampByte(rgb.r))}${toHex(this.clampByte(rgb.g))}${toHex(this.clampByte(rgb.b))}`;
	}

	private mixRgb(
		base: { r: number; g: number; b: number },
		target: { r: number; g: number; b: number },
		weight: number,
	): { r: number; g: number; b: number } {
		const w = Math.max(0, Math.min(1, weight));
		return {
			r: Math.round(base.r * (1 - w) + target.r * w),
			g: Math.round(base.g * (1 - w) + target.g * w),
			b: Math.round(base.b * (1 - w) + target.b * w),
		};
	}

	private clampByte(n: number): number {
		return Math.max(0, Math.min(255, Math.round(n)));
	}

	/**
	 * Load and parse landing page content from a file path (relative to projectDir).
	 * Returns HTML string for .md (via marked) or plaintext (escaped, wrapped in a div). Returns null if file missing or path empty.
	 */
	private loadLandingPageContent(
		projectDir: string,
		filePath: string | undefined,
	): string | null {
		if (!filePath?.trim()) return null;
		const resolved = resolve(projectDir, filePath.trim());
		if (!existsSync(resolved)) return null;
		let raw: string;
		try {
			raw = readFileSync(resolved, "utf-8");
		} catch {
			return null;
		}
		const ext = resolved.toLowerCase().slice(resolved.lastIndexOf("."));
		if (ext === ".md" || ext === ".markdown") {
			return marked.parse(raw) as string;
		}
		// Plaintext: escape HTML and wrap in a single pre/div for display
		const escaped = raw
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
		return `<div class="convexdoc-prose"><pre class="whitespace-pre-wrap text-sm" style="color: var(--phoenix-text-muted);">${escaped}</pre></div>`;
	}

	private async bundleClientApp(outputDir: string): Promise<void> {
		const moduleDir = dirname(fileURLToPath(import.meta.url));
		const tsxEntry = resolve(moduleDir, "../client/client-app.tsx");
		const jsEntry = resolve(moduleDir, "../client/client-app.js");
		const entry = existsSync(tsxEntry) ? tsxEntry : jsEntry;
		const output = join(outputDir, "app.js");

		await x("npx", [
			"--yes",
			"esbuild@0.25.10",
			entry,
			"--bundle",
			"--minify",
			"--platform=browser",
			"--format=esm",
			"--target=es2020",
			`--outfile=${output}`,
		]);
	}

	/** Slug for module name to safe filename (no path separators, no special chars). */
	private moduleToSlug(name: string): string {
		if (name === "(root)") return "root";
		return name.replace(/\//g, "_").replace(/[^a-zA-Z0-9_-]/g, "_") || "module";
	}

	/**
	 * Build module slug map. Index page uses "index" for linking to self; module pages use their slug.
	 */
	private buildModuleSlugs(spec: ParsedFunctionSpec): Map<string, string> {
		const map = new Map<string, string>();
		for (const mod of spec.modules) {
			map.set(mod.name, this.moduleToSlug(mod.name));
		}
		return map;
	}

	private buildAccentCss(customization: Customization | undefined): string {
		const accent = customization?.theme?.accent?.trim();
		if (!accent) return "";

		const parsed = this.hexToRgb(accent);
		if (!parsed) {
			return `
  :root {
    --phoenix-red-zone: ${accent};
    --phoenix-red-zone-hover: ${accent};
    --phoenix-red-zone-glow: ${accent};
    --phoenix-red-zone-gradient-start: ${accent};
    --phoenix-red-zone-gradient-end: ${accent};
    --phoenix-red-zone-active-start: ${accent};
    --phoenix-red-zone-active-end: ${accent};
  }
  `;
		}

		const hover = this.rgbToHex(
			this.mixRgb(parsed, { r: 0, g: 0, b: 0 }, 0.16),
		);
		const glow = `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, 0.35)`;
		const gradientStart = this.rgbToHex(
			this.mixRgb(parsed, { r: 255, g: 148, b: 60 }, 0.2),
		);
		const activeStart = this.rgbToHex(
			this.mixRgb(parsed, { r: 255, g: 255, b: 255 }, 0.1),
		);

		return `
  :root {
    --phoenix-red-zone: ${accent};
    --phoenix-red-zone-hover: ${hover};
    --phoenix-red-zone-glow: ${glow};
    --phoenix-red-zone-gradient-start: ${gradientStart};
    --phoenix-red-zone-gradient-end: ${accent};
    --phoenix-red-zone-active-start: ${activeStart};
    --phoenix-red-zone-active-end: ${accent};
  }
  `;
	}
}
