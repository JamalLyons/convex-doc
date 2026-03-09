import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

export interface ConvexDocConfigFile {
	projectDir?: string;
	serverPort?: number;
	docsDir?: string;
	httpActionDeployUrl?: string;
	deploymentUrl?: string;
	adminKey?: string;
	verboseLogs?: boolean;
	/**
	 * Which Convex deployment environment to target when fetching the function
	 * spec. Defaults to "dev".
	 *
	 * - "dev": use the default `convex function-spec` behavior (dev deployment)
	 * - "prod": run `convex function-spec --prod` to inspect production
	 */
	deploymentEnv?: "dev" | "prod";
}

export interface ResolvedAppConfig {
	projectDir: string;
	serverPort: number;
	docsDir: string;
	httpActionDeployUrl: string;
	deploymentUrl?: string;
	adminKey?: string;
	verboseLogs: boolean;
	/** Normalized deployment environment ("dev" or "prod"). */
	deploymentEnv: "dev" | "prod";
	configPath?: string;
}

export interface ResolveAppConfigOptions {
	cwd?: string;
	projectDir?: string;
	serverPort?: string | number;
	httpActionDeployUrl?: string;
	verboseLogs?: boolean;
	/**
	 * Optional override for deployment environment. If omitted, falls back to
	 * CONVEXDOC_ENV, then convexdoc.config.json, then "dev".
	 */
	deploymentEnv?: "dev" | "prod";
}

const DEFAULT_SERVER_PORT = 3000;
const DEFAULT_DOCS_DIR = "docs";
const DEFAULT_HTTP_ACTION_DEPLOY_URL = "http://localhost:3218";

export function resolveAppConfig(
	options: ResolveAppConfigOptions = {},
): ResolvedAppConfig {
	const cwd = resolve(options.cwd ?? process.cwd());
	const fileConfig = loadConfigFile(cwd);

	const projectDirRaw =
		options.projectDir ??
		process.env.CONVEXDOC_PROJECT_DIR ??
		fileConfig.data.projectDir ??
		cwd;

	const portRaw =
		options.serverPort ??
		process.env.CONVEXDOC_SERVER_PORT ??
		fileConfig.data.serverPort ??
		DEFAULT_SERVER_PORT;

	const verboseLogs =
		options.verboseLogs ??
		toBoolean(process.env.CONVEXDOC_VERBOSE_LOGS) ??
		fileConfig.data.verboseLogs ??
		false;

	const deploymentEnvRaw =
		options.deploymentEnv ??
		(process.env.CONVEXDOC_ENV as "dev" | "prod" | undefined) ??
		fileConfig.data.deploymentEnv ??
		"dev";

	const deploymentEnv: "dev" | "prod" =
		deploymentEnvRaw === "prod" ? "prod" : "dev";

	const docsDirRaw = fileConfig.data.docsDir ?? DEFAULT_DOCS_DIR;

	return {
		projectDir: resolve(projectDirRaw),
		serverPort: parsePort(portRaw, DEFAULT_SERVER_PORT),
		docsDir: isAbsolute(docsDirRaw)
			? docsDirRaw
			: resolve(projectDirRaw, docsDirRaw),
		httpActionDeployUrl:
			options.httpActionDeployUrl ??
			process.env.CONVEXDOC_HTTP_ACTION_DEPLOY_URL ??
			fileConfig.data.httpActionDeployUrl ??
			DEFAULT_HTTP_ACTION_DEPLOY_URL,
		deploymentUrl:
			fileConfig.data.deploymentUrl ??
			process.env.CONVEX_URL,
		adminKey:
			fileConfig.data.adminKey ??
			process.env.CONVEX_ADMIN_KEY,
		verboseLogs,
		deploymentEnv,
		configPath: fileConfig.path,
	};
}

function loadConfigFile(cwd: string): {
	data: ConvexDocConfigFile;
	path?: string;
} {
	const configPath = join(cwd, "convexdoc.config.json");
	if (!existsSync(configPath)) {
		return { data: {} };
	}
	const raw = readFileSync(configPath, "utf-8");
	const parsed = JSON.parse(raw) as unknown;
	if (!parsed || typeof parsed !== "object") {
		throw new Error(
			`Invalid config at ${configPath}: expected a JSON object`,
		);
	}
	return { data: parsed as ConvexDocConfigFile, path: configPath };
}

function parsePort(value: string | number, fallback: number): number {
	const n =
		typeof value === "number" ? value : Number.parseInt(String(value), 10);
	if (!Number.isFinite(n) || n <= 0) {
		return fallback;
	}
	return n;
}

function toBoolean(value: string | undefined): boolean | undefined {
	if (value == null) return undefined;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true" || normalized === "1" || normalized === "yes") {
		return true;
	}
	if (normalized === "false" || normalized === "0" || normalized === "no") {
		return false;
	}
	return undefined;
}
