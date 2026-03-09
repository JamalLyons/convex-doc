#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { execa } from "execa";
import ora from "ora";
import type { FunctionSpecOutput } from "./function-spec.js";
import { generateDocs } from "./generate.js";
import {
	formatValidator,
	getFunctionName,
	parseFunctionSpec,
} from "./parser.js";
import { fetchFunctionSpec } from "./spec-runner.js";

const program = new Command();

program
	.name("convexdoc")
	.description(
		"Documentation generator and interactive tester for Convex deployments",
	)
	.version("0.1.0");

// ─── `spec` command ───────────────────────────────────────────────────────────
program
	.command("spec")
	.description(
		"Fetch and display the function spec from your Convex deployment",
	)
	.option(
		"-p, --project-dir <path>",
		"Path to your Convex project root",
		process.cwd(),
	)
	.option("-o, --output <file>", "Write raw spec JSON to a file")
	.option("--json", "Output raw JSON instead of formatted display")
	.action(async (opts) => {
		const spinner = ora("Fetching function spec from Convex...").start();

		let rawSpec: FunctionSpecOutput;
		try {
			rawSpec = await fetchFunctionSpec({
				projectDir: resolve(opts.projectDir),
			});
			spinner.succeed("Function spec fetched successfully");
		} catch (err: unknown) {
			spinner.fail("Failed to fetch function spec");
			console.error(chalk.red((err as Error).message));
			process.exit(1);
		}

		// Write raw JSON to file if requested
		if (opts.output) {
			const outPath = resolve(opts.output);
			writeFileSync(outPath, JSON.stringify(rawSpec, null, 2));
			console.log(chalk.green(`\n✓ Raw spec written to ${outPath}`));
		}

		if (opts.json) {
			console.log(JSON.stringify(rawSpec, null, 2));
			return;
		}

		// Pretty-print the parsed spec
		const parsed = parseFunctionSpec(rawSpec);
		printParsedSpec(parsed);
	});

// ─── `generate` command ──────────────────────────────────────────────────────
program
	.command("generate")
	.description("Generate static HTML documentation into convex/docs")
	.option(
		"-p, --project-dir <path>",
		"Path to your Convex project root",
		process.cwd(),
	)
	.action(async (opts) => {
		const projectDir = resolve(opts.projectDir);
		const spinner = ora("Fetching function spec...").start();

		let rawSpec: FunctionSpecOutput;
		try {
			rawSpec = await fetchFunctionSpec({ projectDir });
			spinner.succeed("Function spec fetched");
		} catch (err: unknown) {
			spinner.fail("Failed to fetch function spec");
			console.error(chalk.red((err as Error).message));
			process.exit(1);
		}

		const parsed = parseFunctionSpec(rawSpec);
		if (parsed.summary.total === 0) {
			console.log(
				chalk.yellow(
					"No functions found. Push your Convex functions first (e.g. npx convex dev), then run generate again.",
				),
			);
			process.exit(0);
		}

		spinner.start("Generating docs...");
		const outputDir = join(projectDir, "convex", "docs");
		try {
			await generateDocs(parsed, outputDir);
			spinner.succeed(`Docs written to ${outputDir}`);
		} catch (err: unknown) {
			spinner.fail("Generate failed");
			console.error(chalk.red((err as Error).message));
			process.exit(1);
		}
	});

// ─── `serve` command ──────────────────────────────────────────────────────────
program
	.command("serve")
	.description("Serve the generated docs site locally")
	.option(
		"-p, --project-dir <path>",
		"Path to your Convex project root",
		process.cwd(),
	)
	.option("-P, --port <number>", "Port to listen on", "3000")
	.action(async (opts) => {
		const projectDir = resolve(opts.projectDir);
		const docsDir = join(projectDir, "convex", "docs");

		if (!existsSync(docsDir)) {
			console.error(
				chalk.red(
					`No docs folder at ${docsDir}. Run \`convexdoc generate\` first.`,
				),
			);
			process.exit(1);
		}

		if (!existsSync(join(docsDir, "index.html"))) {
			console.error(
				chalk.red(
					`No index.html in ${docsDir}. Run \`convexdoc generate\` first.`,
				),
			);
			process.exit(1);
		}

		const port = String(opts.port);
		const url = `http://localhost:${port}`;
		console.log(chalk.green(`Serving docs at ${chalk.bold(url)}`));
		console.log(chalk.dim("Press Ctrl+C to stop.\n"));

		await execa("npx", ["--yes", "serve", docsDir, "-l", port], {
			cwd: projectDir,
			stdio: "inherit",
		});
	});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function printParsedSpec(parsed: ReturnType<typeof parseFunctionSpec>) {
	const { summary, modules } = parsed;

	console.log();
	console.log(
		chalk.bold.cyan("━━━ ConvexDoc Function Spec ━━━━━━━━━━━━━━━━━━━━━━━━━━━━"),
	);
	console.log();

	// Summary table
	console.log(chalk.bold("Summary"));
	console.log(`  ${chalk.white("Total")}      ${chalk.yellow(summary.total)}`);
	console.log(
		`  ${chalk.blue("Queries")}    ${chalk.yellow(summary.queries)}   ` +
			`${chalk.green("Mutations")}  ${chalk.yellow(summary.mutations)}   ` +
			`${chalk.magenta("Actions")}    ${chalk.yellow(summary.actions)}`,
	);
	if (summary.httpActions > 0) {
		console.log(
			`  ${chalk.cyan("HTTP Actions")} ${chalk.yellow(summary.httpActions)}`,
		);
	}
	console.log(
		`  ${chalk.gray("Public")}     ${chalk.yellow(summary.public)}   ` +
			`${chalk.gray("Internal")}   ${chalk.yellow(summary.internal)}`,
	);

	if (summary.total === 0) {
		console.log();
		console.log(
			chalk.yellow(
				"No functions found on this deployment. Push your Convex functions first:",
			),
		);
		console.log(
			chalk.dim("  npx convex dev   (dev) or  npx convex deploy  (prod)"),
		);
		console.log(
			chalk.dim(
				"  Run from your project root (or use --project-dir). Then run convexdoc spec again.",
			),
		);
	}

	console.log();

	// Per-module breakdown
	for (const mod of modules) {
		console.log(chalk.bold.white(`📦 ${mod.name}`));

		for (const fn of mod.functions) {
			const fnName = getFunctionName(fn.identifier);
			const typeLabel = fnTypeLabel(fn.functionType);
			const visLabel =
				fn.visibility.kind === "internal" ? chalk.gray(" [internal]") : "";

			console.log(`   ${typeLabel} ${chalk.white(fnName)}${visLabel}`);

			if (fn.args) {
				console.log(
					`      ${chalk.dim("args:")}    ${chalk.gray(formatValidator(fn.args))}`,
				);
			} else {
				console.log(`      ${chalk.dim("args:")}    ${chalk.gray("none")}`);
			}

			if (fn.returns) {
				console.log(
					`      ${chalk.dim("returns:")} ${chalk.gray(formatValidator(fn.returns))}`,
				);
			}
		}

		console.log();
	}

	if (summary.total > 0) {
		console.log(
			chalk.dim("Run `convexdoc generate` to build your documentation site."),
		);
	}
	console.log();
}

function fnTypeLabel(type: string): string {
	switch (type) {
		case "query":
			return chalk.blue("Q");
		case "mutation":
			return chalk.green("M");
		case "action":
			return chalk.magenta("A");
		case "httpAction":
			return chalk.cyan("H");
		default:
			return chalk.gray("?");
	}
}

program.parse();
