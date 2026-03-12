import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CliConfig } from "../lib/config.ts";

test("CliConfig reads defaults from convexdoc.config.json", () => {
	const dir = mkdtempSync(join(tmpdir(), "convexdoc-config-"));
	try {
		writeFileSync(
			join(dir, "convexdoc.config.json"),
			JSON.stringify(
				{
					projectDir: ".",
					docsDir: "docs",
					serverPort: 4311,
					httpActionDeployUrl: "http://localhost:9999",
					deploymentUrl: "https://from-config.convex.cloud",
					verboseLogs: true,
					customization: {
						theme: { accent: "#8b5cf6" },
						modules: {
							tasks: { description: "Task module docs" },
						},
					},
				},
				null,
				2,
			),
		);
		const config = new CliConfig({ cwd: dir }).resolve();
		assert.equal(config.serverPort, 4311);
		assert.equal(config.docsDir, join(dir, "docs"));
		assert.equal(config.httpActionDeployUrl, "http://localhost:9999");
		assert.equal(config.deploymentUrl, "https://from-config.convex.cloud");
		assert.equal(config.verboseLogs, true);
		assert.equal(config.customization.theme?.accent, "#8b5cf6");
		assert.equal(
			config.customization.modules?.tasks?.description,
			"Task module docs",
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("CliConfig gives CLI options highest precedence", () => {
	const dir = mkdtempSync(join(tmpdir(), "convexdoc-config-"));
	try {
		writeFileSync(
			join(dir, "convexdoc.config.json"),
			JSON.stringify({ serverPort: 3001 }, null, 2),
		);
		const config = new CliConfig({ cwd: dir, serverPort: 4500 }).resolve();
		assert.equal(config.serverPort, 4500);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("CliConfig falls back to env for deploymentUrl", () => {
	const dir = mkdtempSync(join(tmpdir(), "convexdoc-config-"));
	const prev = process.env.CONVEX_URL;
	process.env.CONVEX_URL = "https://from-env.convex.cloud";
	try {
		writeFileSync(
			join(dir, "convexdoc.config.json"),
			JSON.stringify({}, null, 2),
		);
		const config = new CliConfig({ cwd: dir }).resolve();
		assert.equal(config.deploymentUrl, "https://from-env.convex.cloud");
		assert.deepEqual(config.customization, {});
	} finally {
		process.env.CONVEX_URL = prev;
		rmSync(dir, { recursive: true, force: true });
	}
});
