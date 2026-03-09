import assert from "node:assert/strict";
import test from "node:test";
import { parseFunctionSpec } from "../lib/parser.ts";

test("parser groups unresolved identifiers under unresolved module", () => {
	const parsed = parseFunctionSpec({
		functions: [
			{
				functionType: "query",
				visibility: { kind: "public" },
				args: { type: "object", fields: {} },
				returns: { type: "null" },
			},
		],
	});
	assert.equal(parsed.modules[0]?.name, "unresolved");
	assert.equal(parsed.raw[0]?.identifier, "unresolved:0");
	assert.ok(parsed.warnings?.length);
});

test("parser normalizes httpAction variants and alternate validator keys", () => {
	const parsed = parseFunctionSpec({
		functions: [
			{
				identifier: "http:handler",
				functionType: "http_action",
				visibility: { kind: "internal" },
				argsValidator: { type: "object", fields: {} },
				returnsValidator: { type: "string" },
			},
		],
	});
	const fn = parsed.raw[0];
	assert.equal(fn?.functionType, "httpAction");
	assert.equal(fn?.visibility.kind, "internal");
	assert.equal(fn?.args?.type, "object");
	assert.equal(fn?.returns?.type, "string");
});
