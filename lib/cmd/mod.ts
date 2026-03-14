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

import { existsSync } from "node:fs";
import { join } from "node:path";
import typia from "typia";
import type { FunctionSpecOutput } from "../types.js";

/**
 * Base class for ConvexDoc CLI commands. Encapsulates shared helpers and
 * cross-command concerns so individual commands stay focused on their flow.
 */
export abstract class Command {
	public abstract run(...args: unknown[]): Promise<unknown>;

	/**
	 * Validate that the given directory looks like a Convex project. All
	 * commands that talk to Convex should call this before running.
	 */
	protected ensureConvexProject(dir: string): void {
		const hasConvexDir = existsSync(join(dir, "convex"));
		const hasEnvFile =
			existsSync(join(dir, ".env.local")) || existsSync(join(dir, ".env"));

		if (!hasConvexDir && !hasEnvFile) {
			throw new Error(
				`No Convex project found at: ${dir}\n` +
					`Expected a \`convex/\` directory. ` +
					`Use --project-dir to point at your Convex project root.`,
			);
		}
	}

	/**
	 * Parse and normalize the JSON output from `convex function-spec`. This
	 * assumes a plain JSON value (object or array) and normalizes the two
	 * supported shapes returned by Convex:
	 *   1. { functions: [...] }
	 *   2. [...]  (bare array of functions)
	 */
	protected parseFunctionSpecOutput(stdout: string): FunctionSpecOutput {
		try {
			const direct = typia.json.assertParse<unknown>(stdout.trim());

			if (Array.isArray(direct)) {
				return { functions: direct as Record<string, unknown>[] };
			}

			return direct as FunctionSpecOutput;
		} catch {
			throw new Error(
				`Failed to parse JSON from \`convex function-spec\`.\n\nRaw output:\n${stdout}`,
			);
		}
	}
}
