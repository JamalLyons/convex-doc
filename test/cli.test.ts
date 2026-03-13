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
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Command } from "../lib/cmd/mod.ts";

class TestCommand extends Command {
	public parse(stdout: string) {
		return this.parseFunctionSpecOutput(stdout);
	}

	public ensureProject(dir: string) {
		this.ensureConvexProject(dir);
	}

	// Unused but required by the abstract base.
	public async run(): Promise<unknown> {
		return undefined;
	}
}

test("Command.parseFunctionSpecOutput handles bare array output", () => {
	const cmd = new TestCommand();
	const json = JSON.stringify([
		{ identifier: "tasks:get", functionType: "query" },
	]);
	const parsed = cmd.parse(json);
	assert.equal(parsed.functions.length, 1);
	assert.equal(parsed.functions[0]?.identifier, "tasks:get");
});

test("Command.parseFunctionSpecOutput handles object with functions field", () => {
	const cmd = new TestCommand();
	const json = JSON.stringify({
		functions: [{ identifier: "tasks:create", functionType: "mutation" }],
	});
	const parsed = cmd.parse(json);
	assert.equal(parsed.functions.length, 1);
	assert.equal(parsed.functions[0]?.identifier, "tasks:create");
});

test("Command.ensureConvexProject passes when convex dir exists", () => {
	const cmd = new TestCommand();
	const dir = mkdtempSync(join(tmpdir(), "convexdoc-cli-"));
	try {
		mkdirSync(join(dir, "convex"), { recursive: true });
		assert.doesNotThrow(() => cmd.ensureProject(dir));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("Command.ensureConvexProject throws when no convex dir or env files", () => {
	const cmd = new TestCommand();
	const dir = mkdtempSync(join(tmpdir(), "convexdoc-cli-"));
	try {
		assert.throws(() => cmd.ensureProject(dir), /No Convex project found/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
