/**
 * Generates static HTML docs from a parsed Convex function spec.
 * Output: convex/docs/ with index.html, one page per module, bundled app.js,
 * styles.css, and convexdoc.manifest.json.
 */

import {
	existsSync,
	mkdirSync,
	rmdirSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { renderToStaticMarkup } from "react-dom/server";
import { extractJsDocs } from "./jsdoc.js";
import type { ConvexFunctionSpec, ParsedFunctionSpec } from "./function-spec.js";
import { extractHttpRoutes } from "./http-routes.js";
import { IndexPage, ModulePage } from "./pages.js";
import { formatValidator, getFunctionName, getModuleName } from "./parser.js";

const TAILWIND_INPUT_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;

/* ConvexDoc base */
html { font-family: Sora, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
code, pre, kbd, samp { font-family: 'JetBrains Mono', 'Fira Code', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
dialog::backdrop { background: rgba(0,0,0,0.7); }

/**
 * Phoenix Macro UI theme: Zinc + Red Zone (https://github.com/JamalLyons/phoenix-macro)
 * Glossy, polished (Apple-like) with glass and gradients.
 */
:root {
  --phoenix-zinc-50: #fafafa;
  --phoenix-zinc-100: #f4f4f5;
  --phoenix-zinc-200: #e4e4e7;
  --phoenix-zinc-300: #d4d4d8;
  --phoenix-zinc-400: #a1a1aa;
  --phoenix-zinc-500: #71717a;
  --phoenix-zinc-600: #52525b;
  --phoenix-zinc-700: #3f3f46;
  --phoenix-zinc-800: #27272a;
  --phoenix-zinc-900: #18181b;
  --phoenix-zinc-950: #09090b;
  --phoenix-red-zone: #ef4444;
  --phoenix-red-zone-hover: #dc2626;
  --phoenix-red-zone-glow: rgba(239, 68, 68, 0.35);
  --phoenix-red-zone-gradient-start: #ea580c;
  --phoenix-red-zone-gradient-end: #dc2626;
  --phoenix-red-zone-active-start: #f97316;
  --phoenix-red-zone-active-end: #ef4444;
  --phoenix-glass-bg: rgba(39, 39, 42, 0.65);
  --phoenix-glass-border: rgba(255, 255, 255, 0.08);
  --phoenix-glass-highlight: rgba(255, 255, 255, 0.05);
  --phoenix-glass-blur: 12px;
  --phoenix-app-bg: var(--phoenix-zinc-950);
  --phoenix-app-surface: var(--phoenix-zinc-900);
  --phoenix-text: var(--phoenix-zinc-50);
  --phoenix-text-muted: var(--phoenix-zinc-400);
  --phoenix-text-dim: var(--phoenix-zinc-500);
  --phoenix-success: #22c55e;
  --phoenix-error: var(--phoenix-red-zone);
  --phoenix-border: rgba(255,255,255,0.12);
  --phoenix-border-strong: rgba(255,255,255,0.2);
  --phoenix-input-bg: rgba(255,255,255,0.06);
  --phoenix-hover-surface: rgba(255,255,255,0.06);
}
.phoenix-glass {
  background: var(--phoenix-glass-bg);
  backdrop-filter: blur(var(--phoenix-glass-blur));
  -webkit-backdrop-filter: blur(var(--phoenix-glass-blur));
  border: 1px solid var(--phoenix-glass-border);
  box-shadow: 0 1px 0 0 var(--phoenix-glass-highlight) inset, 0 2px 8px -2px rgba(0,0,0,0.4);
}
.phoenix-btn-primary {
  background: linear-gradient(180deg, var(--phoenix-red-zone-active-start) 0%, var(--phoenix-red-zone-gradient-start) 40%, var(--phoenix-red-zone-gradient-end) 100%);
  color: white;
  border: 1px solid rgba(255,255,255,0.15);
  box-shadow: 0 1px 0 0 rgba(255,255,255,0.2) inset, 0 2px 8px -2px var(--phoenix-red-zone-glow);
  font-weight: 700;
}
.phoenix-btn-primary:hover:not(:disabled) {
  background: linear-gradient(180deg, #fb923c 0%, var(--phoenix-red-zone-active-start) 40%, var(--phoenix-red-zone-hover) 100%);
  box-shadow: 0 1px 0 0 rgba(255,255,255,0.25) inset, 0 4px 12px -2px var(--phoenix-red-zone-glow);
}
.phoenix-btn-ghost {
  background: var(--phoenix-glass-bg);
  color: var(--phoenix-text-muted);
  border: 1px solid var(--phoenix-glass-border);
}
.phoenix-btn-ghost:hover:not(:disabled) {
  background: var(--phoenix-zinc-700);
  color: var(--phoenix-text);
}

:root.light {
  --phoenix-glass-bg: rgba(250, 250, 250, 0.75);
  --phoenix-glass-border: rgba(0, 0, 0, 0.08);
  --phoenix-glass-highlight: rgba(255, 255, 255, 0.8);
  --phoenix-app-bg: #fafafa;
  --phoenix-app-surface: #ffffff;
  --phoenix-text: #09090b;
  --phoenix-text-muted: #52525b;
  --phoenix-text-dim: #71717a;
  --phoenix-border: rgba(9, 9, 11, 0.14);
  --phoenix-border-strong: rgba(9, 9, 11, 0.2);
  --phoenix-input-bg: rgba(9, 9, 11, 0.03);
  --phoenix-hover-surface: rgba(9, 9, 11, 0.06);
}
.light .bg-black\\/30,
.light .bg-black\\/35,
.light .bg-black\\/50 {
  background-color: rgba(9, 9, 11, 0.05) !important;
}
.light .ring-white\\/10,
.light .ring-white\\/15,
.light .ring-white\\/20 {
  --tw-ring-color: rgba(9, 9, 11, 0.12) !important;
}
.light .text-slate-200 { color: #1f2937 !important; }
.light .text-slate-300 { color: #374151 !important; }
.light .text-slate-400 { color: #4b5563 !important; }
.light .text-white { color: #111827 !important; }
.convexdoc-input {
  background: var(--phoenix-input-bg);
  color: var(--phoenix-text);
  border: 1px solid var(--phoenix-border);
}
.convexdoc-input:focus {
  outline: none;
  border-color: var(--phoenix-red-zone);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--phoenix-red-zone) 25%, transparent);
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up {
  animation: fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.toast-enter {
  animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.syntax-string { color: #10b981; }
.syntax-number { color: #f59e0b; }
.syntax-boolean { color: #3b82f6; }
.syntax-null { color: #ef4444; }
.syntax-key { color: #8b5cf6; font-weight: 500; }
:root.light .syntax-string { color: #059669; }
:root.light .syntax-number { color: #d97706; }
:root.light .syntax-boolean { color: #2563eb; }
:root.light .syntax-null { color: #dc2626; }
:root.light .syntax-key { color: #7c3aed; }
`;

/** Slug for module name to safe filename (no path separators, no special chars). */
export function moduleToSlug(name: string): string {
	if (name === "(root)") return "root";
	return name.replace(/\//g, "_").replace(/[^a-zA-Z0-9_-]/g, "_") || "module";
}

function moduleDisplayName(name: string): string {
	if (name === "http") return "built-in: http";
	if (name === "(root)") return "root";
	if (name === "unresolved") return "unresolved";
	return name;
}

/**
 * Build module slug map. Index page uses "index" for linking to self; module pages use their slug.
 */
export function buildModuleSlugs(
	spec: ParsedFunctionSpec,
): Map<string, string> {
	const map = new Map<string, string>();
	for (const mod of spec.modules) {
		map.set(mod.name, moduleToSlug(mod.name));
	}
	return map;
}

function formatArgs(fn: ConvexFunctionSpec): string {
	if (!fn.args) return "// no arguments required";
	const fmt = formatValidator(fn.args);
	return fmt === "{}" ? "{ }  // empty object" : fmt;
}

function formatReturns(fn: ConvexFunctionSpec): string {
	if (!fn.returns) return "// no return validator";
	const fmt = formatValidator(fn.returns);
	return fmt === "{}" ? "{ }  // empty object" : fmt;
}

async function bundleClientApp(outputDir: string): Promise<void> {
	const moduleDir = dirname(fileURLToPath(import.meta.url));
	const tsxEntry = join(moduleDir, "client-app.tsx");
	const jsEntry = join(moduleDir, "client-app.js");
	const entry = existsSync(tsxEntry) ? tsxEntry : jsEntry;
	const output = join(outputDir, "app.js");

	await execa("npx", [
		"--yes",
		"esbuild@0.25.10",
		entry,
		"--bundle",
		"--platform=browser",
		"--format=esm",
		"--target=es2020",
		`--outfile=${output}`,
	]);
}

/**
 * Generate static HTML and CSS into outputDir (e.g. project/docs).
 * Ensures outputDir exists, writes index.html + one HTML file per module, then runs Tailwind.
 */
export async function generateDocs(
	spec: ParsedFunctionSpec,
	outputDir: string,
	projectDir: string,
	options?: {
		httpActionDeployUrl?: string;
		deploymentEnv?: "dev" | "prod";
		deploymentUrl?: string;
	},
): Promise<void> {
	if (existsSync(outputDir)) {
		rmSync(outputDir, { recursive: true });
	}
	mkdirSync(outputDir, { recursive: true });

	const baseHref = ""; // same dir as index
	const moduleSlugs = buildModuleSlugs(spec);

	// Build the React client runtime.
	await bundleClientApp(outputDir);

	// JSDoc enrichment (best-effort)
	const docsByIdentifier = await extractJsDocs(projectDir, spec);
	const httpRoutes = await extractHttpRoutes(projectDir, spec);

	const buildInfo = {
		generatedAt: new Date().toISOString(),
		defaultHttpActionDeployUrl:
			options?.httpActionDeployUrl ?? "http://localhost:3218",
		deploymentEnv: options?.deploymentEnv ?? "dev",
		deploymentUrl: options?.deploymentUrl,
	};

	// Write manifest scaffold (HTTP routes merged later)
	const functions = spec.raw.map((fn) => {
		const moduleName = getModuleName(fn.identifier);
		const moduleSlug = moduleSlugs.get(moduleName) ?? moduleToSlug(moduleName);
		const anchor = `fn-${fn.identifier.replace(/:/g, "-")}`;
		return {
			identifier: fn.identifier,
			name: getFunctionName(fn.identifier),
			moduleName,
			moduleDisplayName: moduleDisplayName(moduleName),
			functionType: fn.functionType,
			visibility: fn.visibility?.kind ?? "public",
			args: fn.args ?? null,
			returns: fn.returns ?? null,
			httpMethod: fn.httpMethod ?? null,
			httpPath: fn.httpPath ?? null,
			href: `${moduleSlug}.html#${anchor}`,
		};
	});

	const manifest = {
		buildInfo,
		summary: spec.summary,
		modules: spec.modules.map((m) => ({
			name: m.name,
			displayName: moduleDisplayName(m.name),
			slug: moduleSlugs.get(m.name) ?? moduleToSlug(m.name),
			functionCount: m.functions.length,
		})),
		functions,
		docsByIdentifier,
		httpRoutes,
	};
	writeFileSync(
		join(outputDir, "convexdoc.manifest.json"),
		JSON.stringify(manifest, null, 2),
		"utf-8",
	);

	// Index page
	const indexHtml =
		"<!DOCTYPE html>\n" +
		renderToStaticMarkup(
			<IndexPage
				spec={spec}
				title="API Overview"
				baseHref={baseHref}
				nav={{ spec, moduleSlugs }}
				buildInfo={buildInfo}
			/>,
		);
	writeFileSync(join(outputDir, "index.html"), indexHtml, "utf-8");

	// Per-module pages
	for (const mod of spec.modules) {
		const slug = moduleSlugs.get(mod.name) ?? moduleToSlug(mod.name);
		const filename = `${slug}.html`;
		const pageHtml =
			"<!DOCTYPE html>\n" +
			renderToStaticMarkup(
				<ModulePage
					module={mod}
					formatArgs={formatArgs}
					formatReturns={formatReturns}
					title={mod.name}
					baseHref={baseHref}
					nav={{ spec, moduleSlugs, activeModuleName: mod.name }}
					buildInfo={buildInfo}
				/>,
			);
		writeFileSync(join(outputDir, filename), pageHtml, "utf-8");
	}

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
	writeFileSync(inputCssPath, TAILWIND_INPUT_CSS, "utf-8");

	try {
		await execa(
			"npx",
			[
				"--yes",
				"tailwindcss@3",
				"-i",
				inputCssPath,
				"-o",
				outputCssPath,
				"-c",
				tailwindConfigPath,
			],
			{ env: { ...process.env } },
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
