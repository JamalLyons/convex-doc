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

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Command as CliBuilder } from "commander";
import picocolors from "picocolors";
import { Spinner } from "picospinner";
import typia from "typia";
import { ExportCommand } from "./cmd/export.js";
import { GenerateCommand } from "./cmd/generate.js";
import { InitCommand } from "./cmd/init.js";
import { SpecCommand } from "./cmd/spec.js";
import { CliConfig, type ConfigOptions } from "./config.js";
import { Parser } from "./parser.js";
import { DocsServer } from "./server.js";
import type { FunctionSpecOutput } from "./types.js";

interface SpecCliOptions {
	projectDir?: string;
	output?: string;
	json?: boolean;
}

interface GenerateCliOptions {
	projectDir?: string;
}

interface ExportCliOptions {
	projectDir?: string;
	output?: string;
}

interface InitCliOptions {
	projectDir?: string;
	force?: boolean;
}

interface ServeCliOptions {
	projectDir?: string;
	port?: string;
	verboseLogs?: boolean;
}

export class Cli {
	private readonly cli: CliBuilder;
	private readonly parser: Parser;

	public constructor() {
		this.cli = new CliBuilder();
		this.parser = new Parser();
	}

	public async run(): Promise<void> {
		this.cli
			.name("convexdoc")
			.description(
				"Documentation generator and interactive tester for Convex deployments",
			)
			.version("0.1.7");

		this.specCommandBuilder();
		this.exportCommandBuilder();
		this.initCommandBuilder();
		this.generateCommandBuilder();
		this.serveCommandBuilder();
		this.startCommandBuilder();

		await this.cli.parseAsync();
	}

	private createConfig(options: ConfigOptions = {}) {
		return new CliConfig({ cwd: process.cwd(), ...options }).resolve();
	}

	private specCommandBuilder(): CliBuilder {
		const specCmd = new SpecCommand();
		return this.cli
			.command("spec")
			.description(
				"Fetch and display the function spec from your Convex deployment",
			)
			.option("-p, --project-dir <path>", "Path to your Convex project root")
			.option("-o, --output <file>", "Write raw spec JSON to a file")
			.option("--json", "Output raw JSON instead of formatted display")
			.action(async (opts: SpecCliOptions) => {
				const appConfig = this.createConfig({
					projectDir: opts.projectDir,
				});
				const spinner = new Spinner("Fetching function spec from Convex...");
				spinner.start();

				let rawSpec: FunctionSpecOutput;
				try {
					rawSpec = await specCmd.run({
						projectDir: appConfig.projectDir,
						deploymentUrl: appConfig.deploymentUrl,
						deploymentEnv: appConfig.deploymentEnv,
					});
					spinner.succeed("Function spec fetched successfully");
				} catch (err: unknown) {
					spinner.fail("Failed to fetch function spec");
					console.error(picocolors.red((err as Error).message));
					process.exit(1);
				}

				// Write raw JSON to file if requested
				if (opts.output) {
					const outPath = resolve(opts.output);
					writeFileSync(outPath, typia.json.stringify(rawSpec));
					console.log(picocolors.green(`\n✓ Raw spec written to ${outPath}`));
					return;
				}

				if (opts.json) {
					console.log(typia.json.stringify(rawSpec));
					return;
				}

				// Pretty-print the parsed spec
				const parsed = this.parser.run(rawSpec);
				if (parsed.warnings?.length) {
					console.log(picocolors.yellow(`Warnings: ${parsed.warnings.length}`));
					for (const warning of parsed.warnings.slice(0, 8)) {
						console.log(picocolors.yellow(`  - ${warning}`));
					}
				}
				this.parser.print(parsed);
			});
	}

	private exportCommandBuilder(): CliBuilder {
		const exportCmd = new ExportCommand();
		return this.cli
			.command("export")
			.description(
				"Generate an OpenAPI spec (YAML) from your Convex deployment",
			)
			.option("-p, --project-dir <path>", "Path to your Convex project root")
			.option(
				"-o, --output <file>",
				"Copy generated OpenAPI YAML to a specific file",
			)
			.action(async (opts: ExportCliOptions) => {
				const appConfig = this.createConfig({
					projectDir: opts.projectDir,
				});

				const spinner = new Spinner("Generating OpenAPI spec...");
				spinner.start();

				let generatedFilePath: string;
				try {
					generatedFilePath = await exportCmd.run({
						projectDir: appConfig.projectDir,
						deploymentUrl: appConfig.deploymentUrl,
						deploymentEnv: appConfig.deploymentEnv,
					});
					spinner.succeed("OpenAPI spec generated");
				} catch (err: unknown) {
					spinner.fail("Failed to generate OpenAPI spec");
					console.error(picocolors.red((err as Error).message));
					process.exit(1);
				}

				if (opts.output) {
					const outPath = resolve(opts.output);
					const yaml = readFileSync(generatedFilePath, "utf-8");
					writeFileSync(outPath, yaml, "utf-8");
					console.log(
						picocolors.green(`\n✓ OpenAPI YAML written to ${outPath}`),
					);
					return;
				}

				console.log(
					picocolors.green(`\n✓ OpenAPI YAML written to ${generatedFilePath}`),
				);
			});
	}

	private initCommandBuilder(): CliBuilder {
		const initCmd = new InitCommand();
		return this.cli
			.command("init")
			.description(
				"Create a convexdoc.config.json in the project with default options",
			)
			.option(
				"-p, --project-dir <path>",
				"Directory for the config file (default: cwd)",
			)
			.option("-f, --force", "Overwrite existing convexdoc.config.json")
			.action(async (opts: InitCliOptions) => {
				const dir = opts.projectDir ?? process.cwd();
				try {
					await initCmd.run({
						projectDir: dir,
						force: opts.force === true,
					});
					const configPath = join(resolve(dir), "convexdoc.config.json");
					console.log(picocolors.green(`✓ Created ${configPath}`));
					console.log(
						picocolors.dim(
							"Edit the file to customize docs, then run convexdoc generate.",
						),
					);
				} catch (err: unknown) {
					console.error(picocolors.red((err as Error).message));
					process.exit(1);
				}
			});
	}

	private generateCommandBuilder(): CliBuilder {
		const specCmd = new SpecCommand();
		const generateCmd = new GenerateCommand(this.parser);
		return this.cli
			.command("generate")
			.description("Generate static HTML documentation into docs")
			.option("-p, --project-dir <path>", "Path to your Convex project root")
			.action(async (opts: GenerateCliOptions) => {
				const appConfig = this.createConfig({
					projectDir: opts.projectDir,
				});
				const spinner = new Spinner("Fetching function spec...");
				spinner.start();

				let rawSpec: FunctionSpecOutput;
				try {
					rawSpec = await specCmd.run({
						projectDir: appConfig.projectDir,
						deploymentUrl: appConfig.deploymentUrl,
						deploymentEnv: appConfig.deploymentEnv,
					});
					spinner.succeed("Function spec fetched");
				} catch (err: unknown) {
					spinner.fail("Failed to fetch function spec");
					console.error(picocolors.red((err as Error).message));
					process.exit(1);
				}

				const parsed = this.parser.run(rawSpec);
				if (parsed.warnings?.length) {
					console.log(
						picocolors.yellow(`Parser warnings: ${parsed.warnings.length}`),
					);
				}
				if (parsed.summary.total === 0) {
					console.log(
						picocolors.yellow(
							"No functions found. Push your Convex functions first (e.g. npx convex dev), then run generate again.",
						),
					);
					process.exit(0);
				}

				spinner.setText("Generating docs...");
				spinner.start();
				const outputDir = appConfig.docsDir;
				try {
					await generateCmd.run(parsed, outputDir, appConfig.projectDir, {
						httpActionDeployUrl: appConfig.httpActionDeployUrl,
						deploymentEnv: appConfig.deploymentEnv,
						deploymentUrl: appConfig.deploymentUrl,
						customization: appConfig.customization,
						disableFunctionRunner: appConfig.disableFunctionRunner,
						verboseErrorsInUi: appConfig.verboseLogs,
					});
					spinner.succeed(
						`Docs written to ${outputDir}. Run \`convexdoc serve\` to view.`,
					);
				} catch (err: unknown) {
					spinner.fail("Generate failed");
					console.error(picocolors.red((err as Error).message));
					process.exit(1);
				}
			});
	}

	private serveCommandBuilder(): CliBuilder {
		return this.cli
			.command("serve")
			.description("Serve the generated docs site locally")
			.option("-p, --project-dir <path>", "Path to your Convex project root")
			.option("-P, --port <number>", "Port to listen on")
			.option("--verbose-logs", "Enable detailed request logs")
			.action(async (opts: ServeCliOptions) => {
				const appConfig = this.createConfig({
					projectDir: opts.projectDir,
					serverPort: opts.port,
					verboseLogs: opts.verboseLogs === true ? true : undefined,
				});
				const docsDir = appConfig.docsDir;

				if (!existsSync(docsDir)) {
					console.error(
						picocolors.red(
							`No docs folder at ${docsDir}. Run \`convexdoc generate\` first.`,
						),
					);
					process.exit(1);
				}

				if (!existsSync(join(docsDir, "index.html"))) {
					console.error(
						picocolors.red(
							`No index.html in ${docsDir}. Run \`convexdoc generate\` first.`,
						),
					);
					process.exit(1);
				}

				const url = `http://localhost:${appConfig.serverPort}`;
				console.log(
					picocolors.green(`Serving docs at ${picocolors.bold(url)}`),
				);
				console.log(picocolors.dim("Press Ctrl+C to stop.\n"));

				const server = new DocsServer({
					docsDir,
					port: appConfig.serverPort,
					verboseLogs: appConfig.verboseLogs,
					deploymentUrl: appConfig.deploymentUrl,
					authToken: appConfig.authToken,
					disableFunctionRunner: appConfig.disableFunctionRunner,
				});

				await server.run();
			});
	}

	private startCommandBuilder(): CliBuilder {
		const specCmd = new SpecCommand();
		const generateCmd = new GenerateCommand(this.parser);
		return this.cli
			.command("start")
			.description("Generate docs and then serve the docs site locally")
			.option("-p, --project-dir <path>", "Path to your Convex project root")
			.option("-P, --port <number>", "Port to listen on")
			.option("--verbose-logs", "Enable detailed request logs")
			.action(async (opts: ServeCliOptions) => {
				const appConfig = this.createConfig({
					projectDir: opts.projectDir,
					serverPort: opts.port,
					verboseLogs: opts.verboseLogs === true ? true : undefined,
				});
				const spinner = new Spinner("Fetching function spec...");
				spinner.start();

				let rawSpec: FunctionSpecOutput;
				try {
					rawSpec = await specCmd.run({
						projectDir: appConfig.projectDir,
						deploymentUrl: appConfig.deploymentUrl,
						deploymentEnv: appConfig.deploymentEnv,
					});
					spinner.succeed("Function spec fetched");
				} catch (err: unknown) {
					spinner.fail("Failed to fetch function spec");
					console.error(picocolors.red((err as Error).message));
					process.exit(1);
				}

				const parsed = this.parser.run(rawSpec);
				if (parsed.warnings?.length) {
					console.log(
						picocolors.yellow(`Parser warnings: ${parsed.warnings.length}`),
					);
				}
				if (parsed.summary.total === 0) {
					console.log(
						picocolors.yellow(
							"No functions found. Push your Convex functions first (e.g. npx convex dev), then run start again.",
						),
					);
					process.exit(0);
				}

				spinner.setText("Generating docs...");
				spinner.start();
				const docsDir = appConfig.docsDir;
				try {
					await generateCmd.run(parsed, docsDir, appConfig.projectDir, {
						httpActionDeployUrl: appConfig.httpActionDeployUrl,
						deploymentEnv: appConfig.deploymentEnv,
						deploymentUrl: appConfig.deploymentUrl,
						customization: appConfig.customization,
						disableFunctionRunner: appConfig.disableFunctionRunner,
						verboseErrorsInUi: appConfig.verboseLogs,
					});
					spinner.succeed(
						`Docs written to ${docsDir}. Starting local server...`,
					);
				} catch (err: unknown) {
					spinner.fail("Generate failed");
					console.error(picocolors.red((err as Error).message));
					process.exit(1);
				}

				const port = String(appConfig.serverPort);
				const url = `http://localhost:${port}`;
				console.log(
					picocolors.green(`Serving docs at ${picocolors.bold(url)}`),
				);
				console.log(picocolors.dim("Press Ctrl+C to stop.\n"));

				const server = new DocsServer({
					docsDir,
					port: appConfig.serverPort,
					verboseLogs: appConfig.verboseLogs,
					deploymentUrl: appConfig.deploymentUrl,
					authToken: appConfig.authToken,
					disableFunctionRunner: appConfig.disableFunctionRunner,
				});
				await server.run();
			});
	}
}
