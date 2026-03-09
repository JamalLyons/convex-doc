import type {
	ConvexFunctionSpec,
	ConvexFunctionType,
	ConvexModule,
	ConvexValidator,
	ParsedFunctionSpec,
} from "./function-spec.js";

/**
 * Parses raw JSON from `npx convex function-spec` into a structured
 * ConvexDoc-friendly format.
 */
export function parseFunctionSpec(raw: unknown): ParsedFunctionSpec {
	const output = validateRawOutput(raw);
	const warnings: string[] = [];
	const functions = output.functions.map((entry, index) =>
		normalizeFunctionSpec(entry, index, warnings),
	);

	// Group by module (the part before the colon in "module:functionName")
	const moduleMap = new Map<string, ConvexFunctionSpec[]>();

	for (const fn of functions) {
		const moduleName = getModuleName(fn.identifier);
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
				getFunctionName(a.identifier).localeCompare(
					getFunctionName(b.identifier),
				),
			),
		}));

	const byIdentifier = new Map(functions.map((fn) => [fn.identifier, fn]));

	const summary = {
		total: functions.length,
		queries: count(functions, "query"),
		mutations: count(functions, "mutation"),
		actions: count(functions, "action"),
		httpActions: count(functions, "httpAction"),
		internal: functions.filter((f) => f.visibility.kind === "internal").length,
		public: functions.filter((f) => f.visibility.kind === "public").length,
	};

	return { raw: functions, modules, byIdentifier, summary, warnings };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extracts the module name from a function identifier.
 * "users:getById"   → "users"
 * "tasks/actions:create" → "tasks/actions"
 * "tasks.js:getTask" → "tasks"
 * "myFunction"       → "(root)"
 */
export function getModuleName(identifier: string | undefined): string {
	if (identifier == null || typeof identifier !== "string") return "(root)";
	if (identifier.startsWith("unresolved:")) return "unresolved";
	const colonIdx = identifier.lastIndexOf(":");
	let mod = colonIdx === -1 ? "(root)" : identifier.slice(0, colonIdx);

	// Strip .js or .ts extension from module name
	if (mod.endsWith(".js")) {
		mod = mod.slice(0, -3);
	} else if (mod.endsWith(".ts")) {
		mod = mod.slice(0, -3);
	}
	// Fallback for default httpAction grouping
	if (colonIdx === -1 && identifier.includes("httpAction")) {
		mod = "http";
	}
	return mod;
}

/**
 * Extracts just the function name from an identifier.
 * "users:getById" → "getById"
 */
export function getFunctionName(identifier: string | undefined): string {
	if (identifier == null || typeof identifier !== "string") return "(unknown)";
	const colonIdx = identifier.lastIndexOf(":");
	return colonIdx === -1 ? identifier : identifier.slice(colonIdx + 1);
}

/**
 * Compact single-line representation of a Convex validator for CLI or HTML display.
 */
export function formatValidator(v: ConvexValidator, depth = 0): string {
	const type = v.type;
	switch (type) {
		case "object": {
			if (depth > 1) return "{ ... }";
			const fields =
				(
					v as {
						fields?: Record<
							string,
							{ fieldType: ConvexValidator; optional: boolean }
						>;
					}
				).fields ?? {};
			const fieldStrs = Object.entries(fields).map(([k, f]) => {
				const opt = f.optional ? "?" : "";
				return `${k}${opt}: ${formatValidator(f.fieldType, depth + 1)}`;
			});
			return fieldStrs.length ? `{ ${fieldStrs.join(", ")} }` : "{}";
		}
		case "array":
			return `${formatValidator((v as { items: ConvexValidator }).items, depth)}[]`;
		case "union":
			return ((v as { members: ConvexValidator[] }).members ?? [])
				.map((m) => formatValidator(m, depth))
				.join(" | ");
		case "literal":
			return JSON.stringify((v as { value: unknown }).value);
		case "id":
			return `Id<"${(v as { tableName: string }).tableName}">`;
		case "null":
			return "null";
		case "any":
			return "any";
		default:
			return type ?? "unknown";
	}
}

function count(fns: ConvexFunctionSpec[], type: ConvexFunctionType): number {
	return fns.filter((f) => f.functionType === type).length;
}

/** Raw function entry from convex function-spec (may use different key names). */
type RawFunctionEntry = Record<string, unknown>;

function normalizeFunctionSpec(
	raw: RawFunctionEntry,
	index: number,
	warnings: string[],
): ConvexFunctionSpec {
	const identifier = resolveIdentifier(raw, index);
	if (identifier.startsWith("unresolved:")) {
		warnings.push(`Unresolved function identifier at index ${index}`);
	}

	const rawType = raw.functionType ?? raw.udfType ?? raw.type ?? "query";
	const functionType = normalizeFunctionType(String(rawType));

	const rawVis = raw.visibility;
	const visibility =
		rawVis && typeof rawVis === "object" && "kind" in rawVis
			? { kind: (rawVis as { kind: string }).kind as "public" | "internal" }
			: { kind: "public" as const };

	const args = parseValidatorField(
		raw.args ?? raw.argsValidator ?? raw.argument ?? raw.arguments,
	);
	const returns = parseValidatorField(
		raw.returns ?? raw.returnValue ?? raw.returnValidator ?? raw.returnsValidator,
	);

	return {
		identifier,
		functionType,
		visibility,
		args,
		returns,
	};
}

function parseValidatorField(value: unknown): ConvexFunctionSpec["args"] {
	if (value == null) return null;
	if (typeof value === "object") return value as ConvexFunctionSpec["args"];
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value) as unknown;
			return parsed && typeof parsed === "object"
				? (parsed as ConvexFunctionSpec["args"])
				: null;
		} catch {
			return null;
		}
	}
	return null;
}

function normalizeFunctionType(s: string): ConvexFunctionType {
	const lower = s.toLowerCase();
	if (lower === "httpaction" || lower === "http_action") {
		return "httpAction";
	}
	if (
		lower === "query" ||
		lower === "mutation" ||
		lower === "action"
	) {
		return lower as ConvexFunctionType;
	}
	if (s === "Query" || s === "Mutation" || s === "Action") {
		return s.toLowerCase() as ConvexFunctionType;
	}
	return "query";
}

function resolveIdentifier(raw: RawFunctionEntry, index: number): string {
	const candidates = [
		raw.identifier,
		raw.name,
		raw.path,
		raw.udfPath,
		raw.canonicalName,
	];
	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.trim()) {
			return candidate;
		}
	}
	return `unresolved:${index}`;
}

function validateRawOutput(raw: unknown): { functions: RawFunctionEntry[] } {
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
