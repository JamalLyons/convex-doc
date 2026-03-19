import { test, describe } from "node:test";
import assert from "node:assert";
import { Parser } from "../lib/parser.js";

describe("JSON parsing validation", () => {
	const parser = new Parser();

	test("parses valid array raw output", () => {
		const raw = [
			{
				identifier: "myModule:myQuery",
				functionType: "query",
				visibility: { kind: "public" }
			}
		];
		const parsed = parser.run(raw);
		assert.strictEqual(parsed.modules.length, 1);
		assert.strictEqual(parsed.modules[0].name, "myModule");
		assert.strictEqual(parsed.summary.total, 1);
		assert.strictEqual(parsed.summary.queries, 1);
	});

	test("parses object wrapper raw output", () => {
		const raw = {
			functions: [
				{
					identifier: "user:create",
					functionType: "mutation"
				}
			]
		};
		// This requires assertFunctionSpecOutput from types.ts to succeed if functions is present
		// Depending on `assertFunctionSpecOutput` implementation, it should pass.
		const parsed = parser.run(raw);
		assert.strictEqual(parsed.modules.length, 1);
		assert.strictEqual(parsed.modules[0].name, "user");
		assert.strictEqual(parsed.summary.mutations, 1);
	});

	test("throws error on invalid json output", () => {
		const raw = { incorrectKey: [] };
		assert.throws(() => {
			parser.run(raw);
		}, /Expected function-spec JSON to have a "functions" array/);
	});
});

describe("Parser logic", () => {
	const parser = new Parser();

	test("groups by module correctly", () => {
		const raw = [
			{ identifier: "users:get", functionType: "query" },
			{ identifier: "users:create", functionType: "mutation" },
			{ identifier: "posts:get", functionType: "query" },
		];
		const parsed = parser.run(raw);
		
		assert.strictEqual(parsed.modules.length, 2);
		const userMod = parsed.modules.find(m => m.name === "users");
		assert.ok(userMod);
		assert.strictEqual(userMod.functions.length, 2);
		
		const postMod = parsed.modules.find(m => m.name === "posts");
		assert.ok(postMod);
		assert.strictEqual(postMod.functions.length, 1);
	});

	test("counts summary correctly", () => {
		const raw = [
			{ identifier: "a:1", functionType: "query", visibility: { kind: "public" } },
			{ identifier: "a:2", functionType: "mutation", visibility: { kind: "internal" } },
			{ identifier: "a:3", functionType: "action" }, // defaults to public
			{ identifier: "a:4", functionType: "httpAction" }, // defaults to public
		];
		const parsed = parser.run(raw);
		
		assert.strictEqual(parsed.summary.total, 4);
		assert.strictEqual(parsed.summary.queries, 1);
		assert.strictEqual(parsed.summary.mutations, 1);
		assert.strictEqual(parsed.summary.actions, 1);
		assert.strictEqual(parsed.summary.httpActions, 1);
		// Assuming unknown defaults to public
		assert.strictEqual(parsed.summary.internal, 1);
		assert.strictEqual(parsed.summary.public, 3);
	});
});
