/**
 * Generates static HTML docs from a parsed Convex function spec.
 * Output: convex/docs/ with index.html, one page per module, and Tailwind CSS.
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
import { join } from "node:path";
import { execa } from "execa";
import { jsxToString } from "jsx-async-runtime";
import type {
	ConvexFunctionSpec,
	ParsedFunctionSpec,
} from "./function-spec.js";
import { IndexPage, ModulePage } from "./pages.js";
import { formatValidator } from "./parser.js";

const TAILWIND_INPUT_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

/** Slug for module name to safe filename (no path separators, no special chars). */
export function moduleToSlug(name: string): string {
	if (name === "(root)") return "root";
	return name.replace(/\//g, "_").replace(/[^a-zA-Z0-9_-]/g, "_") || "module";
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
	if (!fn.args) return "none";
	return formatValidator(fn.args);
}

function formatReturns(fn: ConvexFunctionSpec): string {
	if (!fn.returns) return "none";
	return formatValidator(fn.returns);
}

/**
 * Generate static HTML and CSS into outputDir (e.g. project/convex/docs).
 * Ensures outputDir exists, writes index.html + one HTML file per module, then runs Tailwind.
 */
export async function generateDocs(
	spec: ParsedFunctionSpec,
	outputDir: string,
): Promise<void> {
	if (existsSync(outputDir)) {
		rmSync(outputDir, { recursive: true });
	}
	mkdirSync(outputDir, { recursive: true });

	const baseHref = ""; // same dir as index
	const moduleSlugs = buildModuleSlugs(spec);

	// Index page
	const indexHtml = await jsxToString.call(
		{},
		<IndexPage
			spec={spec}
			moduleSlugs={moduleSlugs}
			title="API Overview"
			baseHref={baseHref}
		/>,
	);
	writeFileSync(join(outputDir, "index.html"), indexHtml, "utf-8");

	// Per-module pages
	for (const mod of spec.modules) {
		const slug = moduleSlugs.get(mod.name) ?? moduleToSlug(mod.name);
		const filename = `${slug}.html`;
		const pageHtml = await jsxToString.call(
			{},
			<ModulePage
				module={mod}
				formatArgs={formatArgs}
				formatReturns={formatReturns}
				title={mod.name}
				baseHref={baseHref}
			/>,
		);
		writeFileSync(join(outputDir, filename), pageHtml, "utf-8");
	}

	// Tailwind: use a temp dir for config and input so only styles.css is written to outputDir
	const contentGlob = join(outputDir, "*.html")
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
  content: ["${contentGlob}"],
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
				"tailwindcss",
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
