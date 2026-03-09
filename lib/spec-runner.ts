import { existsSync } from "node:fs";
import { join } from "node:path";
import { execa } from "execa";
import type { FunctionSpecOutput } from "./function-spec.js";

export interface FunctionSpecOptions {
	/** Path to the Convex project root. Defaults to cwd. */
	projectDir?: string;
	/** Use a specific deployment URL instead of the one from .env */
	deploymentUrl?: string;
	/** Admin key for the deployment */
	adminKey?: string;
	/**
	 * Target Convex deployment environment.
	 * - "dev" (default): use the dev deployment
	 * - "prod": pass --prod to `convex function-spec`
	 */
	deploymentEnv?: "dev" | "prod";
}

/**
 * Runs `npx convex function-spec` in the target project and returns the
 * raw JSON output as a parsed object.
 */
export async function fetchFunctionSpec(
	opts: FunctionSpecOptions = {},
): Promise<FunctionSpecOutput> {
	const projectDir = opts.projectDir ?? process.cwd();

	ensureConvexProject(projectDir);

	const args = ["convex", "function-spec"];
	if (opts.deploymentEnv === "prod") {
		args.push("--prod");
	}
	const env: Record<string, string> = {};

	if (opts.deploymentUrl) {
		env.CONVEX_URL = opts.deploymentUrl;
	}
	if (opts.adminKey) {
		env.CONVEX_ADMIN_KEY = opts.adminKey;
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

	return parseSpecOutput(stdout);
}

/**
 * Parse raw stdout from `convex function-spec`.
 * The command may prefix output with log lines — we extract the JSON block.
 */
function parseSpecOutput(stdout: string): FunctionSpecOutput {
	// Find the first '{' or '[' — the JSON starts there
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

function ensureConvexProject(dir: string): void {
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
