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
import { isAbsolute, join, resolve } from "node:path";
import { parseEnv } from "node:util";
import typia, { type tags } from "typia";

export interface Customization {
	theme?: {
		accent?: string;
	};
	/** Path to a local directory containing markdown docs (e.g. "./content"). Resolved from project dir. */
	contentPath?: string;
	/** When true, hide "Learn more about Convex queries/mutations/..." links on function cards. */
	hideConvexDocsLinks?: boolean;
	/** Exclude these Convex function types from the generated docs (e.g. ["internalQuery", "internalMutation"] for public API only). */
	excludeFunctionTypes?: string[];
}

export interface ConfigFile {
	projectDir?: string;
	serverPort?: number & tags.Type<"uint32"> & tags.Maximum<65535>;
	docsDir?: string;
	httpActionDeployUrl?: string & tags.Format<"url">;
	deploymentUrl?: string & tags.Format<"url">;
	authToken?: string;
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
	customization?: Customization;
}

/** Default config written by `convexdoc init` and used when no config file exists. */
export const DEFAULT_CONFIG_FILE: ConfigFile = {
	projectDir: ".",
	serverPort: 3000,
	docsDir: "docs",
	authToken: "",
	verboseLogs: false,
	disableFunctionRunner: false,
	deploymentEnv: "dev",
	customization: {
		theme: { accent: "" },
		contentPath: "",
		hideConvexDocsLinks: true,
		excludeFunctionTypes: [],
	},
};

export interface ConfigOptions {
	cwd?: string;
	projectDir?: string;
	serverPort?: string | (number & tags.Type<"uint32"> & tags.Maximum<65535>);
	httpActionDeployUrl?: string & tags.Format<"url">;
	verboseLogs?: boolean;
	disableFunctionRunner?: boolean;
	/**
	 * Optional override for deployment environment. If omitted, falls back to
	 * CONVEXDOC_ENV, then convexdoc.config.json, then "dev".
	 */
	deploymentEnv?: "dev" | "prod";
}

export interface ResolvedCliConfig {
	projectDir: string;
	serverPort: number & tags.Type<"uint32"> & tags.Maximum<65535>;
	docsDir: string;
	httpActionDeployUrl: string & tags.Format<"url">;
	deploymentUrl?: string & tags.Format<"url">;
	authToken?: string;
	verboseLogs: boolean;
	disableFunctionRunner: boolean;
	deploymentEnv: "dev" | "prod";
	customization: Customization;
	configPath?: string;
}

export class CliConfig {
	private env: Record<string, string>;
	private projectDir: string;
	private serverPort: number;
	private docsDir: string;
	private httpActionDeployUrl: string;
	private deploymentUrl?: string;
	private authToken?: string;
	private verboseLogs: boolean;
	/** When true, the function runner is disabled (for public deployments). */
	private disableFunctionRunner: boolean;
	/** Normalized deployment environment ("dev" or "prod"). */
	private deploymentEnv: "dev" | "prod";
	private customization: Customization;
	private configPath?: string;

	private DEFAULT_SERVER_PORT = 3000;
	private DEFAULT_DOCS_DIR = "docs";
	private DEFAULT_HTTP_ACTION_DEPLOY_URL = "http://localhost:3218";
	/** Valid values for excludeFunctionTypes (Convex function type names). */
	private EXCLUDE_FUNCTION_TYPES_VALID = [
		"query",
		"mutation",
		"action",
		"httpAction",
		"internalQuery",
		"internalMutation",
		"internalAction",
	] as const;

	constructor(public options: ConfigOptions) {
		const cwd = resolve(options.cwd ?? process.cwd());
		this.env = this.buildEnv(cwd);
		const fileConfig = this.loadFromFile(cwd);

		const projectDirRaw =
			options.projectDir ??
			this.env.CONVEXDOC_PROJECT_DIR ??
			fileConfig.data.projectDir ??
			cwd;

		const projectDirResolved = isAbsolute(projectDirRaw)
			? projectDirRaw
			: resolve(cwd, projectDirRaw);

		const portRaw =
			options.serverPort ??
			this.env.CONVEXDOC_SERVER_PORT ??
			fileConfig.data.serverPort ??
			this.DEFAULT_SERVER_PORT;

		const verboseLogs =
			options.verboseLogs ??
			this.toBoolean(this.env.CONVEXDOC_VERBOSE_LOGS) ??
			fileConfig.data.verboseLogs ??
			false;

		const disableFunctionRunner =
			options.disableFunctionRunner ??
			this.toBoolean(this.env.CONVEXDOC_DISABLE_FUNCTION_RUNNER) ??
			fileConfig.data.disableFunctionRunner ??
			false;

		const deploymentEnvRaw =
			options.deploymentEnv ??
			(this.env.CONVEXDOC_ENV as "dev" | "prod" | undefined) ??
			fileConfig.data.deploymentEnv ??
			"dev";

		const deploymentEnv: "dev" | "prod" =
			deploymentEnvRaw === "prod" ? "prod" : "dev";

		const docsDirRaw = fileConfig.data.docsDir ?? this.DEFAULT_DOCS_DIR;

		this.projectDir = projectDirResolved;
		this.serverPort = this.parsePort(portRaw, this.DEFAULT_SERVER_PORT);
		this.docsDir = isAbsolute(docsDirRaw)
			? docsDirRaw
			: resolve(projectDirResolved, docsDirRaw);
		this.httpActionDeployUrl =
			options.httpActionDeployUrl ??
			this.env.CONVEXDOC_HTTP_ACTION_DEPLOY_URL ??
			fileConfig.data.httpActionDeployUrl ??
			this.env.CONVEX_SITE_URL ??
			this.DEFAULT_HTTP_ACTION_DEPLOY_URL;
		this.deploymentUrl =
			fileConfig.data.deploymentUrl ??
			this.env.CONVEX_URL ??
			this.env.NEXT_PUBLIC_CONVEX_URL;
		this.authToken = fileConfig.data.authToken ?? this.env.CONVEXDOC_AUTH_TOKEN;
		this.verboseLogs = verboseLogs;
		this.disableFunctionRunner = disableFunctionRunner;
		this.deploymentEnv = deploymentEnv;
		this.customization = this.normalizeCustomization(
			fileConfig.data.customization,
		);
		this.configPath = fileConfig.path;
	}

	private buildEnv(cwd: string): Record<string, string> {
		const env: Record<string, string> = {};
		for (const [key, value] of Object.entries(process.env)) {
			if (typeof value === "string") {
				env[key] = value;
			}
		}
		this.mergeEnvFile(join(cwd, ".env.local"), env);
		this.mergeEnvFile(join(cwd, ".env"), env);
		return env;
	}

	private mergeEnvFile(path: string, env: Record<string, string>): void {
		if (!existsSync(path)) return;
		let raw: string;
		try {
			raw = readFileSync(path, "utf-8");
		} catch {
			return;
		}
		try {
			const parsed = parseEnv(raw);
			for (const [key, value] of Object.entries(parsed)) {
				if (value == null) continue;
				if (env[key] === undefined) {
					env[key] = value;
				}
			}
		} catch {
			// Ignore invalid .env contents and continue with other sources.
		}
	}

	public resolve(): ResolvedCliConfig {
		return {
			projectDir: this.projectDir,
			serverPort: this.serverPort,
			docsDir: this.docsDir,
			httpActionDeployUrl: this.httpActionDeployUrl,
			deploymentUrl: this.deploymentUrl,
			authToken: this.authToken,
			verboseLogs: this.verboseLogs,
			disableFunctionRunner: this.disableFunctionRunner,
			deploymentEnv: this.deploymentEnv,
			customization: this.customization,
			configPath: this.configPath,
		};
	}

	private loadFromFile(cwd: string): {
		data: ConfigFile;
		path?: string;
	} {
		const configPath = join(cwd, "convexdoc.config.json");
		if (!existsSync(configPath)) {
			// When no config is present, scaffold a default one for the user.
			try {
				writeFileSync(
					configPath,
					`${typia.json.stringify(DEFAULT_CONFIG_FILE)}\n`,
					"utf-8",
				);
			} catch {
				// Best-effort: if we cannot write the file, continue with in-memory defaults.
			}
			return { data: DEFAULT_CONFIG_FILE, path: configPath };
		}
		const raw = readFileSync(configPath, "utf-8");
		try {
			return {
				data: typia.json.assertParse<ConfigFile>(raw),
				path: configPath,
			};
		} catch (e) {
			throw new Error(
				`Invalid config at ${configPath}: expected a valid JSON object matching ConfigFile schema.\n${String(e)}`,
			);
		}
	}

	private parsePort(value: string | number, fallback: number): number {
		const n =
			typeof value === "number" ? value : Number.parseInt(String(value), 10);
		if (!Number.isFinite(n) || n <= 0) {
			return fallback;
		}
		return n;
	}

	private normalizeCustomization(
		customization: Customization | undefined,
	): Customization {
		if (!customization || typeof customization !== "object") return {};

		const out: Customization = {};
		if (
			customization.theme &&
			typeof customization.theme === "object" &&
			typeof customization.theme.accent === "string" &&
			customization.theme.accent.trim()
		) {
			out.theme = { accent: customization.theme.accent.trim() };
		}

		// Default true: hide "Learn more about Convex" links unless explicitly set to false
		out.hideConvexDocsLinks = customization.hideConvexDocsLinks !== false;

		if (
			typeof customization.contentPath === "string" &&
			customization.contentPath.trim()
		) {
			out.contentPath = customization.contentPath.trim();
		}

		if (Array.isArray(customization.excludeFunctionTypes)) {
			const valid = new Set(this.EXCLUDE_FUNCTION_TYPES_VALID);
			out.excludeFunctionTypes = customization.excludeFunctionTypes.filter(
				(t): t is (typeof this.EXCLUDE_FUNCTION_TYPES_VALID)[number] =>
					typeof t === "string" &&
					valid.has(t as (typeof this.EXCLUDE_FUNCTION_TYPES_VALID)[number]),
			);
			if (out.excludeFunctionTypes.length === 0)
				delete out.excludeFunctionTypes;
		}

		return out;
	}

	private toBoolean(value: string | undefined): boolean | undefined {
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
}
