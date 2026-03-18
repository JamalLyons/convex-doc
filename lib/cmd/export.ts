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
import { existsSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { x } from "tinyexec";
import { Command } from "./mod.js";

export interface OpenApiSpecOptions {
	/** Path to the Convex project root. Defaults to cwd. */
	projectDir?: string;
	/** Optional override for deployment URL (sets `CONVEX_URL`). */
	deploymentUrl?: string;
	/**
	 * Target Convex deployment environment.
	 * - "dev" (default): use the default open-api-spec behavior (dev deployment)
	 * - "prod": pass `--prod` to `convex-helpers open-api-spec`
	 */
	deploymentEnv?: "dev" | "prod";
}

export class ExportCommand extends Command {
	public async run(opts: OpenApiSpecOptions = {}): Promise<string> {
		const projectDir = opts.projectDir ?? process.cwd();

		this.ensureConvexProject(projectDir);

		const beforeFiles = new Set(
			this.listGeneratedOpenApiSpecFiles(projectDir).map((f) =>
				f.toLowerCase(),
			),
		);

		const args = ["convex-helpers", "open-api-spec"] as const;
		const cliArgs = [
			...args,
			...(opts.deploymentEnv === "prod" ? ["--prod"] : []),
		];

		const env: Record<string, string> = {};
		if (opts.deploymentUrl) env.CONVEX_URL = opts.deploymentUrl;

		try {
			const result = await x("npx", cliArgs, {
				nodeOptions: {
					cwd: projectDir,
					env: { ...process.env, ...env },
				},
			});
			void result;
		} catch (err: unknown) {
			throw new Error(
				`Failed to run \`npx convex-helpers open-api-spec\`.\n\n` +
					`Make sure:\n` +
					`  • You're in (or pointing --project-dir at) a Convex project\n` +
					`  • You're logged in: npx convex login\n` +
					`  • convex-helpers is available (or your npx can download it)\n\n` +
					`Original error:\n${String(err ?? "Unknown error")}`,
			);
		}

		const afterFiles = this.listGeneratedOpenApiSpecFiles(projectDir);
		const newFiles = afterFiles.filter(
			(f) => !beforeFiles.has(f.toLowerCase()),
		);
		if (!newFiles.length) {
			throw new Error(
				`OpenAPI spec generator did not create a \`convex-spec-*.yaml\` file.`,
			);
		}

		const generatedFile = this.pickLatestSpecFile(newFiles);
		if (!generatedFile || !existsSync(generatedFile)) {
			throw new Error(
				`OpenAPI spec file not found after generation: ${generatedFile ?? "(unknown)"}`,
			);
		}

		// Leave the generated file in place (the convex-helpers default behavior).
		return generatedFile;
	}

	private listGeneratedOpenApiSpecFiles(projectDir: string): string[] {
		try {
			return readdirSync(projectDir)
				.filter((name) => /^convex-spec-\d+\.yaml$/i.test(name))
				.map((name) => resolve(projectDir, name));
		} catch {
			return [];
		}
	}

	private pickLatestSpecFile(files: string[]): string {
		let best = files[files.length - 1] ?? "";
		let bestTs = -1;

		for (const f of files) {
			const m = basename(f).match(/^convex-spec-(\d+)\.yaml$/i);
			const ts = m?.[1] ? Number.parseInt(m[1], 10) : NaN;
			if (!Number.isFinite(ts)) continue;
			if (ts > bestTs) {
				bestTs = ts;
				best = f;
			}
		}

		return best;
	}
}
