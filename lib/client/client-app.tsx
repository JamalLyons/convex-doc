import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

type FunctionType = "query" | "mutation" | "action" | "httpAction";

interface ManifestFunction {
	identifier: string;
	name: string;
	moduleName: string;
	moduleDisplayName?: string;
	functionType: FunctionType;
	visibility: "public" | "internal";
	args: Record<string, unknown> | null;
	returns: Record<string, unknown> | null;
	httpMethod?: string | null;
	httpPath?: string | null;
	href: string;
}

interface HttpRoute {
	method: string;
	path: string;
	handlerIdentifier?: string;
}

interface ManifestShape {
	functions: ManifestFunction[];
	httpRoutes?: HttpRoute[];
	buildInfo?: {
		defaultHttpActionDeployUrl?: string;
		generatedAt?: string;
		/** When true, the function runner is disabled (e.g. for public deployments). */
		functionRunnerDisabled?: boolean;
		/** When true, surface full error strings (including stack traces) in the UI. */
		verboseErrors?: boolean;
	};
}

interface RunResult {
	httpStatus: number;
	durationMs: string | number | null;
	json: Record<string, unknown>;
}

const MANIFEST_URL = "./convexdoc.manifest.json";
const STORAGE_PREFIX = "convexdoc:";
const STORAGE = {
	token: "convexdoc:bearerToken",
	deployUrl: "convexdoc:deployUrl",
	configFingerprint: "convexdoc:configFingerprint",
};

/**
 * If the manifest's config (e.g. default deploy URL) changed since last load,
 * clear all convexdoc localStorage/sessionStorage so the UI uses fresh config.
 * Called once when the manifest is first loaded.
 */
function clearConvexDocStorageIfConfigChanged(
	manifest: ManifestShape | null,
): void {
	const build = manifest?.buildInfo;
	if (!build) return;
	const fingerprint = `${build.defaultHttpActionDeployUrl ?? ""}|${build.generatedAt ?? ""}`;
	try {
		const stored = localStorage.getItem(STORAGE.configFingerprint);
		if (stored === fingerprint) return;
		for (let i = localStorage.length - 1; i >= 0; i--) {
			const key = localStorage.key(i);
			if (key?.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
		}
		for (let i = sessionStorage.length - 1; i >= 0; i--) {
			const key = sessionStorage.key(i);
			if (key?.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(key);
		}
		localStorage.setItem(STORAGE.configFingerprint, fingerprint);
	} catch {
		// Ignore storage errors (e.g. private mode)
	}
}

async function loadManifest(): Promise<ManifestShape> {
	const res = await fetch(MANIFEST_URL, { cache: "no-store" });
	if (!res.ok) throw new Error("Failed to load manifest");
	const manifest = (await res.json()) as ManifestShape;
	clearConvexDocStorageIfConfigChanged(manifest);
	return manifest;
}

function displayIdentifier(identifier: string): string {
	const colonIndex = identifier.indexOf(":");
	if (colonIndex === -1) {
		return identifier.replace(/\.js$/i, "");
	}
	const modulePart = identifier.slice(0, colonIndex).replace(/\.js$/i, "");
	return `${modulePart}${identifier.slice(colonIndex)}`;
}

function badgeClass(type: string): string {
	switch (type) {
		case "query":
			return "bg-sky-500/10 text-sky-400 ring-1 ring-inset ring-zinc-400/30";
		case "mutation":
			return "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/30";
		case "action":
			return "bg-gradient-to-r from-orange-500/20 to-red-500/20 text-red-400 ring-1 ring-inset ring-red-500/30";
		case "httpAction":
			return "bg-orange-500/10 text-orange-400 ring-1 ring-inset ring-orange-500/30";
		default:
			return "bg-zinc-500/10 text-zinc-400 ring-1 ring-inset ring-zinc-500/30";
	}
}

function prettyJson(v: unknown): string {
	try {
		return JSON.stringify(v, null, 2);
	} catch {
		return String(v);
	}
}

function parseErrorText(raw: string): {
	summary: string;
	requestId?: string;
	fullText: string;
} {
	const lines = raw.split(/\r?\n/);
	let requestId: string | undefined;
	for (const line of lines) {
		const match = line.match(/\[Request ID:\s*([^\]\s]+)\]/i);
		if (match) {
			requestId = match[1];
			break;
		}
	}
	const candidate =
		lines.find((line) => /^uncaught error:/i.test(line.trim())) ??
		lines.find((line) => /error/i.test(line)) ??
		lines[1] ??
		lines[0] ??
		"An error occurred while running the function.";
	const summary =
		candidate.replace(/^uncaught error:\s*/i, "").trim() || candidate.trim();
	return { summary, requestId, fullText: raw };
}

function formatJsonText(value: string): string | null {
	try {
		return prettyJson(JSON.parse(value));
	} catch {
		return null;
	}
}

function sampleFromValidator(value: unknown): unknown {
	if (!value || typeof value !== "object") return null;
	const validator = value as Record<string, unknown>;
	const type = String(validator.type ?? "unknown");
	if (type === "object") {
		const rawFields =
			(validator.fields as Record<string, unknown> | undefined) ??
			(validator.value as Record<string, unknown> | undefined) ??
			{};
		const next: Record<string, unknown> = {};
		for (const [key, rawField] of Object.entries(rawFields)) {
			const field = rawField as Record<string, unknown>;
			next[key] = sampleFromValidator(field.fieldType);
		}
		return next;
	}
	if (type === "array" || type === "set") return [];
	if (type === "map" || type === "record") return {};
	if (type === "union") {
		const members = Array.isArray(validator.members)
			? validator.members
			: Array.isArray(validator.value)
				? validator.value
				: [];
		return members.length ? sampleFromValidator(members[0]) : null;
	}
	if (type === "id" || type === "string" || type === "bytes") return "";
	if (
		type === "number" ||
		type === "float64" ||
		type === "bigint" ||
		type === "int64"
	) {
		return 0;
	}
	if (type === "boolean") return false;
	if (type === "literal") return validator.value ?? null;
	return null;
}

async function runFunction(
	fn: ManifestFunction,
	args: Record<string, unknown>,
	bearerToken: string,
	manifest: ManifestShape,
	deployUrl: string,
	extraHeaders?: Record<string, string>,
): Promise<RunResult> {
	if (fn.functionType === "httpAction") {
		const route =
			manifest.httpRoutes?.find(
				(r) =>
					r.handlerIdentifier === fn.identifier ||
					(r.path === fn.httpPath && r.method === fn.httpMethod),
			) ?? null;
		const path = route?.path ?? fn.httpPath ?? "/";
		const method = route?.method ?? fn.httpMethod ?? "GET";
		const startTime = Date.now();

		const headers = new Headers();
		if (bearerToken) headers.set("Authorization", `Bearer ${bearerToken}`);
		if (extraHeaders) {
			for (const [key, value] of Object.entries(extraHeaders)) {
				if (key) headers.set(key, String(value));
			}
		}

		const fetchArgs: { method: string; headers: Headers; body?: string } = {
			method,
			headers,
		};
		if (method !== "GET" && method !== "HEAD") {
			fetchArgs.body = JSON.stringify(args);
			headers.set("Content-Type", "application/json");
		}

		const res = await fetch(`${deployUrl}${path}`, fetchArgs);
		const durationMs = Date.now() - startTime;
		const text = await res.text();
		let json: unknown;
		try {
			json = JSON.parse(text) as unknown;
		} catch {
			json = text;
		}
		return {
			httpStatus: res.status,
			durationMs,
			json: res.ok
				? { status: "success", value: json }
				: { status: "error", errorMessage: text },
		};
	}

	const res = await fetch("/__convexdoc/run", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			functionType: fn.functionType,
			path: fn.identifier,
			args,
			bearerToken: bearerToken || undefined,
		}),
	});
	const durationMs = res.headers.get("x-convexdoc-duration-ms");
	const text = await res.text();
	let json: Record<string, unknown>;
	try {
		json = JSON.parse(text) as Record<string, unknown>;
	} catch {
		json = { status: "error", errorMessage: text };
	}
	return { httpStatus: res.status, durationMs, json };
}

function SearchResults({
	manifest,
	query,
}: {
	manifest: ManifestShape | null;
	query: string;
}) {
	const items = useMemo(() => {
		if (!manifest || !query.trim()) return [];
		const term = query.trim().toLowerCase();
		return (manifest.functions ?? [])
			.map((fn) => {
				const score = fn.identifier.toLowerCase().includes(term)
					? 0
					: fn.name.toLowerCase().includes(term)
						? 1
						: fn.moduleName.toLowerCase().includes(term)
							? 2
							: 999;
				return { ...fn, score };
			})
			.filter((x) => x.score !== 999)
			.sort(
				(a, b) => a.score - b.score || a.identifier.localeCompare(b.identifier),
			)
			.slice(0, 30);
	}, [manifest, query]);

	if (!query.trim()) {
		return (
			<div className="px-2 py-6 text-sm text-[var(--phoenix-text-muted)]">
				Type to search functions.
			</div>
		);
	}
	if (!items.length) {
		return (
			<div className="px-2 py-6 text-sm text-[var(--phoenix-text-muted)]">
				No matches.
			</div>
		);
	}
	return (
		<div>
			{items.map((it) => (
				<a
					key={it.identifier}
					className="search-result block rounded-xl px-3 py-2 hover:bg-[var(--phoenix-hover-surface)] ring-1 ring-transparent hover:ring-[var(--phoenix-border-strong)]"
					href={it.href ?? "#"}
				>
					<div className="flex items-center gap-2">
						<span
							className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-medium ${badgeClass(it.functionType)}`}
						>
							{it.functionType}
						</span>
						<span className="font-mono text-sm text-[var(--phoenix-text)]">
							{displayIdentifier(it.identifier)}
						</span>
					</div>
					<div className="mt-1 text-xs text-[var(--phoenix-text-muted)]">
						{it.moduleDisplayName ?? it.moduleName}
					</div>
				</a>
			))}
		</div>
	);
}

function RunnerPanel({
	manifest,
	selectedIdentifier,
}: {
	manifest: ManifestShape | null;
	selectedIdentifier: string | null;
}) {
	const fn = useMemo(
		() =>
			manifest?.functions.find((f) => f.identifier === selectedIdentifier) ??
			null,
		[manifest, selectedIdentifier],
	);
	const tokenKey = STORAGE.token;
	const argsKey = fn ? `convexdoc:args:${fn.identifier}` : "";
	const [jsonArgs, setJsonArgs] = useState("{}");
	const [token, setToken] = useState("");
	const [deployUrl, setDeployUrl] = useState(
		manifest?.buildInfo?.defaultHttpActionDeployUrl ?? "http://localhost:3218",
	);
	const [isRunning, setRunning] = useState(false);
	const [responseValue, setResponseValue] = useState<unknown>(
		"Response will appear here.",
	);
	const [responseKind, setResponseKind] = useState<
		"idle" | "success" | "error"
	>("idle");
	const [statusLine, setStatusLine] = useState<string>("");
	const [headersJson, setHeadersJson] = useState<string>("{}");
	const [showErrorDetails, setShowErrorDetails] = useState(false);

	useEffect(() => {
		const next = fn
			? localStorage.getItem(`convexdoc:args:${fn.identifier}`)
			: null;
		const fallbackArgs = fn ? prettyJson(sampleFromValidator(fn.args)) : "{}";
		setJsonArgs(next ?? fallbackArgs);
		const nextHeaders = fn
			? (localStorage.getItem(`convexdoc:headers:${fn.identifier}`) ?? "{}")
			: "{}";
		setHeadersJson(nextHeaders);
		setToken(localStorage.getItem(tokenKey) ?? "");
		const defaultUrl =
			manifest?.buildInfo?.defaultHttpActionDeployUrl ??
			"http://localhost:3218";
		setDeployUrl(sessionStorage.getItem(STORAGE.deployUrl) ?? defaultUrl);
		setResponseValue("Response will appear here.");
		setResponseKind("idle");
		setStatusLine("");
		setShowErrorDetails(false);
	}, [fn, manifest]);

	const isHttpAction = fn?.functionType === "httpAction";

	if (!manifest) {
		return (
			<div className="rounded-xl p-3 bg-[var(--phoenix-app-surface)] ring-1 ring-[var(--phoenix-border)]">
				<div className="text-sm font-semibold text-[var(--phoenix-error)]">
					Manifest unavailable
				</div>
			</div>
		);
	}
	if (manifest.buildInfo?.functionRunnerDisabled) {
		return (
			<div className="rounded-xl p-3 bg-[var(--phoenix-app-surface)] ring-1 ring-[var(--phoenix-border)]">
				<div
					className="text-sm font-semibold"
					style={{ color: "var(--phoenix-text)" }}
				>
					Function Runner
				</div>
				<div
					className="mt-2 text-xs"
					style={{ color: "var(--phoenix-text-muted)" }}
				>
					The function runner is disabled for this deployment. You can browse
					the API documentation but cannot invoke functions from this site.
				</div>
			</div>
		);
	}
	if (!fn) {
		return (
			<div className="rounded-xl p-3 bg-[var(--phoenix-app-surface)] ring-1 ring-[var(--phoenix-border)] text-[var(--phoenix-text-muted)]">
				Waiting for selection...
			</div>
		);
	}

	const onRun = async () => {
		setRunning(true);
		setStatusLine("");
		setShowErrorDetails(false);
		let args: Record<string, unknown>;
		let headers: Record<string, string> | undefined;
		try {
			args = jsonArgs.trim()
				? (JSON.parse(jsonArgs) as Record<string, unknown>)
				: {};
			setJsonArgs(prettyJson(args));
		} catch (err) {
			setResponseValue((err as Error).message);
			setResponseKind("error");
			setStatusLine("Invalid args");
			setRunning(false);
			return;
		}

		if (isHttpAction) {
			try {
				const parsed = headersJson.trim()
					? (JSON.parse(headersJson) as Record<string, unknown>)
					: {};
				headers = Object.fromEntries(
					Object.entries(parsed).map(([k, v]) => [k, String(v)]),
				);
			} catch (err) {
				setResponseValue((err as Error).message);
				setResponseKind("error");
				setStatusLine("Invalid headers");
				setRunning(false);
				return;
			}
		}

		localStorage.setItem(argsKey, prettyJson(args));
		if (isHttpAction) {
			localStorage.setItem(
				`convexdoc:headers:${fn.identifier}`,
				headersJson || "{}",
			);
		}
		localStorage.setItem(tokenKey, token);
		sessionStorage.setItem(STORAGE.deployUrl, deployUrl);

		try {
			const result = await runFunction(
				fn,
				args,
				token.trim(),
				manifest,
				deployUrl,
				headers,
			);
			const ok = result.json?.status === "success";
			const value = ok
				? result.json.value
				: (result.json.errorMessage ?? result.json.message ?? result.json);
			setResponseValue(value);
			setResponseKind(ok ? "success" : "error");
			setStatusLine(
				`${ok ? "Success" : "Error"} • HTTP ${result.httpStatus}${
					result.durationMs ? ` • ${result.durationMs}ms` : ""
				}`,
			);
		} catch (err) {
			setStatusLine("Runner failed");
			setResponseValue((err as Error).message ?? String(err));
			setResponseKind("error");
		} finally {
			setRunning(false);
		}
	};

	return (
		<div className="space-y-3">
			<div className="rounded-xl p-3 bg-[var(--phoenix-app-surface)] ring-1 ring-[var(--phoenix-border)]">
				<div className="flex items-center gap-2">
					<span
						className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-medium ${badgeClass(fn.functionType)}`}
					>
						{fn.functionType}
					</span>
					{fn.visibility === "internal" ? (
						<span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-medium bg-zinc-500/10 text-zinc-400 ring-1 ring-inset ring-zinc-500/30">
							internal
						</span>
					) : null}
					<div className="font-mono text-xs truncate text-[var(--phoenix-text)]">
						{displayIdentifier(fn.identifier)}
					</div>
				</div>
			</div>

			<div className="rounded-xl p-3 bg-[var(--phoenix-app-surface)] ring-1 ring-[var(--phoenix-border)] space-y-3">
				<div>
					<div className="block text-[11px] mb-1.5 text-[var(--phoenix-text-muted)]">
						Deployment URL
						{isHttpAction ? " (base, can include query string)" : ""}
					</div>
					<input
						className="convexdoc-input w-full rounded-xl px-3 py-2 text-xs font-mono"
						value={deployUrl}
						onChange={(e) => setDeployUrl(e.currentTarget.value)}
					/>
				</div>
				<div>
					<div className="block text-[11px] mb-1.5 text-[var(--phoenix-text-muted)]">
						Auth Token (optional)
					</div>
					<input
						className="convexdoc-input w-full rounded-xl px-3 py-2 text-xs font-mono"
						placeholder="Token"
						value={token}
						onChange={(e) => setToken(e.currentTarget.value)}
					/>
				</div>
				{isHttpAction ? (
					<div>
						<div className="block text-[11px] mb-1.5 text-[var(--phoenix-text-muted)]">
							Custom headers (JSON object)
						</div>
						<textarea
							className="convexdoc-input w-full h-20 rounded-xl px-3 py-2 text-xs font-mono"
							value={headersJson}
							onChange={(e) => setHeadersJson(e.currentTarget.value)}
						/>
					</div>
				) : null}
			</div>

			<div className="rounded-xl p-3 bg-[var(--phoenix-app-surface)] ring-1 ring-[var(--phoenix-border)] space-y-2">
				<div className="text-xs font-semibold text-[var(--phoenix-text)]">
					{isHttpAction ? "Request body (JSON)" : "Arguments (JSON)"}
				</div>
				<textarea
					className="convexdoc-input w-full h-36 rounded-xl px-3 py-2 text-xs font-mono"
					value={jsonArgs}
					onChange={(e) => setJsonArgs(e.currentTarget.value)}
					onBlur={() => {
						const formatted = formatJsonText(jsonArgs);
						if (formatted != null) setJsonArgs(formatted);
					}}
				/>
				<div className="pt-1">
					<button
						type="button"
						onClick={onRun}
						disabled={isRunning}
						className="phoenix-btn-primary rounded-lg px-3 py-1.5 text-xs text-white shadow-md shadow-red-500/20 disabled:opacity-70"
					>
						{isRunning ? "Running..." : "Run"}
					</button>
				</div>
			</div>

			<div className="rounded-xl p-3 bg-[var(--phoenix-app-surface)] ring-1 ring-[var(--phoenix-border)] space-y-2">
				<div className="flex items-center justify-between gap-2">
					<div className="text-xs text-[var(--phoenix-text-muted)]">
						{statusLine || "Response"}
					</div>
					{responseKind === "error" &&
					typeof responseValue === "string" &&
					manifest.buildInfo?.verboseErrors ? (
						<button
							type="button"
							onClick={() => setShowErrorDetails((v) => !v)}
							className="text-[10px] px-2 py-0.5 rounded-md phoenix-btn-ghost"
						>
							{showErrorDetails ? "Hide details" : "Show full error"}
						</button>
					) : null}
				</div>
				{responseKind === "error" && typeof responseValue === "string" ? (
					<>
						{(() => {
							const { summary, requestId } = parseErrorText(responseValue);
							return (
								<div className="space-y-1">
									<div className="text-[11px] text-[var(--phoenix-error)] font-medium">
										{summary}
									</div>
									{requestId ? (
										<div className="text-[10px] text-[var(--phoenix-text-muted)]">
											Request ID: <span className="font-mono">{requestId}</span>
										</div>
									) : null}
								</div>
							);
						})()}
						{manifest.buildInfo?.verboseErrors && showErrorDetails ? (
							<pre className="mt-2 text-[11px] leading-5 whitespace-pre-wrap text-[var(--phoenix-text)] overflow-auto border-t border-[var(--phoenix-border)] pt-2">
								{responseValue}
							</pre>
						) : null}
					</>
				) : (
					<pre className="mt-1 text-[11px] leading-5 whitespace-pre-wrap text-[var(--phoenix-text)] overflow-auto">
						{prettyJson(responseValue)}
					</pre>
				)}
			</div>
		</div>
	);
}

function mountSearch(manifestPromise: Promise<ManifestShape | null>) {
	const openBtn = document.getElementById("convexdoc-search-open");
	const dialog = document.getElementById(
		"convexdoc-search",
	) as HTMLDialogElement | null;
	const input = document.getElementById(
		"convexdoc-search-input",
	) as HTMLInputElement | null;
	const results = document.getElementById("convexdoc-search-results");
	if (!results) return;
	const root = createRoot(results);
	let manifest: ManifestShape | null = null;
	let query = "";

	manifestPromise.then((m) => {
		manifest = m;
		root.render(<SearchResults manifest={manifest} query={query} />);
	});
	root.render(<SearchResults manifest={manifest} query={query} />);

	input?.addEventListener("input", () => {
		query = input.value;
		root.render(<SearchResults manifest={manifest} query={query} />);
	});

	openBtn?.addEventListener("click", () => {
		dialog?.showModal?.();
		setTimeout(() => input?.focus(), 0);
	});
	dialog?.addEventListener("click", (e) => {
		if (e.target === dialog) dialog.close();
	});
}

function mountRunner(manifestPromise: Promise<ManifestShape | null>) {
	const panel = document.getElementById("convexdoc-runner-panel");
	const mountNode = panel?.querySelector(".p-4");
	if (!mountNode) return;
	const root = createRoot(mountNode);
	let manifest: ManifestShape | null = null;
	let selectedIdentifier: string | null = null;

	const render = () => {
		root.render(
			<RunnerPanel
				manifest={manifest}
				selectedIdentifier={selectedIdentifier}
			/>,
		);
	};

	manifestPromise.then((m) => {
		manifest = m;
		render();
	});
	render();

	document.querySelectorAll("[data-convexdoc-try]").forEach((btn) => {
		btn.addEventListener("click", () => {
			const host = btn.closest("[data-convexdoc-fn]");
			selectedIdentifier =
				host?.getAttribute("data-convexdoc-fn") ?? "unresolved:unbound";
			const inline = host?.querySelector("[data-convexdoc-inline-runner]");
			if (inline) inline.classList.remove("hidden");
			render();
		});
	});
}

function attachScrollSpy() {
	const tocLinks = document.querySelectorAll("[data-toc-id]");
	if (tocLinks.length === 0) return;
	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (!entry.isIntersecting) return;
				const id = entry.target.id;
				tocLinks.forEach((link) => {
					if (link.getAttribute("data-toc-id") === id) {
						link.classList.add("bg-[var(--phoenix-hover-surface)]");
					} else {
						link.classList.remove("bg-[var(--phoenix-hover-surface)]");
					}
				});
			});
		},
		{ rootMargin: "0px 0px -80% 0px" },
	);
	document.querySelectorAll("[data-convexdoc-fn]").forEach((el) => {
		observer.observe(el);
	});
}

const manifestPromise = loadManifest().catch(() => null);
mountSearch(manifestPromise);
mountRunner(manifestPromise);
attachScrollSpy();
