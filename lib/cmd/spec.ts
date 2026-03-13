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

import { execa } from "execa";
import type { FunctionSpecOutput } from "../types.js";
import { Command } from "./mod.js";

export interface FunctionSpecOptions {
	/** Path to the Convex project root. Defaults to cwd. */
	projectDir?: string;
	/** Use a specific deployment URL instead of the one from .env */
	deploymentUrl?: string;
	/**
	 * Target Convex deployment environment.
	 * - "dev" (default): use the dev deployment
	 * - "prod": pass --prod to `convex function-spec`
	 */
	deploymentEnv?: "dev" | "prod";
}

export class SpecCommand extends Command {
	public async run(
		opts: FunctionSpecOptions = {},
	): Promise<FunctionSpecOutput> {
		const projectDir = opts.projectDir ?? process.cwd();

		this.ensureConvexProject(projectDir);

		const args = ["convex", "function-spec"];
		if (opts.deploymentEnv === "prod") {
			args.push("--prod");
		}
		const env: Record<string, string> = {};

		if (opts.deploymentUrl) {
			env.CONVEX_URL = opts.deploymentUrl;
		}

		let stdout: string;

		try {
			const result = await execa("npx", args, {
				cwd: projectDir,
				env: { ...process.env, ...env },
				// Capture stdout — the JSON spec is printed there
				stdout: "pipe",
				stderr: "pipe",
			});
			stdout = result.stdout;
		} catch (err: unknown) {
			const execaErr = err as { stderr?: string; message?: string };
			const hint = execaErr.stderr ?? execaErr.message ?? String(err);
			throw new Error(
				`Failed to run \`npx convex function-spec\`.\n\n` +
					`Make sure:\n` +
					`  • You're in (or pointing --project-dir at) a Convex project\n` +
					`  • You're logged in: npx convex login\n` +
					`  • convex@1.15+ is installed\n\n` +
					`Original error:\n${hint}`,
			);
		}

		return this.parseFunctionSpecOutput(stdout);
	}
}
