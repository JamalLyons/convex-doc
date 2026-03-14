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

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

---------------------------------------------------------------------------*/

import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_CONFIG_FILE } from "../config.js";
import { Command } from "./mod.js";

export interface InitOptions {
	/** Directory in which to create convexdoc.config.json. Defaults to cwd. */
	projectDir?: string;
	/** Overwrite existing config file. */
	force?: boolean;
}

export class InitCommand extends Command {
	public async run(opts: InitOptions = {}): Promise<void> {
		const dir = resolve(opts.projectDir ?? process.cwd());
		const configPath = join(dir, "convexdoc.config.json");

		if (existsSync(configPath) && !opts.force) {
			throw new Error(
				`Config already exists at ${configPath}. Use --force to overwrite.`,
			);
		}

		writeFileSync(
			configPath,
			JSON.stringify(DEFAULT_CONFIG_FILE, null, 2),
			"utf-8",
		);
	}
}
