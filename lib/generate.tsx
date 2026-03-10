/**
 * Generates static HTML docs from a parsed Convex function spec.
 * Output: convex/docs/ with index.html, one page per module, bundled app.js,
 * styles.css, and convexdoc.manifest.json.
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmdirSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { marked } from "marked";
import { renderToStaticMarkup } from "react-dom/server";
import type { ConvexDocCustomization } from "./config.js";
import type {
	ConvexFunctionSpec,
	ParsedFunctionSpec,
} from "./function-spec.js";
import { extractHttpRoutes } from "./http-routes.js";
import { extractJsDocs } from "./jsdoc.js";
import { IndexPage, ModulePage } from "./pages.js";
import {
	filterSpecByFunctionTypes,
	formatValidator,
	getFunctionName,
	getModuleName,
} from "./parser.js";

const TAILWIND_INPUT_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;

/* ConvexDoc base */
html {
  font-family: Sora, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
  -webkit-text-size-adjust: 100%;
  scroll-behavior: smooth;
}
body { overflow-x: hidden; }
code, pre, kbd, samp { font-family: 'JetBrains Mono', 'Fira Code', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
dialog::backdrop { background: rgba(0,0,0,0.7); }

/* Theme scrollbars */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--phoenix-zinc-600) var(--phoenix-zinc-900);
}
*::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
*::-webkit-scrollbar-track {
  background: var(--phoenix-zinc-900);
}
*::-webkit-scrollbar-thumb {
  background: var(--phoenix-zinc-600);
  border-radius: 4px;
  border: 2px solid var(--phoenix-zinc-900);
}
*::-webkit-scrollbar-thumb:hover {
  background: var(--phoenix-zinc-500);
}
*::-webkit-scrollbar-corner {
  background: var(--phoenix-zinc-900);
}

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

/* Landing page markdown / prose */
.convexdoc-prose { color: var(--phoenix-text); }
.convexdoc-prose h1 { font-family: Sora, sans-serif; font-size: 1.875rem; font-weight: 600; margin-bottom: 0.5rem; }
.convexdoc-prose h2 { font-family: Sora, sans-serif; font-size: 1.125rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; color: var(--phoenix-text); }
.convexdoc-prose h3 { font-size: 1rem; font-weight: 600; margin-top: 1rem; margin-bottom: 0.25rem; }
.convexdoc-prose p { margin-bottom: 0.75rem; color: var(--phoenix-text-muted); line-height: 1.6; }
.convexdoc-prose p:last-child { margin-bottom: 0; }
.convexdoc-prose ul, .convexdoc-prose ol { margin: 0.5rem 0 0.75rem 1.25rem; color: var(--phoenix-text-muted); }
.convexdoc-prose li { margin-bottom: 0.25rem; }
.convexdoc-prose a { color: var(--phoenix-red-zone); text-decoration: none; }
.convexdoc-prose a:hover { text-decoration: underline; }
.convexdoc-prose code { font-family: ui-monospace, monospace; font-size: 0.875em; padding: 0.15em 0.4em; border-radius: 0.25rem; background: var(--phoenix-app-surface); color: var(--phoenix-text); }
.convexdoc-prose pre { margin: 0.75rem 0; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; background: var(--phoenix-app-surface); border: 1px solid var(--phoenix-border); }
.convexdoc-prose pre code { padding: 0; background: none; }
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

function buildAccentCss(
	customization: ConvexDocCustomization | undefined,
): string {
	const accent = customization?.theme?.accent?.trim();
	if (!accent) return "";

	const parsed = hexToRgb(accent);
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

	const hover = rgbToHex(mixRgb(parsed, { r: 0, g: 0, b: 0 }, 0.16));
	const glow = `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, 0.35)`;
	const gradientStart = rgbToHex(
		mixRgb(parsed, { r: 255, g: 148, b: 60 }, 0.2),
	);
	const activeStart = rgbToHex(mixRgb(parsed, { r: 255, g: 255, b: 255 }, 0.1));

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

function hexToRgb(value: string): { r: number; g: number; b: number } | null {
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

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
	const toHex = (n: number) => n.toString(16).padStart(2, "0");
	return `#${toHex(clampByte(rgb.r))}${toHex(clampByte(rgb.g))}${toHex(clampByte(rgb.b))}`;
}

function mixRgb(
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

function clampByte(n: number): number {
	return Math.max(0, Math.min(255, Math.round(n)));
}

/**
 * Load and parse landing page content from a file path (relative to projectDir).
 * Returns HTML string for .md (via marked) or plaintext (escaped, wrapped in a div). Returns null if file missing or path empty.
 */
function loadLandingPageContent(
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
		customization?: ConvexDocCustomization;
		/** When true, the function runner is disabled (manifest + static site). */
		disableFunctionRunner?: boolean;
	},
): Promise<void> {
	if (existsSync(outputDir)) {
		rmSync(outputDir, { recursive: true });
	}
	mkdirSync(outputDir, { recursive: true });

	const baseHref = ""; // same dir as index
	const customization = options?.customization ?? {};
	const filteredSpec = filterSpecByFunctionTypes(
		spec,
		customization.excludeFunctionTypes ?? [],
	);
	const moduleSlugs = buildModuleSlugs(filteredSpec);

	// Build the React client runtime.
	await bundleClientApp(outputDir);

	// JSDoc enrichment (best-effort; uses full spec for lookup)
	const docsByIdentifier = await extractJsDocs(projectDir, spec);
	const httpRoutes = await extractHttpRoutes(projectDir, spec);

	const buildInfo = {
		generatedAt: new Date().toISOString(),
		defaultHttpActionDeployUrl:
			options?.httpActionDeployUrl ?? "http://localhost:3218",
		deploymentEnv: options?.deploymentEnv ?? "dev",
		deploymentUrl: options?.deploymentUrl,
		functionRunnerDisabled: options?.disableFunctionRunner === true,
	};

	// Write manifest scaffold (HTTP routes merged later)
	const functions = filteredSpec.raw.map((fn) => {
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
		customization,
		summary: filteredSpec.summary,
		modules: filteredSpec.modules.map((m) => ({
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

	// Index page: optional custom landing content from file
	const landingPageHtml = loadLandingPageContent(
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
					nav={{ spec: filteredSpec, moduleSlugs, activeModuleName: mod.name }}
					buildInfo={buildInfo}
					customization={customization}
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
	writeFileSync(
		inputCssPath,
		`${TAILWIND_INPUT_CSS}\n${buildAccentCss(customization)}`,
		"utf-8",
	);

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
				"--minify",
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
