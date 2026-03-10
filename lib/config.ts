import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

export interface ConvexDocFunctionCustomization {
	description?: string;
}

export interface ConvexDocModuleCustomization {
	description?: string;
	/** Per-function docs keyed by function name (e.g. getTask, createTask). */
	functions?: Record<string, ConvexDocFunctionCustomization>;
}

/** Valid values for excludeFunctionTypes (Convex function type names). */
export const EXCLUDE_FUNCTION_TYPES_VALID = [
	"query",
	"mutation",
	"action",
	"httpAction",
	"internalQuery",
	"internalMutation",
	"internalAction",
] as const;

export interface ConvexDocCustomization {
	theme?: {
		accent?: string;
	};
	modules?: Record<string, ConvexDocModuleCustomization>;
	/** When true, hide "Learn more about Convex queries/mutations/..." links on function cards. */
	hideConvexDocsLinks?: boolean;
	/** Path to a local markdown or plaintext file for the landing page (e.g. "./readme.md"). Resolved from project dir. */
	landingPage?: string;
	/** Exclude these Convex function types from the generated docs (e.g. ["internalQuery", "internalMutation"] for public API only). */
	excludeFunctionTypes?: string[];
}

export interface ConvexDocConfigFile {
	projectDir?: string;
	serverPort?: number;
	docsDir?: string;
	httpActionDeployUrl?: string;
	deploymentUrl?: string;
	adminKey?: string;
	verboseLogs?: boolean;
	/**
	 * When true, the function runner is disabled. Use this when publishing the
	 * docs site on a public domain so visitors cannot invoke your Convex API.
	 * The /__convexdoc/run route will reject requests and log that the operation
	 * is disabled.
	 */
	disableFunctionRunner?: boolean;
	/**
	 * Which Convex deployment environment to target when fetching the function
	 * spec. Defaults to "dev".
	 *
	 * - "dev": use the default `convex function-spec` behavior (dev deployment)
	 * - "prod": run `convex function-spec --prod` to inspect production
	 */
	deploymentEnv?: "dev" | "prod";
	customization?: ConvexDocCustomization;
}

export interface ResolvedAppConfig {
	projectDir: string;
	serverPort: number;
	docsDir: string;
	httpActionDeployUrl: string;
	deploymentUrl?: string;
	adminKey?: string;
	verboseLogs: boolean;
	/** When true, the function runner is disabled (for public deployments). */
	disableFunctionRunner: boolean;
	/** Normalized deployment environment ("dev" or "prod"). */
	deploymentEnv: "dev" | "prod";
	customization: ConvexDocCustomization;
	configPath?: string;
}

export interface ResolveAppConfigOptions {
	cwd?: string;
	projectDir?: string;
	serverPort?: string | number;
	httpActionDeployUrl?: string;
	verboseLogs?: boolean;
	disableFunctionRunner?: boolean;
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

	const projectDirResolved = isAbsolute(projectDirRaw)
		? projectDirRaw
		: resolve(cwd, projectDirRaw);

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

	const disableFunctionRunner =
		options.disableFunctionRunner ??
		toBoolean(process.env.CONVEXDOC_DISABLE_FUNCTION_RUNNER) ??
		fileConfig.data.disableFunctionRunner ??
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
		projectDir: projectDirResolved,
		serverPort: parsePort(portRaw, DEFAULT_SERVER_PORT),
		docsDir: isAbsolute(docsDirRaw)
			? docsDirRaw
			: resolve(projectDirResolved, docsDirRaw),
		httpActionDeployUrl:
			options.httpActionDeployUrl ??
			process.env.CONVEXDOC_HTTP_ACTION_DEPLOY_URL ??
			fileConfig.data.httpActionDeployUrl ??
			DEFAULT_HTTP_ACTION_DEPLOY_URL,
		deploymentUrl: fileConfig.data.deploymentUrl ?? process.env.CONVEX_URL,
		adminKey: fileConfig.data.adminKey ?? process.env.CONVEX_ADMIN_KEY,
		verboseLogs,
		disableFunctionRunner,
		deploymentEnv,
		customization: normalizeCustomization(fileConfig.data.customization),
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
		throw new Error(`Invalid config at ${configPath}: expected a JSON object`);
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

function normalizeCustomization(
	customization: ConvexDocCustomization | undefined,
): ConvexDocCustomization {
	if (!customization || typeof customization !== "object") return {};

	const out: ConvexDocCustomization = {};
	if (
		customization.theme &&
		typeof customization.theme === "object" &&
		typeof customization.theme.accent === "string" &&
		customization.theme.accent.trim()
	) {
		out.theme = { accent: customization.theme.accent.trim() };
	}

	if (customization.modules && typeof customization.modules === "object") {
		const modules: Record<string, ConvexDocModuleCustomization> = {};
		for (const [moduleName, moduleConfig] of Object.entries(
			customization.modules,
		)) {
			if (
				!moduleName.trim() ||
				!moduleConfig ||
				typeof moduleConfig !== "object"
			) {
				continue;
			}
			const description =
				typeof moduleConfig.description === "string"
					? moduleConfig.description.trim()
					: "";
			const modOut: ConvexDocModuleCustomization = description
				? { description }
				: {};
			if (
				moduleConfig.functions &&
				typeof moduleConfig.functions === "object"
			) {
				const fns: Record<string, ConvexDocFunctionCustomization> = {};
				for (const [fnName, fnConfig] of Object.entries(
					moduleConfig.functions,
				)) {
					if (!fnName.trim() || !fnConfig || typeof fnConfig !== "object")
						continue;
					const fnDesc =
						typeof fnConfig.description === "string"
							? fnConfig.description.trim()
							: "";
					if (fnDesc) fns[fnName] = { description: fnDesc };
				}
				if (Object.keys(fns).length > 0) modOut.functions = fns;
			}
			modules[moduleName] = modOut;
		}
		out.modules = modules;
	}

	// Default true: hide "Learn more about Convex" links unless explicitly set to false
	out.hideConvexDocsLinks = customization.hideConvexDocsLinks !== false;

	if (
		typeof customization.landingPage === "string" &&
		customization.landingPage.trim()
	) {
		out.landingPage = customization.landingPage.trim();
	}

	if (Array.isArray(customization.excludeFunctionTypes)) {
		const valid = new Set(EXCLUDE_FUNCTION_TYPES_VALID);
		out.excludeFunctionTypes = customization.excludeFunctionTypes.filter(
			(t): t is (typeof EXCLUDE_FUNCTION_TYPES_VALID)[number] =>
				typeof t === "string" &&
				valid.has(t as (typeof EXCLUDE_FUNCTION_TYPES_VALID)[number]),
		);
		if (out.excludeFunctionTypes.length === 0) delete out.excludeFunctionTypes;
	}

	return out;
}
