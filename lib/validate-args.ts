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
OUT OF OR IN CONNECTION WITH THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---------------------------------------------------------------------------*/

import type {
	ArrayValidator,
	ConvexValidator,
	ObjectValidator,
	RecordValidator,
	UnionValidator,
} from "./types.js";
import { isConvexValidator } from "./types.js";

export type ValidateArgsResult =
	| { valid: true }
	| { valid: false; error: string };

/**
 * Pre-flight validation: check a value against a Convex argument schema (e.g. from
 * the manifest). Uses Typia to ensure the schema is a valid ConvexValidator, then
 * recursively validates the value. Returns { valid: true } or { valid: false, error }.
 */
export function validateArgsAgainstSchema(
	validator: unknown,
	value: unknown,
	path: string = "args",
): ValidateArgsResult {
	if (validator == null || typeof validator !== "object")
		return { valid: true };
	if (!isConvexValidator(validator)) return { valid: true }; // Malformed schema: skip validation

	const v = validator as ConvexValidator;
	const type = v.type;

	if (type === "any") return { valid: true };

	if (type === "object") {
		const objValidator = v as ObjectValidator;
		const rawFields = objValidator.fields ?? objValidator.value ?? {};
		if (value === null || typeof value !== "object" || Array.isArray(value)) {
			return {
				valid: false,
				error: `${path}: expected an object, got ${typeof value}`,
			};
		}
		const obj = value as Record<string, unknown>;
		for (const [key, field] of Object.entries(rawFields)) {
			const optional = field.optional === true;
			const fieldVal = obj[key];
			if (fieldVal === undefined) {
				if (!optional) {
					return {
						valid: false,
						error: `${path}.${key}: required field missing`,
					};
				}
				continue;
			}
			const result = validateArgsAgainstSchema(
				field.fieldType,
				fieldVal,
				`${path}.${key}`,
			);
			if (!result.valid) return result;
		}
		return { valid: true };
	}

	if (type === "array") {
		const arrValidator = v as ArrayValidator;
		if (!Array.isArray(value)) {
			return {
				valid: false,
				error: `${path}: expected an array, got ${typeof value}`,
			};
		}
		for (let i = 0; i < value.length; i++) {
			const result = validateArgsAgainstSchema(
				arrValidator.items,
				value[i],
				`${path}[${i}]`,
			);
			if (!result.valid) return result;
		}
		return { valid: true };
	}

	if (type === "record") {
		const recValidator = v as RecordValidator;
		if (value === null || typeof value !== "object" || Array.isArray(value)) {
			return {
				valid: false,
				error: `${path}: expected an object (record), got ${typeof value}`,
			};
		}
		const obj = value as Record<string, unknown>;
		const valueFieldType = recValidator.values?.fieldType;
		if (valueFieldType) {
			for (const [k, val] of Object.entries(obj)) {
				const result = validateArgsAgainstSchema(
					valueFieldType,
					val,
					`${path}.${k}`,
				);
				if (!result.valid) return result;
			}
		}
		return { valid: true };
	}

	if (type === "union") {
		const unionValidator = v as UnionValidator;
		const members = unionValidator.members ?? [];
		for (const member of members) {
			const result = validateArgsAgainstSchema(member, value, path);
			if (result.valid) return { valid: true };
		}
		return {
			valid: false,
			error: `${path}: value does not match any union member (e.g. expected type mismatch)`,
		};
	}

	if (type === "string" || type === "id" || type === "bytes") {
		if (typeof value !== "string") {
			return {
				valid: false,
				error: `${path}: expected string, got ${typeof value}`,
			};
		}
		return { valid: true };
	}

	// number, float64; int64 may appear in manifest from Convex even if not in ConvexValidator union
	if (type === "number" || type === "float64" || (type as string) === "int64") {
		if (typeof value !== "number" || Number.isNaN(value)) {
			return {
				valid: false,
				error: `${path}: expected number, got ${typeof value}`,
			};
		}
		return { valid: true };
	}

	if (type === "boolean") {
		if (typeof value !== "boolean") {
			return {
				valid: false,
				error: `${path}: expected boolean, got ${typeof value}`,
			};
		}
		return { valid: true };
	}

	if (type === "null") {
		if (value !== null) {
			return {
				valid: false,
				error: `${path}: expected null, got ${typeof value}`,
			};
		}
		return { valid: true };
	}

	if (type === "literal") {
		const expected = (v as { value: unknown }).value;
		if (value !== expected) {
			return {
				valid: false,
				error: `${path}: expected literal ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`,
			};
		}
		return { valid: true };
	}

	return { valid: true };
}
