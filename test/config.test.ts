import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { resolveAppConfig } from "../lib/config.ts";

test("resolveAppConfig reads defaults from convexdoc.config.json", () => {
	const dir = mkdtempSync(join(tmpdir(), "convexdoc-config-"));
	try {
		writeFileSync(
			join(dir, "convexdoc.config.json"),
			JSON.stringify(
				{
					projectDir: ".",
					serverPort: 4311,
					httpActionDeployUrl: "http://localhost:9999",
					verboseLogs: true,
				},
				null,
				2,
			),
		);
		const config = resolveAppConfig({ cwd: dir });
		assert.equal(config.serverPort, 4311);
		assert.equal(config.httpActionDeployUrl, "http://localhost:9999");
		assert.equal(config.verboseLogs, true);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("resolveAppConfig gives CLI options highest precedence", () => {
	const dir = mkdtempSync(join(tmpdir(), "convexdoc-config-"));
	try {
		writeFileSync(
			join(dir, "convexdoc.config.json"),
			JSON.stringify({ serverPort: 3001 }, null, 2),
		);
		const config = resolveAppConfig({ cwd: dir, serverPort: 4500 });
		assert.equal(config.serverPort, 4500);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
