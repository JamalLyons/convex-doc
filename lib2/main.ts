#!/usr/bin/env node

import { Cli } from "./cli";

async function main() {
	await new Cli().run();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

process.on("unhandledRejection", (e) => {
	console.error(e);
});

process.on("uncaughtException", (e) => {
	console.error(e);
	process.exit(1);
});
