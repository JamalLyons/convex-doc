import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { CliConfig, DEFAULT_CONFIG_FILE } from "../lib/config.js";
import { writeFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import typia from "typia";

describe("Config settings", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `convexdoc-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test("loads default config if no config file exists", () => {
		const config = new CliConfig({ cwd: tempDir }).resolve();
		assert.strictEqual(config.serverPort, 3000);
		assert.strictEqual(config.deploymentEnv, "dev");
		assert.strictEqual(config.disableFunctionRunner, false);
		assert.deepStrictEqual(config.customization, {
			hideConvexDocsLinks: true,
		});
		
		// Ensure default config file is written
		assert.ok(existsSync(join(tempDir, "convexdoc.config.json")));
	});

	test("loads from existing file correctly", () => {
		const configPath = join(tempDir, "convexdoc.config.json");
		const customConfig = {
			...DEFAULT_CONFIG_FILE,
			serverPort: 8080,
			deploymentEnv: "prod",
			verboseLogs: true,
		};
		writeFileSync(configPath, JSON.stringify(customConfig));

		const config = new CliConfig({ cwd: tempDir }).resolve();
		assert.strictEqual(config.serverPort, 8080);
		assert.strictEqual(config.deploymentEnv, "prod");
		assert.strictEqual(config.verboseLogs, true);
	});

	test("json parsing validation allows typia validations to work", () => {
		const configPath = join(tempDir, "convexdoc.config.json");
		const invalidConfig = {
			serverPort: -10, // Invalid port
		};
		writeFileSync(configPath, JSON.stringify(invalidConfig));

		assert.throws(() => {
			new CliConfig({ cwd: tempDir }).resolve();
		}, /Invalid config/);
	});
});
