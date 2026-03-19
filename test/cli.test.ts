import { test, describe, mock, before, after } from "node:test";
import assert from "node:assert";
import { Cli } from "../lib/cli.js";

// Basic mocking strategy since commander directly parses process.argv
describe("CLI Commands", () => {
	let originalExit: typeof process.exit;
	let originalArgv: string[];

	before(() => {
		originalExit = process.exit;
		originalArgv = process.argv;
		process.exit = (() => {}) as unknown as typeof process.exit;
	});

	after(() => {
		process.exit = originalExit;
		process.argv = originalArgv;
	});

	test("can instantiate cli", () => {
		const cli = new Cli();
		assert.ok(cli);
	});

	// For an extensive test of each command, we would typically call cli['cli'].parseAsync
	// and mock the commands' .run() methods. But since this is a unit test, we can verify
	// the correct setup by accessing the cli structure if needed or running with help.
	test("spec command exists", async () => {
		const cli = new Cli() as any;
		cli.specCommandBuilder();
		const specCmd = cli.cli.commands.find((c: any) => c.name() === "spec");
		assert.ok(specCmd);
		assert.strictEqual(specCmd.description(), "Fetch and display the function spec from your Convex deployment");
	});

	test("export command exists", async () => {
		const cli = new Cli() as any;
		cli.exportCommandBuilder();
		const exportCmd = cli.cli.commands.find((c: any) => c.name() === "export");
		assert.ok(exportCmd);
	});

	test("init command exists", async () => {
		const cli = new Cli() as any;
		cli.initCommandBuilder();
		const initCmd = cli.cli.commands.find((c: any) => c.name() === "init");
		assert.ok(initCmd);
	});

	test("generate command exists", async () => {
		const cli = new Cli() as any;
		cli.generateCommandBuilder();
		const genCmd = cli.cli.commands.find((c: any) => c.name() === "generate");
		assert.ok(genCmd);
	});

	test("serve command exists", async () => {
		const cli = new Cli() as any;
		cli.serveCommandBuilder();
		const serveCmd = cli.cli.commands.find((c: any) => c.name() === "serve");
		assert.ok(serveCmd);
	});

	test("start command exists", async () => {
		const cli = new Cli() as any;
		cli.startCommandBuilder();
		const command = cli.cli.commands.find((c: any) => c.name() === "start");
		assert.ok(command);
	});
});
