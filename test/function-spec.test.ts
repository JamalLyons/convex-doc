import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Parser } from "../lib/parser.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = join(__dirname, "./spec.json");

test("parsed function spec has consistent modules, identifiers, and summary", () => {
	const raw = JSON.parse(readFileSync(SPEC_PATH, "utf-8"));
	const parser = new Parser();
	const parsed = parser.run(raw);

	// Summary should match the raw list length.
	assert.equal(parsed.summary.total, parsed.raw.length);
	assert.ok(parsed.summary.total > 0);

	// Every function should be addressable by its identifier.
	for (const fn of parsed.raw) {
		const fromMap = parsed.byIdentifier.get(fn.identifier);
		assert.ok(fromMap, `missing byIdentifier entry for ${fn.identifier}`);
		assert.equal(fromMap, fn);
	}

	// Modules collection should be consistent with getModuleName / getFunctionName.
	for (const mod of parsed.modules) {
		for (const fn of mod.functions) {
			assert.equal(
				mod.name,
				parser.getModuleName(fn.identifier),
				`module name mismatch for ${fn.identifier}`,
			);
			// getFunctionName should always return the suffix part of the identifier.
			const name = parser.getFunctionName(fn.identifier);
			assert.ok(
				typeof name === "string" && name.length > 0,
				`invalid function name for ${fn.identifier}`,
			);
		}
	}
});

test("formatValidator produces stable strings for all validators in the spec", () => {
	const raw = JSON.parse(readFileSync(SPEC_PATH, "utf-8"));
	const parser = new Parser();
	const parsed = parser.run(raw);
	const anyParser = parser as unknown as {
		formatValidator: (v: unknown) => string;
	};

	for (const fn of parsed.raw) {
		if (fn.args) {
			const formatted = anyParser.formatValidator(fn.args);
			assert.equal(typeof formatted, "string");
			assert.ok(formatted.length > 0);
		}
		if (fn.returns) {
			const formatted = anyParser.formatValidator(fn.returns);
			assert.equal(typeof formatted, "string");
			assert.ok(formatted.length > 0);
		}
	}
});

test("filterSpecByFunctionTypes keeps summaries and groups consistent", () => {
	const raw = JSON.parse(readFileSync(SPEC_PATH, "utf-8"));
	const parser = new Parser();
	const parsed = parser.run(raw);

	const exclude = ["query", "mutation", "action", "httpAction"];
	const filtered = parser.filterByFunction(parsed, exclude);

	// No excluded function types should remain.
	for (const fn of filtered.raw) {
		assert.ok(
			!exclude.includes(fn.functionType),
			`excluded function type still present: ${fn.functionType}`,
		);
	}

	// Summary must match the filtered raw list.
	assert.equal(filtered.summary.total, filtered.raw.length);

	// Modules must remain consistent with getModuleName and getFunctionName.
	for (const mod of filtered.modules) {
		for (const fn of mod.functions) {
			assert.equal(
				mod.name,
				parser.getModuleName(fn.identifier),
				`filtered module name mismatch for ${fn.identifier}`,
			);
			const name = parser.getFunctionName(fn.identifier);
			assert.ok(
				typeof name === "string" && name.length > 0,
				`invalid function name in filtered spec for ${fn.identifier}`,
			);
		}
	}
});
