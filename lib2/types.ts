/**
 * Types derived from `npx convex function-spec` output.
 * Mirrors the JSON structure returned by Convex 1.15+
 */

// ─── Validator Types ────────────────────────────────────────────────────────

export type ConvexValidatorType =
	| "null"
	| "number"
	| "bigint"
	| "boolean"
	| "string"
	| "bytes"
	| "any"
	| "literal"
	| "id"
	| "array"
	| "set"
	| "map"
	| "object"
	| "record"
	| "union"
	| "int64"
	| "float64";

export interface ValidatorBase {
	type: ConvexValidatorType;
}

export interface NullValidator extends ValidatorBase {
	type: "null";
}

export interface NumberValidator extends ValidatorBase {
	type: "number" | "float64";
}

export interface BigIntValidator extends ValidatorBase {
	type: "bigint" | "int64";
}

export interface BooleanValidator extends ValidatorBase {
	type: "boolean";
}

export interface StringValidator extends ValidatorBase {
	type: "string";
}

export interface BytesValidator extends ValidatorBase {
	type: "bytes";
}

export interface AnyValidator extends ValidatorBase {
	type: "any";
}

export interface LiteralValidator extends ValidatorBase {
	type: "literal";
	value: string | number | boolean | bigint;
}

export interface IdValidator extends ValidatorBase {
	type: "id";
	tableName: string;
}

export interface ArrayValidator extends ValidatorBase {
	type: "array";
	items: ConvexValidator;
}

export interface SetValidator extends ValidatorBase {
	type: "set";
	items: ConvexValidator;
}

export interface MapValidator extends ValidatorBase {
	type: "map";
	keys: ConvexValidator;
	values: ConvexValidator;
}

export interface ObjectField {
	fieldType: ConvexValidator;
	optional: boolean;
}

export interface ObjectValidator extends ValidatorBase {
	type: "object";
	/**
	 * Canonical internal shape used by ConvexDoc after parse normalization.
	 */
	fields?: Record<string, ObjectField>;
	/**
	 * Raw Convex function-spec shape sometimes uses `value` for object members.
	 */
	value?: Record<string, ObjectField>;
}

export interface RecordValidator extends ValidatorBase {
	type: "record";
	keys: ConvexValidator;
	values: ObjectField;
}

export interface UnionValidator extends ValidatorBase {
	type: "union";
	members: ConvexValidator[];
}

export type ConvexValidator =
	| NullValidator
	| NumberValidator
	| BigIntValidator
	| BooleanValidator
	| StringValidator
	| BytesValidator
	| AnyValidator
	| LiteralValidator
	| IdValidator
	| ArrayValidator
	| SetValidator
	| MapValidator
	| ObjectValidator
	| RecordValidator
	| UnionValidator;

// ─── Function Types ──────────────────────────────────────────────────────────

export type ConvexFunctionType = "query" | "mutation" | "action" | "httpAction";
export type ConvexFunctionVisibility = "public" | "internal";

export interface ConvexFunctionSpec {
	/** Dot-separated path e.g. "users:getById" or "messages:list" */
	identifier: string;
	functionType: ConvexFunctionType;
	visibility: {
		kind: ConvexFunctionVisibility;
	};
	/** Validator for function arguments — null if no args validator defined */
	args: ConvexValidator | null;
	/** Validator for the return value — null if not defined */
	returns: ConvexValidator | null;
	/** Present for HTTP actions in some function-spec outputs. */
	httpMethod?: string;
	/** Present for HTTP actions in some function-spec outputs. */
	httpPath?: string;
}

// ─── Top-level function-spec output ─────────────────────────────────────────

export interface FunctionSpecOutput {
	url?: string;
	functions: Record<string, unknown>[];
}

// ─── Parsed / enriched types for ConvexDoc ──────────────────────────────────

/** A function grouped under its module path */
export interface ConvexModule {
	/** e.g. "users", "messages", "tasks/actions" */
	name: string;
	functions: ConvexFunctionSpec[];
}
