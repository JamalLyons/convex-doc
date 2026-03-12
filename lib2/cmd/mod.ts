import { existsSync } from "node:fs";
import { join } from "node:path";
import type { FunctionSpecOutput } from "../types";

/**
 * Base class for ConvexDoc CLI commands. Encapsulates shared helpers and
 * cross-command concerns so individual commands stay focused on their flow.
 */
export abstract class Command {
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
	 * centralizes the slightly messy "find JSON in stdout, handle bare array"
	 * behavior so it can be reused across commands if needed.
	 */
	protected parseFunctionSpecOutput(stdout: string): FunctionSpecOutput {
		const jsonStart = stdout.search(/[{[]/);
		if (jsonStart === -1) {
			throw new Error(
				`Could not find JSON in \`convex function-spec\` output.\n\nRaw output:\n${stdout}`,
			);
		}

		const jsonStr = stdout.slice(jsonStart);

		try {
			const parsed = JSON.parse(jsonStr);

			// Normalize: bare array → { functions: [...] }
			if (Array.isArray(parsed)) {
				return { functions: parsed };
			}

			return parsed as FunctionSpecOutput;
		} catch {
			throw new Error(
				`Failed to parse JSON from \`convex function-spec\`.\n\nRaw output:\n${stdout}`,
			);
		}
	}

	public abstract run(...args: unknown[]): Promise<unknown>;
}
