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

import picocolors from "picocolors";
import type {
	ConvexFunctionSpec,
	ConvexFunctionType,
	ConvexModule,
	ConvexValidator,
} from "./types.js";

export interface ParsedFunctionSpec {
	/** Raw functions from convex function-spec */
	raw: ConvexFunctionSpec[];
	/** Functions grouped by module */
	modules: ConvexModule[];
	/** Flat map for quick lookup */
	byIdentifier: Map<string, ConvexFunctionSpec>;
	/** Summary counts by function type and visibility */
	summary: {
		total: number;
		queries: number;
		mutations: number;
		actions: number;
		httpActions: number;
		internal: number;
		public: number;
	};
	/** Parser warnings for unresolved/partial entries */
	warnings?: string[];
}

/** Raw function entry from convex function-spec (may use different key names). */
type RawFunctionEntry = Record<string, unknown>;

export class Parser {
	private EXCLUDABLE_TYPES: Set<string> = new Set([
		"query",
		"mutation",
		"action",
		"httpAction",
		"internalQuery",
		"internalMutation",
		"internalAction",
	]);

	public run(raw: unknown): ParsedFunctionSpec {
		const output = this.validateRawOutput(raw);
		const warnings: string[] = [];
		const functions = output.functions.map((entry, index) =>
			this.normalizeFunctionSpec(entry, index, warnings),
		);

		// Group by module (the part before the colon in "module:functionName")
		const moduleMap = new Map<string, ConvexFunctionSpec[]>();

		for (const fn of functions) {
			const moduleName = this.getModuleName(fn.identifier);
			if (!moduleMap.has(moduleName)) {
				moduleMap.set(moduleName, []);
			}
			moduleMap.get(moduleName)?.push(fn);
		}

		const modules: ConvexModule[] = Array.from(moduleMap.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([name, fns]) => ({
				name,
				functions: fns.sort((a, b) =>
					this.getFunctionName(a.identifier).localeCompare(
						this.getFunctionName(b.identifier),
					),
				),
			}));

		const byIdentifier = new Map(functions.map((fn) => [fn.identifier, fn]));

		const summary = {
			total: functions.length,
			queries: this.count(functions, "query"),
			mutations: this.count(functions, "mutation"),
			actions: this.count(functions, "action"),
			httpActions: this.count(functions, "httpAction"),
			internal: functions.filter((f) => f.visibility.kind === "internal")
				.length,
			public: functions.filter((f) => f.visibility.kind === "public").length,
		};

		return { raw: functions, modules, byIdentifier, summary, warnings };
	}

	public print(parsed: ParsedFunctionSpec) {
		const { summary, modules } = parsed;

		console.log();
		console.log(
			picocolors.bold(
				picocolors.cyan(
					"━━━ ConvexDoc Function Spec ━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
				),
			),
		);
		console.log();

		// Summary table
		console.log(picocolors.bold("Summary"));
		console.log(
			`  ${picocolors.white("Total")}      ${picocolors.yellow(summary.total)}`,
		);
		console.log(
			`  ${picocolors.blue("Queries")}    ${picocolors.yellow(summary.queries)}   ` +
				`${picocolors.green("Mutations")}  ${picocolors.yellow(summary.mutations)}   ` +
				`${picocolors.magenta("Actions")}    ${picocolors.yellow(summary.actions)}`,
		);
		if (summary.httpActions > 0) {
			console.log(
				`  ${picocolors.cyan("HTTP Actions")} ${picocolors.yellow(summary.httpActions)}`,
			);
		}
		console.log(
			`  ${picocolors.gray("Public")}     ${picocolors.yellow(summary.public)}   ` +
				`${picocolors.gray("Internal")}   ${picocolors.yellow(summary.internal)}`,
		);

		if (summary.total === 0) {
			console.log();
			console.log(
				picocolors.yellow(
					"No functions found on this deployment. Push your Convex functions first:",
				),
			);
			console.log(
				picocolors.dim(
					"  npx convex dev   (dev) or  npx convex deploy  (prod)",
				),
			);
			console.log(
				picocolors.dim(
					"  Run from your project root (or use --project-dir). Then run convexdoc spec again.",
				),
			);
		}

		console.log();

		// Per-module breakdown
		for (const mod of modules) {
			console.log(picocolors.bold(picocolors.white(`📦 ${mod.name}`)));

			for (const fn of mod.functions) {
				const fnName = this.getFunctionName(fn.identifier);
				const typeLabel = this.fnTypeLabel(fn.functionType);
				const visLabel =
					fn.visibility.kind === "internal"
						? picocolors.gray(" [internal]")
						: "";

				console.log(`   ${typeLabel} ${picocolors.white(fnName)}${visLabel}`);

				if (fn.args) {
					console.log(
						`      ${picocolors.dim("args:")}    ${picocolors.gray(this.formatValidator(fn.args))}`,
					);
				} else {
					console.log(
						`      ${picocolors.dim("args:")}    ${picocolors.gray("none")}`,
					);
				}

				if (fn.returns) {
					console.log(
						`      ${picocolors.dim("returns:")} ${picocolors.gray(this.formatValidator(fn.returns))}`,
					);
				}
			}

			console.log();
		}

		if (summary.total > 0) {
			console.log(
				picocolors.dim(
					"Run `convexdoc generate` to build your documentation site.",
				),
			);
		}
		console.log();
	}

	public filterByFunction(
		spec: ParsedFunctionSpec,
		excludeTypes: string[],
	): ParsedFunctionSpec {
		const valid = excludeTypes.filter((t) => this.EXCLUDABLE_TYPES.has(t));
		if (valid.length === 0) return spec;

		const raw = spec.raw.filter((fn) => !this.shouldExcludeFunction(fn, valid));
		const moduleMap = new Map<string, ConvexFunctionSpec[]>();
		for (const fn of raw) {
			const moduleName = this.getModuleName(fn.identifier);
			if (!moduleMap.has(moduleName)) moduleMap.set(moduleName, []);
			moduleMap.get(moduleName)?.push(fn);
		}
		const modules: ConvexModule[] = Array.from(moduleMap.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([name, fns]) => ({
				name,
				functions: fns.sort((a, b) =>
					this.getFunctionName(a.identifier).localeCompare(
						this.getFunctionName(b.identifier),
					),
				),
			}));
		const byIdentifier = new Map(raw.map((fn) => [fn.identifier, fn]));
		const summary = {
			total: raw.length,
			queries: this.count(raw, "query"),
			mutations: this.count(raw, "mutation"),
			actions: this.count(raw, "action"),
			httpActions: this.count(raw, "httpAction"),
			internal: raw.filter((f) => f.visibility.kind === "internal").length,
			public: raw.filter((f) => f.visibility.kind === "public").length,
		};
		return { raw, modules, byIdentifier, summary, warnings: spec.warnings };
	}

	public getModuleName(identifier: string | undefined): string {
		if (identifier == null || typeof identifier !== "string") return "(root)";
		if (identifier.startsWith("unresolved:")) return "unresolved";
		if (identifier.startsWith("http:")) return "http";
		const colonIdx = identifier.lastIndexOf(":");
		let mod = colonIdx === -1 ? "(root)" : identifier.slice(0, colonIdx);

		// Strip .js or .ts extension from module name
		if (mod.endsWith(".js")) {
			mod = mod.slice(0, -3);
		} else if (mod.endsWith(".ts")) {
			mod = mod.slice(0, -3);
		}
		return mod;
	}

	public getFunctionName(identifier: string | undefined): string {
		if (identifier == null || typeof identifier !== "string")
			return "(unknown)";
		const colonIdx = identifier.lastIndexOf(":");
		return colonIdx === -1 ? identifier : identifier.slice(colonIdx + 1);
	}

	private fnTypeLabel(type: string): string {
		switch (type) {
			case "query":
				return picocolors.blue("Q");
			case "mutation":
				return picocolors.green("M");
			case "action":
				return picocolors.magenta("A");
			case "httpAction":
				return picocolors.cyan("H");
			default:
				return picocolors.gray("?");
		}
	}

	private shouldExcludeFunction(
		fn: ConvexFunctionSpec,
		excludeTypes: string[],
	): boolean {
		if (!excludeTypes.length) return false;
		for (const t of excludeTypes) {
			if (
				t === "internalQuery" &&
				fn.visibility.kind === "internal" &&
				fn.functionType === "query"
			)
				return true;
			if (
				t === "internalMutation" &&
				fn.visibility.kind === "internal" &&
				fn.functionType === "mutation"
			)
				return true;
			if (
				t === "internalAction" &&
				fn.visibility.kind === "internal" &&
				fn.functionType === "action"
			)
				return true;
			if (t === fn.functionType) return true;
		}
		return false;
	}

	private formatValidator(v: ConvexValidator, depth = 0): string {
		if (v == null || typeof v !== "object") return "unknown";
		const type = (v as { type?: string }).type;
		switch (type) {
			case "object": {
				if (depth > 1) return "{ ... }";
				const fields =
					(
						v as {
							fields?: Record<
								string,
								{ fieldType?: ConvexValidator; optional?: boolean }
							>;
							value?: Record<
								string,
								{ fieldType?: ConvexValidator; optional?: boolean }
							>;
						}
					).fields ??
					(
						v as {
							value?: Record<
								string,
								{ fieldType?: ConvexValidator; optional?: boolean }
							>;
						}
					).value ??
					{};
				const fieldStrs = Object.entries(fields).map(([k, f]) => {
					const opt = f?.optional ? "?" : "";
					const fieldType = f?.fieldType;
					return `${k}${opt}: ${fieldType != null ? this.formatValidator(fieldType, depth + 1) : "unknown"}`;
				});
				return fieldStrs.length ? `{ ${fieldStrs.join(", ")} }` : "{}";
			}
			case "array": {
				const arr = v as { items?: ConvexValidator; value?: ConvexValidator };
				const items = arr.items ?? arr.value;
				return `${items != null ? this.formatValidator(items, depth) : "unknown"}[]`;
			}
			case "union": {
				const u = v as {
					members?: ConvexValidator[];
					value?: ConvexValidator[];
				};
				const members = u.members ?? (Array.isArray(u.value) ? u.value : []);
				return members
					.map((m) => (m != null ? this.formatValidator(m, depth) : "unknown"))
					.join(" | ");
			}
			case "literal":
				return JSON.stringify((v as { value?: unknown }).value);
			case "id":
				return `Id<"${String((v as { tableName?: string }).tableName ?? "")}">`;
			case "null":
				return "null";
			case "any":
				return "any";
			default:
				return type ?? "unknown";
		}
	}

	private count(fns: ConvexFunctionSpec[], type: ConvexFunctionType): number {
		return fns.filter((f) => f.functionType === type).length;
	}

	private normalizeFunctionSpec(
		raw: RawFunctionEntry,
		index: number,
		warnings: string[],
	): ConvexFunctionSpec {
		const rawType = raw.functionType ?? raw.udfType ?? raw.type ?? "query";
		const functionType = this.normalizeFunctionType(String(rawType));
		const identifier = this.resolveIdentifier(raw, index, functionType);
		if (identifier.startsWith("unresolved:")) {
			warnings.push(`Unresolved function identifier at index ${index}`);
		}

		const rawVis = raw.visibility;
		const visibility =
			rawVis && typeof rawVis === "object" && "kind" in rawVis
				? { kind: (rawVis as { kind: string }).kind as "public" | "internal" }
				: { kind: "public" as const };

		const args = this.parseValidatorField(
			raw.args ?? raw.argsValidator ?? raw.argument ?? raw.arguments,
		);
		const returns = this.parseValidatorField(
			raw.returns ??
				raw.returnValue ??
				raw.returnValidator ??
				raw.returnsValidator,
		);

		const httpMethod =
			typeof raw.method === "string" && raw.method.trim()
				? raw.method.toUpperCase()
				: undefined;
		const httpPath =
			typeof raw.path === "string" && raw.path.trim() ? raw.path : undefined;

		return {
			identifier,
			functionType,
			visibility,
			args,
			returns,
			httpMethod,
			httpPath,
		};
	}

	private parseValidatorField(value: unknown): ConvexFunctionSpec["args"] {
		if (value == null) return null;
		if (typeof value === "object") {
			return this.normalizeValidator(value) as ConvexFunctionSpec["args"];
		}
		if (typeof value === "string") {
			try {
				const parsed = JSON.parse(value) as unknown;
				return parsed && typeof parsed === "object"
					? (this.normalizeValidator(parsed) as ConvexFunctionSpec["args"])
					: null;
			} catch {
				return null;
			}
		}
		return null;
	}

	private normalizeFunctionType(s: string): ConvexFunctionType {
		const lower = s.toLowerCase();
		if (lower === "httpaction" || lower === "http_action") {
			return "httpAction";
		}
		if (lower === "query" || lower === "mutation" || lower === "action") {
			return lower as ConvexFunctionType;
		}
		if (s === "Query" || s === "Mutation" || s === "Action") {
			return s.toLowerCase() as ConvexFunctionType;
		}
		return "query";
	}

	private resolveIdentifier(
		raw: RawFunctionEntry,
		index: number,
		functionType: ConvexFunctionType,
	): string {
		const candidates = [
			raw.identifier,
			raw.name,
			raw.udfPath,
			raw.canonicalName,
		];
		for (const candidate of candidates) {
			if (typeof candidate === "string" && candidate.trim()) {
				return candidate;
			}
		}
		if (functionType === "httpAction") {
			const method =
				typeof raw.method === "string" && raw.method.trim()
					? raw.method.toUpperCase()
					: "GET";
			const path =
				typeof raw.path === "string" && raw.path.trim() ? raw.path : "/";
			return `http:${method} ${path}`;
		}
		return `unresolved:${index}`;
	}

	private normalizeValidator(value: unknown): unknown {
		if (!value || typeof value !== "object") return value;
		if (Array.isArray(value)) {
			return value.map((entry) => this.normalizeValidator(entry));
		}
		const obj = value as Record<string, unknown>;
		const type = obj.type;
		if (type === "object") {
			const fields = obj.fields ?? obj.value;
			const normalizedFields: Record<string, unknown> = {};
			if (fields && typeof fields === "object") {
				for (const [key, field] of Object.entries(
					fields as Record<string, unknown>,
				)) {
					const f = field as Record<string, unknown>;
					normalizedFields[key] = {
						optional: Boolean(f?.optional),
						fieldType: this.normalizeValidator(f?.fieldType),
					};
				}
			}
			return {
				...obj,
				fields: normalizedFields,
			};
		}
		if (type === "array" || type === "set") {
			const itemValidator = obj.items ?? obj.value;
			return {
				...obj,
				items: this.normalizeValidator(itemValidator),
			};
		}
		if (type === "map") {
			return {
				...obj,
				keys: this.normalizeValidator(obj.keys),
				values: this.normalizeValidator(obj.values),
			};
		}
		if (type === "record") {
			const values = obj.values as Record<string, unknown> | undefined;
			return {
				...obj,
				keys: this.normalizeValidator(obj.keys),
				values: values
					? {
							...values,
							fieldType: this.normalizeValidator(values.fieldType),
						}
					: values,
			};
		}
		if (type === "union") {
			const memberList = Array.isArray(obj.members)
				? obj.members
				: Array.isArray(obj.value)
					? obj.value
					: [];
			return {
				...obj,
				members: memberList.map((m) => this.normalizeValidator(m)),
			};
		}
		return obj;
	}

	private validateRawOutput(raw: unknown): { functions: RawFunctionEntry[] } {
		if (!raw || typeof raw !== "object") {
			throw new Error("function-spec output must be a JSON object");
		}

		const obj = raw as Record<string, unknown>;

		// Handle both formats:
		// 1. { functions: [...] }  — standard
		// 2. [...] — some versions return a bare array
		if (Array.isArray(obj)) {
			return { functions: obj as RawFunctionEntry[] };
		}

		if (!Array.isArray(obj.functions)) {
			throw new Error(
				'Expected function-spec JSON to have a "functions" array. ' +
					"Run `npx convex function-spec` and check the output format.",
			);
		}

		return { functions: obj.functions as RawFunctionEntry[] };
	}
}
