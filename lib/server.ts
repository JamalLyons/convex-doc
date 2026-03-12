import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { join, normalize } from "node:path";
import chalk from "chalk";

export interface RunRequestBody {
	functionType: "query" | "mutation" | "action";
	path: string;
	args?: Record<string, unknown>;
	bearerToken?: string;
}

export interface DocsServerOptions {
	docsDir: string;
	port: number;
	verboseLogs?: boolean;
	deploymentUrl?: string;
	authToken?: string;
	disableFunctionRunner?: boolean;
}

export class DocsServer {
	public constructor(private readonly options: DocsServerOptions) {}

	public async run(): Promise<void> {
		const { port } = this.options;

		const server = createServer(async (req, res) => {
			const { log, logEnd } = this.createLoggers(req);

			try {
				if (!this.isLocalhostRequest(req.headers.host)) {
					this.sendForbidden(res);
					logEnd(403);
					return;
				}

				const url = new URL(
					req.url ?? "/",
					`http://${req.headers.host ?? "localhost"}`,
				);
				const pathname = decodeURIComponent(url.pathname);

				const handled = await this.handleRoute(pathname, req, res, log, logEnd);
				if (!handled) {
					await this.serveStatic(pathname, res, logEnd);
				}
			} catch (err: unknown) {
				this.sendError(res, err);
				logEnd(500);
			}
		});

		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(port, "127.0.0.1", () => resolve());
		});

		await new Promise<void>(() => {});
	}

	private createLoggers(req: import("node:http").IncomingMessage): {
		log: (message: string) => void;
		logEnd: (status: number) => void;
	} {
		const { verboseLogs = false } = this.options;
		const reqStart = Date.now();
		const requestId = Math.random().toString(36).slice(2, 8);
		const reqMethod = req.method ?? "GET";
		const reqPath = req.url ?? "/";

		const log = (message: string) => {
			if (!verboseLogs) return;
			console.log(chalk.dim(`[convexdoc:${requestId}] `) + message);
		};

		const logEnd = (status: number) => {
			const duration = Date.now() - reqStart;
			const methodColor = chalk.magentaBright;
			const pathColor = chalk.blue;
			const arrow = chalk.dim("->");
			const durationText = chalk.dim(`(${duration}ms)`);

			let statusColor: (s: string) => string = chalk.white;
			if (status >= 500) statusColor = chalk.red;
			else if (status >= 400) statusColor = chalk.yellow;
			else if (status >= 300) statusColor = chalk.cyan;
			else if (status >= 200) statusColor = chalk.green;

			console.log(
				chalk.dim("[convexdoc]"),
				methodColor(reqMethod),
				pathColor(reqPath),
				arrow,
				statusColor(String(status)),
				durationText,
			);
		};

		return { log, logEnd };
	}

	private async handleRoute(
		pathname: string,
		req: import("node:http").IncomingMessage,
		res: import("node:http").ServerResponse,
		log: (message: string) => void,
		logEnd: (status: number) => void,
	): Promise<boolean> {
		if (pathname === "/__convexdoc/run" && req.method === "POST") {
			await this.handleRunRequest(req, res, log, logEnd);
			return true;
		}

		if (pathname === "/__convexdoc/manifest" && req.method === "GET") {
			this.handleManifestRequest(res, logEnd);
			return true;
		}

		return false;
	}

	private async handleRunRequest(
		req: import("node:http").IncomingMessage,
		res: import("node:http").ServerResponse,
		log: (message: string) => void,
		logEnd: (status: number) => void,
	): Promise<void> {
		const {
			deploymentUrl,
			authToken,
			disableFunctionRunner = false,
		} = this.options;

		if (disableFunctionRunner) {
			console.log(
				chalk.yellow(
					"[convexdoc] Function runner is disabled; request rejected.",
				),
			);
			res.statusCode = 403;
			res.setHeader("content-type", "application/json; charset=utf-8");
			res.end(
				JSON.stringify({
					status: "error",
					errorMessage: "Function runner is disabled.",
				}),
			);
			logEnd(403);
			return;
		}

		const body = (await this.readJsonBody(
			req,
		)) as Partial<RunRequestBody> | null;
		if (!body || typeof body !== "object") {
			res.statusCode = 400;
			res.setHeader("content-type", "application/json; charset=utf-8");
			res.end(
				JSON.stringify({
					status: "error",
					errorMessage: "Invalid JSON body",
				}),
			);
			logEnd(400);
			return;
		}

		const functionType = body.functionType;
		const path = body.path;
		const args = body.args ?? {};

		if (
			(functionType !== "query" &&
				functionType !== "mutation" &&
				functionType !== "action") ||
			typeof path !== "string" ||
			!path
		) {
			res.statusCode = 400;
			res.setHeader("content-type", "application/json; charset=utf-8");
			res.end(
				JSON.stringify({
					status: "error",
					errorMessage: "Body must include { functionType, path }",
				}),
			);
			logEnd(400);
			return;
		}

		const convexUrl = deploymentUrl ?? process.env.CONVEX_URL;
		if (!convexUrl) {
			res.statusCode = 500;
			res.setHeader("content-type", "application/json; charset=utf-8");
			res.end(
				JSON.stringify({
					status: "error",
					errorMessage:
						"CONVEX_URL is not set. Run from a configured Convex project or export CONVEX_URL.",
				}),
			);
			logEnd(500);
			return;
		}

		const endpoint = new URL(`/api/${functionType}`, convexUrl).toString();
		const headers: Record<string, string> = {
			"content-type": "application/json",
		};
		const tokenFromConfig = authToken ?? process.env.CONVEXDOC_AUTH_TOKEN;
		if (body.bearerToken) {
			headers.authorization = `Bearer ${body.bearerToken}`;
		} else if (tokenFromConfig) {
			headers.authorization = `Bearer ${tokenFromConfig}`;
		}

		const t0 = Date.now();
		log(`${chalk.dim("proxy ->")} ${chalk.cyan(endpoint)}`);
		const upstream = await fetch(endpoint, {
			method: "POST",
			headers,
			body: JSON.stringify({ path, args, format: "json" }),
		});
		const text = await upstream.text();
		const dtMs = Date.now() - t0;

		res.statusCode = upstream.status;
		res.setHeader(
			"content-type",
			upstream.headers.get("content-type") ?? "application/json",
		);
		res.setHeader("x-convexdoc-duration-ms", String(dtMs));
		res.end(text);
		logEnd(upstream.status);
	}

	private handleManifestRequest(
		res: import("node:http").ServerResponse,
		logEnd: (status: number) => void,
	): void {
		const { docsDir } = this.options;
		const manifestPath = join(docsDir, "convexdoc.manifest.json");
		if (!existsSync(manifestPath)) {
			res.statusCode = 404;
			res.setHeader("content-type", "application/json; charset=utf-8");
			res.end(
				JSON.stringify({
					status: "error",
					errorMessage: "Manifest not found",
				}),
			);
			logEnd(404);
			return;
		}
		res.statusCode = 200;
		res.setHeader("content-type", "application/json; charset=utf-8");
		createReadStream(manifestPath).pipe(res);
		logEnd(200);
	}

	private async serveStatic(
		pathname: string,
		res: import("node:http").ServerResponse,
		logEnd: (status: number) => void,
	): Promise<void> {
		const { docsDir } = this.options;

		const relPath =
			pathname === "/"
				? "index.html"
				: pathname.endsWith("/")
					? `${pathname}index.html`
					: pathname;
		const safeRel = normalize(relPath)
			.replace(/^(\.\.(\/|\\|$))+/, "")
			.replace(/^[/\\]+/, "");
		let filePath = join(docsDir, safeRel);

		if (
			!existsSync(filePath) &&
			!pathname.endsWith("/") &&
			!pathname.includes(".")
		) {
			filePath = `${filePath}.html`;
		}

		if (!existsSync(filePath)) {
			res.statusCode = 404;
			res.setHeader("content-type", "text/plain; charset=utf-8");
			res.end("Not found");
			logEnd(404);
			return;
		}

		const st = statSync(filePath);
		if (!st.isFile()) {
			res.statusCode = 404;
			res.setHeader("content-type", "text/plain; charset=utf-8");
			res.end("Not found");
			logEnd(404);
			return;
		}

		res.statusCode = 200;
		res.setHeader("content-type", this.contentTypeForPath(filePath));
		createReadStream(filePath).pipe(res);
		logEnd(200);
	}

	private sendForbidden(res: import("node:http").ServerResponse): void {
		res.statusCode = 403;
		res.setHeader("content-type", "text/plain; charset=utf-8");
		res.end("Forbidden");
	}

	private sendError(
		res: import("node:http").ServerResponse,
		err: unknown,
	): void {
		res.statusCode = 500;
		res.setHeader("content-type", "application/json; charset=utf-8");
		res.end(
			JSON.stringify({
				status: "error",
				errorMessage: (err as Error).message ?? String(err),
			}),
		);
	}

	private contentTypeForPath(p: string): string {
		if (p.endsWith(".html")) return "text/html; charset=utf-8";
		if (p.endsWith(".css")) return "text/css; charset=utf-8";
		if (p.endsWith(".js")) return "text/javascript; charset=utf-8";
		if (p.endsWith(".json")) return "application/json; charset=utf-8";
		if (p.endsWith(".svg")) return "image/svg+xml";
		if (p.endsWith(".png")) return "image/png";
		if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
		if (p.endsWith(".ico")) return "image/x-icon";
		return "application/octet-stream";
	}

	private isLocalhostRequest(hostHeader: string | undefined): boolean {
		if (!hostHeader) return true;
		const host = hostHeader.split(":")[0]?.toLowerCase();
		return host === "localhost" || host === "127.0.0.1";
	}

	private async readJsonBody(
		req: import("node:http").IncomingMessage,
	): Promise<unknown> {
		const chunks: Uint8Array[] = [];
		for await (const chunk of req) chunks.push(chunk as Uint8Array);
		const raw = Buffer.concat(chunks).toString("utf-8");
		if (!raw.trim()) return null;
		return JSON.parse(raw);
	}
}
