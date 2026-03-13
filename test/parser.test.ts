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

import assert from "node:assert/strict";
import test from "node:test";
import { type ParsedFunctionSpec, Parser } from "../lib/parser.ts";

function parseFunctionSpec(raw: unknown): ParsedFunctionSpec {
	const parser = new Parser();
	return parser.run(raw);
}

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

test("parser normalizes object validators that use value fields", () => {
	const parsed = parseFunctionSpec({
		functions: [
			{
				identifier: "tasks:createTask",
				functionType: "mutation",
				args: {
					type: "object",
					value: {
						title: {
							optional: true,
							fieldType: { type: "string" },
						},
					},
				},
				returns: { type: "any" },
				visibility: { kind: "public" },
			},
		],
	});
	const fn = parsed.raw[0];
	assert.equal(fn?.args?.type, "object");
	assert.ok("fields" in (fn?.args ?? {}));
});

test("parser derives stable http identifier from method/path", () => {
	const parsed = parseFunctionSpec({
		functions: [
			{
				functionType: "HttpAction",
				method: "GET",
				path: "/task",
			},
		],
	});
	assert.equal(parsed.raw[0]?.identifier, "http:GET /task");
	assert.equal(parsed.modules[0]?.name, "http");
});
