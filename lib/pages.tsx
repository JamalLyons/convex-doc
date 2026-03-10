/**
 * JSX page components for ConvexDoc static HTML output.
 * Uses jsx-async-runtime; attributes are HTML-style (class, not className).
 */

import { Fragment, type ReactNode } from "react";
import type { ConvexModule, ParsedFunctionSpec } from "./function-spec.js";

export interface PageProps {
	title: string;
	/** Base path for links e.g. "" or "docs/" so links work from subdirs */
	baseHref?: string;
	nav: {
		spec: ParsedFunctionSpec;
		/** Slug for each module for linking (e.g. "tasks", "root") */
		moduleSlugs: Map<string, string>;
		/** Active module name (for nav highlight), if any */
		activeModuleName?: string;
	};
	buildInfo?: {
		generatedAt?: string;
		defaultHttpActionDeployUrl?: string;
		deploymentEnv?: "dev" | "prod";
		deploymentUrl?: string;
		functionRunnerDisabled?: boolean;
	};
	customization?: {
		theme?: {
			accent?: string;
		};
		modules?: Record<
			string,
			{
				description?: string;
				functions?: Record<string, { description?: string }>;
			}
		>;
		hideConvexDocsLinks?: boolean;
	};
}

export interface IndexPageProps extends PageProps {
	spec: ParsedFunctionSpec;
	/** Pre-rendered HTML from landing page file (markdown or plaintext). */
	landingPageHtml?: string | null;
}

export interface ModulePageProps extends PageProps {
	module: ConvexModule;
}

function functionTypeBadge(type: string): string {
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

function functionBorderColor(type: string): string {
	switch (type) {
		case "query":
			return "border-l-sky-400";
		case "mutation":
			return "border-l-emerald-400";
		case "action":
			return "border-l-red-500";
		case "httpAction":
			return "border-l-orange-400";
		default:
			return "border-l-zinc-500";
	}
}

function docsLinkForFunctionType(
	type: string,
): { href: string; label: string } | null {
	switch (type) {
		case "query":
			return {
				href: "https://docs.convex.dev/functions/query-functions",
				label: "Convex queries",
			};
		case "mutation":
			return {
				href: "https://docs.convex.dev/functions/mutation-functions",
				label: "Convex mutations",
			};
		case "action":
			return {
				href: "https://docs.convex.dev/functions/actions",
				label: "Convex actions",
			};
		case "httpAction":
			return {
				href: "https://docs.convex.dev/functions/http-actions",
				label: "Convex HTTP actions",
			};
		default:
			return null;
	}
}

function moduleDisplayName(name: string): string {
	if (name === "http") return "built-in: http";
	if (name === "(root)") return "root";
	if (name === "unresolved") return "unresolved";
	return name;
}

const TOKENS = {
	keyword: { color: "var(--phoenix-text-muted)" },
	punctuation: { color: "var(--phoenix-zinc-500)" },
	field: { color: "var(--phoenix-text)" },
	optional: { color: "var(--phoenix-red-zone)" },
	idType: { color: "var(--phoenix-red-zone)" },
	stringLiteral: { color: "var(--phoenix-success)" },
	comment: { color: "var(--phoenix-text-dim)" },
} as const;

function indent(depth: number): string {
	return "  ".repeat(depth);
}

function asValidatorObject(validator: unknown): Record<string, unknown> | null {
	if (!validator || typeof validator !== "object") return null;
	return validator as Record<string, unknown>;
}

function validatorType(validator: unknown): string | null {
	const obj = asValidatorObject(validator);
	if (!obj) return null;
	return typeof obj.type === "string" ? obj.type : null;
}

function isObjectValidator(validator: unknown): boolean {
	return validatorType(validator) === "object";
}

function renderLiteral(value: unknown): ReactNode {
	if (typeof value === "string") {
		return <span style={TOKENS.stringLiteral}>"{value}"</span>;
	}
	if (typeof value === "bigint") return String(value);
	if (typeof value === "number" || typeof value === "boolean")
		return String(value);
	if (value == null) {
		return <span style={TOKENS.keyword}>null</span>;
	}
	return JSON.stringify(value);
}

function renderObjectFields(
	validator: Record<string, unknown>,
	depth: number,
): ReactNode {
	const rawFields =
		(validator.fields as Record<string, unknown> | undefined) ??
		(validator.value as Record<string, unknown> | undefined) ??
		{};
	const entries = Object.entries(rawFields);
	if (!entries.length) {
		return (
			<>
				<span style={TOKENS.punctuation}>{"{"}</span>
				<span style={TOKENS.punctuation}>{"}"}</span>
			</>
		);
	}
	return (
		<>
			<span style={TOKENS.punctuation}>{"{"}</span>
			{entries.map(([fieldName, rawField], index) => {
				const field = (rawField as Record<string, unknown>) ?? {};
				const optional = field.optional === true;
				return (
					<Fragment key={fieldName}>
						{"\n"}
						{indent(depth + 1)}
						<span style={TOKENS.field}>{fieldName}</span>
						{optional ? <span style={TOKENS.optional}>?</span> : null}
						<span style={TOKENS.punctuation}>:</span>{" "}
						{renderValidatorNode(field.fieldType, depth + 1)}
						<span style={TOKENS.punctuation}>,</span>
						{index === entries.length - 1 ? "\n" : null}
					</Fragment>
				);
			})}
			{indent(depth)}
			<span style={TOKENS.punctuation}>{"}"}</span>
		</>
	);
}

function renderValidatorNode(validator: unknown, depth: number): ReactNode {
	const obj = asValidatorObject(validator);
	if (!obj) return <span style={TOKENS.keyword}>unknown</span>;
	const type = validatorType(obj);
	if (!type) return <span style={TOKENS.keyword}>unknown</span>;

	if (
		type === "string" ||
		type === "number" ||
		type === "boolean" ||
		type === "null" ||
		type === "any" ||
		type === "int64" ||
		type === "float64"
	) {
		return <span style={TOKENS.keyword}>{type}</span>;
	}

	if (type === "id") {
		const tableName = String(obj.tableName ?? "");
		return (
			<>
				<span style={TOKENS.idType}>Id</span>
				<span style={TOKENS.punctuation}>{"<"}</span>
				<span style={TOKENS.stringLiteral}>"{tableName}"</span>
				<span style={TOKENS.punctuation}>{">"}</span>
			</>
		);
	}

	if (type === "literal") return renderLiteral(obj.value);

	if (type === "array") {
		const itemType = obj.items;
		const itemTypeName = validatorType(itemType);
		const wraps = itemTypeName === "union" || itemTypeName === "object";
		return (
			<>
				{wraps ? <span style={TOKENS.punctuation}>(</span> : null}
				{renderValidatorNode(itemType, depth)}
				{wraps ? <span style={TOKENS.punctuation}>)</span> : null}
				<span style={TOKENS.punctuation}>[]</span>
			</>
		);
	}

	if (type === "union") {
		const members = Array.isArray(obj.members) ? obj.members : [];
		if (!members.length) return <span style={TOKENS.keyword}>unknown</span>;
		const seen = new Map<string, number>();
		const keyedMembers = members.map((member) => {
			const signature = JSON.stringify(member) ?? String(member);
			const nextCount = (seen.get(signature) ?? 0) + 1;
			seen.set(signature, nextCount);
			return { member, key: `${signature}:${nextCount}` };
		});
		const vertical =
			members.length > 3 || members.some((member) => isObjectValidator(member));
		if (!vertical) {
			return (
				<>
					{keyedMembers.map(({ member, key }, index) => (
						<Fragment key={key}>
							{index > 0 ? (
								<>
									{" "}
									<span style={TOKENS.punctuation}>|</span>{" "}
								</>
							) : null}
							{renderValidatorNode(member, depth)}
						</Fragment>
					))}
				</>
			);
		}
		return (
			<>
				{keyedMembers.map(({ member, key }, index) => (
					<Fragment key={key}>
						{index > 0 ? "\n" : null}
						{indent(depth)}
						<span style={TOKENS.punctuation}>|</span>{" "}
						{renderValidatorNode(member, depth + 1)}
					</Fragment>
				))}
			</>
		);
	}

	if (type === "object") {
		if (depth >= 3) {
			return (
				<details className="inline-block align-top">
					<summary
						className="inline-flex cursor-pointer rounded-md px-1.5 py-0.5 ring-1 ring-white/10"
						style={{
							color: "var(--phoenix-text-muted)",
							backgroundColor: "var(--phoenix-input-bg)",
							listStyle: "none",
						}}
					>
						<span style={TOKENS.punctuation}>{"{ ... }"}</span>
					</summary>
					<div className="mt-1">{renderObjectFields(obj, depth)}</div>
				</details>
			);
		}
		return renderObjectFields(obj, depth);
	}

	if (type === "record") {
		const keyType = obj.keys;
		const values = (obj.values as Record<string, unknown> | undefined) ?? {};
		return (
			<>
				<span style={TOKENS.keyword}>Record</span>
				<span style={TOKENS.punctuation}>{"<"}</span>
				{renderValidatorNode(keyType, depth + 1)}
				<span style={TOKENS.punctuation}>,</span>{" "}
				{renderValidatorNode(values.fieldType, depth + 1)}
				<span style={TOKENS.punctuation}>{">"}</span>
			</>
		);
	}

	return <span style={TOKENS.keyword}>{type}</span>;
}

export function ValidatorDisplay({
	validator,
	depth = 0,
}: {
	validator: unknown | null;
	depth?: number;
}) {
	const empty = validator == null;
	return (
		<pre
			className="mt-2 text-xs leading-5 whitespace-pre-wrap break-words overflow-auto"
			style={{
				color: "var(--phoenix-text)",
				fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
			}}
		>
			<code>
				{empty ? (
					<span style={TOKENS.comment}>{"// no arguments"}</span>
				) : (
					renderValidatorNode(validator, depth)
				)}
			</code>
		</pre>
	);
}

function Layout({
	children,
	title,
	baseHref = "",
	nav,
	buildInfo,
}: PageProps & { children?: ReactNode }) {
	const indexHref = baseHref ? `${baseHref}index.html` : "index.html";
	const modules = nav.spec.modules;

	const env =
		buildInfo?.deploymentEnv === "prod" ? ("prod" as const) : ("dev" as const);
	const envLabel = env === "prod" ? "Production" : "Development";
	const envClass =
		env === "prod"
			? "text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/40"
			: "text-sky-200 bg-sky-500/10 ring-1 ring-sky-500/40";

	let deploymentName: string | null = null;
	if (buildInfo?.deploymentUrl) {
		try {
			const url = new URL(buildInfo.deploymentUrl);
			const host = url.hostname;
			deploymentName = host.split(".")[0] || host;
		} catch {
			deploymentName = buildInfo.deploymentUrl;
		}
	}
	const totalFunctions = (nav.spec as ParsedFunctionSpec).summary?.total;
	const baseTitle = `${title} — ConvexDoc`;
	const description =
		typeof totalFunctions === "number" && totalFunctions > 0
			? `${totalFunctions} Convex functions documented for ${deploymentName ?? "this deployment"}. Browse queries, mutations, actions, and HTTP actions with an interactive runner.`
			: `API documentation for your Convex deployment generated by ConvexDoc. Browse modules and functions with an interactive runner.`;
	return (
		<html lang="en" className="h-full scroll-pt-24">
			<head>
				<meta charSet="utf-8" />
				<meta
					name="viewport"
					content="width=device-width, initial-scale=1, viewport-fit=cover"
				/>
				<title>{baseTitle}</title>
				<meta name="description" content={description} />
				<meta property="og:title" content={baseTitle} />
				<meta property="og:description" content={description} />
				<meta property="og:type" content="website" />
				{buildInfo?.deploymentUrl ? (
					<>
						<meta property="og:url" content={buildInfo.deploymentUrl} />
						<link rel="canonical" href={buildInfo.deploymentUrl} />
					</>
				) : null}
				<meta name="twitter:card" content="summary_large_image" />
				<meta name="twitter:title" content={baseTitle} />
				<meta name="twitter:description" content={description} />
				<link rel="stylesheet" href={`${baseHref}styles.css`} />
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link
					rel="preconnect"
					href="https://fonts.gstatic.com"
					crossOrigin=""
				/>
				<link
					href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
					rel="stylesheet"
				/>
				<script type="module" src={`${baseHref}app.js`} defer />
			</head>
			<body
				className="min-h-screen antialiased flex flex-col w-full min-w-0"
				style={{
					backgroundColor: "var(--phoenix-app-bg)",
					color: "var(--phoenix-text)",
					paddingLeft: "env(safe-area-inset-left)",
					paddingRight: "env(safe-area-inset-right)",
				}}
			>
				<div className="pointer-events-none fixed inset-0 -z-10">
					<div className="absolute inset-0 bg-[radial-gradient(1000px_circle_at_20%_-10%,rgba(56,189,248,0.18),transparent_40%),radial-gradient(800px_circle_at_90%_0%,rgba(217,70,239,0.14),transparent_45%),radial-gradient(900px_circle_at_40%_120%,rgba(16,185,129,0.12),transparent_50%)]" />
					<div className="absolute inset-0 opacity-[0.08] bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22120%22%20height=%22120%22%20viewBox=%220%200%20120%20120%22%3E%3Cfilter%20id=%22n%22%3E%3CfeTurbulence%20type=%22fractalNoise%22%20baseFrequency=%220.8%22%20numOctaves=%222%22%20stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect%20width=%22120%22%20height=%22120%22%20filter=%22url(%23n)%22%20opacity=%220.35%22/%3E%3C/svg%3E')]" />
				</div>

				<header className="sticky top-0 z-20 phoenix-glass pt-[env(safe-area-inset-top)]">
					<div className="mx-auto max-w-[1280px] px-4 sm:px-6">
						<div className="flex h-16 items-center gap-3">
							<a
								href={indexHref}
								className="group inline-flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5"
							>
								<span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/5 ring-1 ring-white/10">
									<img
										src={`${baseHref}assets/convex.png`}
										alt="Convex"
										className="h-4 w-auto"
									/>
								</span>
								<span
									className="font-[Sora] text-sm font-semibold tracking-tight"
									style={{
										textShadow: "0 0 20px var(--phoenix-red-zone-glow)",
										color: "white",
									}}
								>
									ConvexDoc
								</span>
							</a>

							<div className="hidden sm:block h-6 w-px bg-white/10" />

							<button
								type="button"
								id="convexdoc-search-open"
								className="group hidden sm:flex flex-1 items-center justify-between rounded-xl px-3 py-2 text-left transition-colors phoenix-glass hover:bg-white/5"
								style={{
									backgroundColor: "var(--phoenix-input-bg)",
									borderColor: "var(--phoenix-border)",
								}}
							>
								<span
									className="text-sm group-hover:opacity-90"
									style={{ color: "var(--phoenix-text)" }}
								>
									Search modules & functions…
								</span>
								<span
									className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ring-1"
									style={{
										backgroundColor: "var(--phoenix-app-surface)",
										color: "var(--phoenix-text-muted)",
										borderColor: "var(--phoenix-border)",
									}}
								>
									<span className="font-mono">⌘</span>
									<span className="font-mono">K</span>
								</span>
							</button>

							<div className="ml-auto hidden sm:flex items-center gap-3">
								{deploymentName ? (
									<div className="flex flex-col items-end leading-tight">
										<div className="text-xs font-medium text-slate-200">
											{deploymentName}
										</div>
										<div
											className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${envClass}`}
										>
											{envLabel}
										</div>
									</div>
								) : (
									<div
										className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${envClass}`}
									>
										{envLabel}
									</div>
								)}
							</div>
						</div>
					</div>
				</header>

				<div className="mx-auto max-w-[1280px] px-4 sm:px-6 flex-1 w-full min-w-0 pb-[env(safe-area-inset-bottom)]">
					<div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-6 sm:gap-8 py-6 sm:py-8">
						<aside className="hidden lg:block">
							<div className="sticky top-24">
								<div
									className="rounded-2xl phoenix-glass"
									style={{ borderTop: "2px solid var(--phoenix-red-zone)" }}
								>
									<div className="px-4 py-3 border-b border-white/10">
										<div
											className="text-xs font-semibold tracking-wide"
											style={{ color: "var(--phoenix-text)" }}
										>
											API Modules
										</div>
										<div className="mt-1 text-xs text-slate-400">
											{nav.spec.summary.total} functions
										</div>
									</div>
									<div className="max-h-[calc(100vh-11rem)] overflow-auto p-2">
										<ul className="space-y-1">
											{modules.map((mod) => {
												const slug = nav.moduleSlugs.get(mod.name) ?? mod.name;
												const href =
													slug === "index" ? "index.html" : `${slug}.html`;
												const active = nav.activeModuleName === mod.name;
												return (
													<li key={mod.name}>
														<a
															href={baseHref ? `${baseHref}${href}` : href}
															className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ring-1 ring-inset ${
																active
																	? "bg-white/10 text-white ring-white/15"
																	: "text-slate-300 ring-transparent hover:bg-white/5 hover:text-white"
															}`}
														>
															<span className="truncate">
																{moduleDisplayName(mod.name)}
															</span>
															<span className="shrink-0 rounded-lg bg-black/30 px-2 py-0.5 text-xs text-slate-300 ring-1 ring-white/10">
																{mod.functions.length}
															</span>
														</a>
													</li>
												);
											})}
										</ul>
									</div>
								</div>
							</div>
						</aside>

						<main className="min-w-0 animate-fade-in-up">{children}</main>
					</div>
				</div>

				<footer className="mt-auto border-t border-white/10">
					<div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-6 text-xs text-slate-400 flex items-center justify-between">
						<div>
							Generated by{" "}
							<a
								href="https://github.com/jamallyons/convex-doc"
								className="text-slate-300 hover:text-white"
							>
								ConvexDoc
							</a>
						</div>
						<div className="hidden sm:block">
							Created by{" "}
							<a
								href="https://www.jamallyons.com"
								className="text-slate-300 hover:text-white"
							>
								Jamal Lyons
							</a>
						</div>
					</div>
				</footer>

				<dialog
					id="convexdoc-search"
					className="backdrop:bg-black/70 backdrop:backdrop-blur-sm bg-transparent p-0"
				>
					<div
						className="mx-auto mt-24 w-[min(720px,calc(100vw-2rem))] rounded-2xl overflow-hidden phoenix-glass shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
						style={{
							borderColor: "var(--phoenix-border-strong)",
							borderTopWidth: "2px",
							borderTopColor: "var(--phoenix-red-zone)",
						}}
					>
						<div
							className="border-b p-3"
							style={{ borderColor: "var(--phoenix-border)" }}
						>
							<input
								id="convexdoc-search-input"
								className="convexdoc-input w-full rounded-xl px-3 py-2 text-sm"
								style={{
									backgroundColor: "var(--phoenix-input-bg)",
									color: "var(--phoenix-text)",
								}}
								placeholder="Search… (type function identifier or name)"
								autoComplete="off"
							/>
						</div>
						<div
							id="convexdoc-search-results"
							className="max-h-[60vh] overflow-auto p-2"
							style={{ backgroundColor: "var(--phoenix-app-surface)" }}
						>
							<div
								className="px-2 py-6 text-sm"
								style={{ color: "var(--phoenix-text-muted)" }}
							>
								Type to search functions.
							</div>
						</div>
					</div>
				</dialog>
			</body>
		</html>
	);
}

export function IndexPage({
	spec,
	title,
	baseHref = "",
	nav,
	buildInfo,
	customization,
	landingPageHtml,
}: IndexPageProps) {
	const { summary, modules } = spec;
	return (
		<Layout title={title} baseHref={baseHref} nav={nav} buildInfo={buildInfo}>
			{landingPageHtml ? (
				<section
					className="mb-10 convexdoc-prose max-w-3xl"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: build-time content from config file
					dangerouslySetInnerHTML={{ __html: landingPageHtml }}
				/>
			) : (
				<section className="mb-10">
					<h1 className="font-[Sora] text-3xl sm:text-4xl font-semibold tracking-tight">
						API Overview
					</h1>
					<p className="mt-2 text-slate-300 max-w-2xl">
						Auto-generated docs for your Convex deployment—interactive when
						served via{" "}
						<code className="font-mono text-slate-200">convexdoc serve</code>.
					</p>
				</section>
			)}

			<section className="mb-10">
				<div
					className="rounded-2xl phoenix-glass p-5"
					style={{ borderTop: "2px solid var(--phoenix-red-zone)" }}
				>
					<h2
						className="font-[Sora] text-sm font-semibold mb-4"
						style={{ color: "var(--phoenix-text)" }}
					>
						Function summary
					</h2>
					<div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
						<div className="rounded-xl p-3 ring-1 ring-white/10 bg-white/5">
							<div className="text-2xl font-semibold text-white">
								{summary.total}
							</div>
							<div
								className="text-xs mt-1"
								style={{ color: "var(--phoenix-text-muted)" }}
							>
								Total
							</div>
						</div>
						<div className="rounded-xl p-3 ring-1 ring-sky-400/20 bg-sky-500/10">
							<div className="text-2xl font-semibold text-sky-200">
								{summary.queries}
							</div>
							<div
								className="text-xs mt-1"
								style={{ color: "var(--phoenix-text-muted)" }}
							>
								Queries
							</div>
						</div>
						<div className="rounded-xl p-3 ring-1 ring-emerald-400/20 bg-emerald-500/10">
							<div className="text-2xl font-semibold text-emerald-200">
								{summary.mutations}
							</div>
							<div
								className="text-xs mt-1"
								style={{ color: "var(--phoenix-text-muted)" }}
							>
								Mutations
							</div>
						</div>
						<div className="rounded-xl p-3 ring-1 ring-red-500/20 bg-red-500/10">
							<div className="text-2xl font-semibold text-fuchsia-200">
								{summary.actions}
							</div>
							<div
								className="text-xs mt-1"
								style={{ color: "var(--phoenix-text-muted)" }}
							>
								Actions
							</div>
						</div>
						{summary.httpActions > 0 ? (
							<div className="rounded-xl p-3 ring-1 ring-cyan-400/20 bg-cyan-500/10">
								<div className="text-2xl font-semibold text-cyan-200">
									{summary.httpActions}
								</div>
								<div
									className="text-xs mt-1"
									style={{ color: "var(--phoenix-text-muted)" }}
								>
									HTTP Actions
								</div>
							</div>
						) : null}
					</div>
				</div>
			</section>

			<section>
				<h2 className="font-[Sora] text-lg font-semibold text-slate-100 mb-4">
					Modules
				</h2>
				<ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
					{modules.map((mod) => {
						const slug = nav.moduleSlugs.get(mod.name) ?? mod.name;
						const href = slug === "index" ? "index.html" : `${slug}.html`;
						const moduleDescription =
							customization?.modules?.[mod.name]?.description;
						return (
							<li key={mod.name}>
								<a
									href={baseHref ? `${baseHref}${href}` : href}
									className="group block rounded-2xl phoenix-glass p-4 hover:bg-white/5 transition-colors"
								>
									<div className="flex items-center justify-between gap-3">
										<span className="font-medium text-white group-hover:text-sky-100 truncate">
											{moduleDisplayName(mod.name)}
										</span>
										<span className="shrink-0 rounded-lg bg-black/30 px-2 py-0.5 text-xs text-slate-300 ring-1 ring-white/10">
											{mod.functions.length} fn
										</span>
									</div>
									{moduleDescription ? (
										<span className="mt-2 block text-xs text-slate-400">
											{moduleDescription}
										</span>
									) : null}
								</a>
							</li>
						);
					})}
				</ul>
			</section>
		</Layout>
	);
}

export function ModulePage({
	module,
	title,
	baseHref = "",
	nav,
	buildInfo,
	customization,
}: ModulePageProps) {
	const indexHref = baseHref ? `${baseHref}index.html` : "index.html";
	return (
		<Layout
			title={title}
			baseHref={baseHref}
			nav={nav}
			buildInfo={buildInfo}
			customization={customization}
		>
			<nav className="text-xs text-slate-400 mb-4">
				<a href={indexHref} className="hover:text-slate-200">
					Overview
				</a>
				<span className="mx-2 text-slate-600">/</span>
				<span className="text-slate-200">{moduleDisplayName(module.name)}</span>
			</nav>

			<div className="mb-8">
				<h1 className="font-[Sora] text-3xl sm:text-4xl font-semibold tracking-tight">
					{moduleDisplayName(module.name)}
				</h1>
			</div>

			{(() => {
				const moduleDescription =
					customization?.modules?.[module.name]?.description;
				return moduleDescription ? (
					<p className="mb-6 text-xs text-slate-400">{moduleDescription}</p>
				) : null;
			})()}

			<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6">
				<div className="min-w-0">
					<ul className="space-y-5">
						{module.functions.map((fn) => {
							const docsLink = docsLinkForFunctionType(fn.functionType);
							const functionName = fn.identifier.includes(":")
								? fn.identifier.slice(fn.identifier.indexOf(":") + 1)
								: fn.identifier;
							const functionDescription =
								customization?.modules?.[module.name]?.functions?.[functionName]
									?.description;
							return (
								<li
									key={fn.identifier}
									id={`fn-${fn.identifier.replace(/:/g, "-")}`}
									className={`rounded-2xl phoenix-glass p-5 border-l-4 ${functionBorderColor(fn.functionType)} hover:shadow-[0_0_0_1px_var(--phoenix-red-zone-glow)] hover:-translate-y-0.5 hover:scale-[1.01] transition-all duration-300 scroll-mt-32`}
									data-convexdoc-fn={fn.identifier}
									data-convexdoc-fn-type={fn.functionType}
								>
									<div className="flex flex-wrap items-center gap-2 mb-3">
										<span
											className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${functionTypeBadge(fn.functionType)}`}
										>
											{fn.functionType}
										</span>
										{fn.visibility.kind === "internal" ? (
											<span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-white/5 text-slate-300 ring-1 ring-inset ring-white/10">
												internal
											</span>
										) : null}
										<span
											className="font-mono text-sm font-semibold"
											style={{ color: "var(--phoenix-text)" }}
										>
											{fn.identifier.replace(/\.js:/i, ":")}
										</span>
										<button
											type="button"
											className="ml-auto inline-flex items-center rounded-lg phoenix-btn-primary px-3 py-1.5 text-xs text-white shadow-md shadow-red-500/20"
											data-convexdoc-try
										>
											Run
										</button>
									</div>
									{functionDescription ? (
										<p className="mt-2 mb-3 text-xs text-slate-400">
											{functionDescription}
										</p>
									) : null}

									<div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
										<div
											className="rounded-xl p-3"
											style={{
												backgroundColor: "var(--phoenix-app-surface)",
												boxShadow:
													"0 1px 0 0 rgba(255,255,255,0.05) inset, 0 1px 3px 0 rgba(0,0,0,0.5)",
											}}
										>
											<div
												className="text-[11px] uppercase tracking-wide"
												style={{ color: "var(--phoenix-text-muted)" }}
											>
												args
											</div>
											<ValidatorDisplay validator={fn.args} />
										</div>
										<div
											className="rounded-xl p-3"
											style={{
												backgroundColor: "var(--phoenix-app-surface)",
												boxShadow:
													"0 1px 0 0 rgba(255,255,255,0.05) inset, 0 1px 3px 0 rgba(0,0,0,0.5)",
											}}
										>
											<div
												className="text-[11px] uppercase tracking-wide"
												style={{ color: "var(--phoenix-text-muted)" }}
											>
												returns
											</div>
											<ValidatorDisplay validator={fn.returns} />
										</div>
									</div>

									{docsLink && !customization?.hideConvexDocsLinks ? (
										<div className="mt-3 text-[11px] text-slate-400">
											<a
												href={docsLink.href}
												target="_blank"
												rel="noreferrer"
												className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-100"
											>
												<span>Learn more about {docsLink.label}</span>
												<span aria-hidden="true">↗</span>
											</a>
										</div>
									) : null}
								</li>
							);
						})}
					</ul>
				</div>

				<aside className="mt-8">
					<div className="sticky top-24 space-y-6 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 pb-6">
						<details
							className="rounded-2xl phoenix-glass overflow-hidden group"
							open={module.functions.length <= 10}
						>
							<summary className="px-4 py-3 border-b border-white/10 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2">
								<div
									className="text-xs font-semibold uppercase tracking-wide"
									style={{ color: "var(--phoenix-text)" }}
								>
									Functions in this module
								</div>
								<span
									className="text-slate-500 transition-transform group-open:rotate-180"
									aria-hidden
								>
									▼
								</span>
							</summary>
							<div className="max-h-[30vh] overflow-auto p-2">
								<ul className="space-y-1">
									{module.functions.map((fn) => (
										<li key={fn.identifier}>
											<a
												href={`#fn-${fn.identifier.replace(/:/g, "-")}`}
												data-toc-id={`fn-${fn.identifier.replace(/:/g, "-")}`}
												className="block rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors truncate"
											>
												{fn.identifier.replace(/\.js:/i, ":")}
											</a>
										</li>
									))}
								</ul>
							</div>
						</details>

						<div
							id="convexdoc-runner-panel"
							className="rounded-2xl phoenix-glass overflow-hidden"
						>
							<div className="px-4 py-3 border-b border-white/10">
								<div
									className="text-sm font-semibold"
									style={{ color: "var(--phoenix-text)" }}
								>
									Function Runner
								</div>
								<div
									className="mt-1 text-xs"
									style={{ color: "var(--phoenix-text-muted)" }}
								>
									Select a function to run it.
								</div>
							</div>
							<div
								className="p-4 text-sm"
								style={{ color: "var(--phoenix-text-muted)" }}
							>
								<div
									className="rounded-xl p-3"
									style={{
										backgroundColor: "var(--phoenix-app-surface)",
										boxShadow:
											"0 1px 0 0 rgba(255,255,255,0.05) inset, 0 1px 3px 0 rgba(0,0,0,0.5)",
									}}
								>
									Waiting for selection…
								</div>
							</div>
						</div>
					</div>
				</aside>
			</div>
		</Layout>
	);
}
