import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { join, normalize } from "node:path";

export interface RunRequestBody {
	functionType: "query" | "mutation" | "action";
	path: string; // "module:function"
	args?: Record<string, unknown>;
	bearerToken?: string;
}

function contentTypeForPath(p: string): string {
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

function isLocalhostRequest(hostHeader: string | undefined): boolean {
	if (!hostHeader) return true;
	const host = hostHeader.split(":")[0]?.toLowerCase();
	return host === "localhost" || host === "127.0.0.1";
}

async function readJsonBody(
	req: import("node:http").IncomingMessage,
): Promise<unknown> {
	const chunks: Uint8Array[] = [];
	for await (const chunk of req) chunks.push(chunk as Uint8Array);
	const raw = Buffer.concat(chunks).toString("utf-8");
	if (!raw.trim()) return null;
	return JSON.parse(raw);
}

export async function serveDocsSite(opts: {
	docsDir: string;
	port: number;
	verboseLogs?: boolean;
	deploymentUrl?: string;
	adminKey?: string;
}): Promise<void> {
	const {
		docsDir,
		port,
		verboseLogs = false,
		deploymentUrl,
		adminKey,
	} = opts;

	const server = createServer(async (req, res) => {
		const reqStart = Date.now();
		const requestId = Math.random().toString(36).slice(2, 8);
		const reqMethod = req.method ?? "GET";
		const reqPath = req.url ?? "/";
		const log = (message: string) => {
			if (!verboseLogs) return;
			console.log(`[convexdoc:${requestId}] ${message}`);
		};
		const logEnd = (status: number) => {
			const duration = Date.now() - reqStart;
			console.log(
				`[convexdoc] ${reqMethod} ${reqPath} -> ${status} (${duration}ms)`,
			);
		};
		try {
			if (!isLocalhostRequest(req.headers.host)) {
				res.statusCode = 403;
				res.setHeader("content-type", "text/plain; charset=utf-8");
				res.end("Forbidden");
				logEnd(403);
				return;
			}

			const url = new URL(
				req.url ?? "/",
				`http://${req.headers.host ?? "localhost"}`,
			);
			const pathname = decodeURIComponent(url.pathname);

			// Runner endpoint
			if (pathname === "/__convexdoc/run" && req.method === "POST") {
				const body = (await readJsonBody(
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
				if (body.bearerToken) {
					headers.authorization = `Bearer ${body.bearerToken}`;
				} else if (adminKey ?? process.env.CONVEX_ADMIN_KEY) {
					// Best-effort: some environments may accept admin auth here.
					headers.authorization = `Convex ${adminKey ?? process.env.CONVEX_ADMIN_KEY}`;
				}

				const t0 = Date.now();
				log(`proxy -> ${endpoint}`);
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
				return;
			}

			// Convenience manifest endpoint (also available as static file)
			if (pathname === "/__convexdoc/manifest" && req.method === "GET") {
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
				return;
			}

			// Static file serving
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
			res.setHeader("content-type", contentTypeForPath(filePath));
			createReadStream(filePath).pipe(res);
			logEnd(200);
		} catch (err: unknown) {
			res.statusCode = 500;
			res.setHeader("content-type", "application/json; charset=utf-8");
			res.end(
				JSON.stringify({
					status: "error",
					errorMessage: (err as Error).message ?? String(err),
				}),
			);
			logEnd(500);
		}
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, "127.0.0.1", () => resolve());
	});

	// Keep process alive
	await new Promise<void>(() => {});
}
