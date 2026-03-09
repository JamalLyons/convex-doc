/**
 * JSX page components for ConvexDoc static HTML output.
 * Uses jsx-async-runtime; attributes are HTML-style (class, not className).
 */

import type { ReactNode } from "react";
import type {
	ConvexFunctionSpec,
	ConvexModule,
	ParsedFunctionSpec,
} from "./function-spec.js";

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
}

export interface IndexPageProps extends PageProps {
	spec: ParsedFunctionSpec;
}

export interface ModulePageProps extends PageProps {
	module: ConvexModule;
	/** Pre-formatted validator strings for args/returns */
	formatArgs: (fn: ConvexFunctionSpec) => string;
	formatReturns: (fn: ConvexFunctionSpec) => string;
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

function moduleDisplayName(name: string): string {
	if (name === "http") return "built-in: http";
	if (name === "(root)") return "root";
	if (name === "unresolved") return "unresolved";
	return name;
}

function Layout({
	children,
	title,
	baseHref = "",
	nav,
}: PageProps & { children?: ReactNode }) {
	const indexHref = baseHref ? `${baseHref}index.html` : "index.html";
	const modules = nav.spec.modules;
	return (
		<html lang="en" className="h-full scroll-pt-24">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>{`${title} — ConvexDoc`}</title>
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
				className="h-full antialiased"
				style={{
					backgroundColor: "var(--phoenix-app-bg)",
					color: "var(--phoenix-text)",
				}}
			>
				<div className="pointer-events-none fixed inset-0 -z-10">
					<div className="absolute inset-0 bg-[radial-gradient(1000px_circle_at_20%_-10%,rgba(56,189,248,0.18),transparent_40%),radial-gradient(800px_circle_at_90%_0%,rgba(217,70,239,0.14),transparent_45%),radial-gradient(900px_circle_at_40%_120%,rgba(16,185,129,0.12),transparent_50%)]" />
					<div className="absolute inset-0 opacity-[0.08] bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22120%22%20height=%22120%22%20viewBox=%220%200%20120%20120%22%3E%3Cfilter%20id=%22n%22%3E%3CfeTurbulence%20type=%22fractalNoise%22%20baseFrequency=%220.8%22%20numOctaves=%222%22%20stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect%20width=%22120%22%20height=%22120%22%20filter=%22url(%23n)%22%20opacity=%220.35%22/%3E%3C/svg%3E')]" />
				</div>

				<header className="sticky top-0 z-20 phoenix-glass">
					<div className="mx-auto max-w-[1280px] px-4 sm:px-6">
						<div className="flex h-16 items-center gap-3">
							<a
								href={indexHref}
								className="group inline-flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5"
							>
								<span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/5 ring-1 ring-white/10">
									<span className="h-2.5 w-2.5 rounded-sm bg-sky-300/80" />
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
								className="group hidden sm:flex flex-1 items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-left ring-1 ring-white/10 hover:bg-white/7.5"
							>
								<span className="text-sm text-slate-300 group-hover:text-slate-200">
									Search modules & functions…
								</span>
								<span className="inline-flex items-center gap-1 rounded-md bg-black/30 px-2 py-1 text-xs text-slate-300 ring-1 ring-white/10">
									<span className="font-mono">⌘</span>
									<span className="font-mono">K</span>
								</span>
							</button>

							<a
								href="https://docs.convex.dev"
								className="ml-auto hidden sm:inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5"
							>
								Convex docs
							</a>
							
							<button
								type="button"
								id="theme-toggle"
								className="ml-2 inline-flex items-center justify-center rounded-lg bg-white/5 p-2 text-sm text-slate-300 ring-1 ring-white/10 hover:bg-white/7.5 hover:text-white"
								aria-label="Toggle light/dark mode"
							>
								🌙
							</button>
						</div>
					</div>
				</header>

				<div className="mx-auto max-w-[1280px] px-4 sm:px-6">
					<div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-8 py-8">
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

				<footer className="border-t border-white/10">
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
					<div className="mx-auto mt-24 w-[min(720px,calc(100vw-2rem))] rounded-2xl bg-slate-950 ring-1 ring-white/15 shadow-[0_30px_90px_rgba(0,0,0,0.7)] overflow-hidden">
						<div className="border-b border-white/10 p-3">
							<input
								id="convexdoc-search-input"
								className="w-full rounded-xl bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
								placeholder="Search… (type function identifier or name)"
								autoComplete="off"
							/>
						</div>
						<div
							id="convexdoc-search-results"
							className="max-h-[60vh] overflow-auto p-2"
						>
							<div className="px-2 py-6 text-sm text-slate-400">
								Type to search functions.
							</div>
						</div>
					</div>
				</dialog>
			</body>
		</html>
	);
}

export function IndexPage({ spec, title, baseHref = "", nav }: IndexPageProps) {
	const { summary, modules } = spec;
	return (
		<Layout title={title} baseHref={baseHref} nav={nav}>
			<section className="mb-10">
				<h1 className="font-[Sora] text-3xl sm:text-4xl font-semibold tracking-tight">
					API Overview
				</h1>
				<p className="mt-2 text-slate-300 max-w-2xl">
					Premium, auto-generated docs for your Convex deployment—with
					interactive tools when served locally.
				</p>
			</section>

			<section className="mb-10">
				<h2 className="font-[Sora] text-lg font-semibold text-slate-100 mb-4">
					Summary
				</h2>
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
					<div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
						<div className="text-2xl font-semibold text-white">
							{summary.total}
						</div>
						<div className="text-xs text-slate-400 mt-1">Total</div>
					</div>
					<div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
						<div className="text-2xl font-semibold text-sky-200">
							{summary.queries}
						</div>
						<div className="text-xs text-slate-400 mt-1">Queries</div>
					</div>
					<div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
						<div className="text-2xl font-semibold text-emerald-200">
							{summary.mutations}
						</div>
						<div className="text-xs text-slate-400 mt-1">Mutations</div>
					</div>
					<div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
						<div className="text-2xl font-semibold text-fuchsia-200">
							{summary.actions}
						</div>
						<div className="text-xs text-slate-400 mt-1">Actions</div>
					</div>
					{summary.httpActions > 0 ? (
						<div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
							<div className="text-2xl font-semibold text-cyan-200">
								{summary.httpActions}
							</div>
							<div className="text-xs text-slate-400 mt-1">HTTP Actions</div>
						</div>
					) : null}
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
									<span className="mt-2 block text-xs text-slate-400">
										Open module documentation and interactive tools.
									</span>
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
	formatArgs,
	formatReturns,
	title,
	baseHref = "",
	nav,
}: ModulePageProps) {
	const indexHref = baseHref ? `${baseHref}index.html` : "index.html";
	return (
		<Layout title={title} baseHref={baseHref} nav={nav}>
			<nav className="text-xs text-slate-400 mb-4">
				<a href={indexHref} className="hover:text-slate-200">
					Overview
				</a>
				<span className="mx-2 text-slate-600">/</span>
				<span className="text-slate-200">{moduleDisplayName(module.name)}</span>
			</nav>

			<div className="flex flex-wrap items-end justify-between gap-4 mb-8">
				<div>
					<h1 className="font-[Sora] text-3xl sm:text-4xl font-semibold tracking-tight">
						{moduleDisplayName(module.name)}
					</h1>
					<p className="mt-2 text-slate-300">
						{module.functions.length} function
						{module.functions.length === 1 ? "" : "s"} in this module.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						id="convexdoc-open-runner-help"
						className="inline-flex items-center rounded-xl bg-white/5 px-3 py-2 text-sm text-slate-200 ring-1 ring-white/10 hover:bg-white/7.5"
					>
						Local runner info
					</button>
				</div>
			</div>

			<p className="mb-6 text-xs text-slate-400">
				Interactive tools require JavaScript and are fully enabled when served
				via <code className="font-mono text-slate-200">convexdoc serve</code>.
			</p>

			<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6">
				<div className="min-w-0">
					<ul className="space-y-5">
						{module.functions.map((fn) => {
							const argsStr = formatArgs(fn);
							const returnsStr = formatReturns(fn);
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
											{fn.identifier}
										</span>
										<button
											type="button"
											className="ml-auto inline-flex items-center rounded-lg phoenix-btn-primary px-3 py-1.5 text-xs text-white shadow-md shadow-red-500/20"
											data-convexdoc-try
										>
											Try it
										</button>
									</div>

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
											<div
												className="mt-2 font-mono text-xs break-words"
												style={{ color: "var(--phoenix-text-dim)" }}
											>
												{argsStr}
											</div>
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
											<div
												className="mt-2 font-mono text-xs break-words"
												style={{ color: "var(--phoenix-text-dim)" }}
											>
												{returnsStr}
											</div>
										</div>
									</div>

									<div
										className="mt-4 hidden"
										data-convexdoc-inline-runner
										aria-hidden="true"
									>
										<div className="rounded-xl bg-black/35 ring-1 ring-white/10 p-3 text-sm text-slate-300">
											Runner UI will load here when served locally.
										</div>
									</div>
								</li>
							);
						})}
					</ul>
				</div>

				<aside className="hidden xl:block mt-8">
					<div className="sticky top-24 space-y-6">
						<div className="rounded-2xl phoenix-glass overflow-hidden">
							<div className="px-4 py-3 border-b border-white/10">
								<div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--phoenix-text)" }}>
									Functions in this module
								</div>
							</div>
							<div className="max-h-[30vh] overflow-auto p-2">
								<ul className="space-y-1">
									{module.functions.map(fn => (
										<li key={fn.identifier}>
											<a href={`#fn-${fn.identifier.replace(/:/g, "-")}`} data-toc-id={`fn-${fn.identifier.replace(/:/g, "-")}`} className="block rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors truncate">
												{fn.identifier}
											</a>
										</li>
									))}
								</ul>
							</div>
						</div>

						<div
							id="convexdoc-runner-panel"
							className="rounded-2xl phoenix-glass overflow-hidden"
						>
							<div className="px-4 py-3 border-b border-white/10">
								<div
									className="text-sm font-semibold"
									style={{ color: "var(--phoenix-text)" }}
								>
									Try it
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

			<dialog
				id="convexdoc-runner-help"
				className="backdrop:bg-black/70 backdrop:backdrop-blur-sm bg-transparent p-0"
			>
				<div className="mx-auto mt-24 w-[min(720px,calc(100vw-2rem))] rounded-2xl bg-slate-950 ring-1 ring-white/15 shadow-[0_30px_90px_rgba(0,0,0,0.7)] overflow-hidden">
					<div className="border-b border-white/10 px-4 py-3 flex items-center justify-between">
						<div className="text-sm font-semibold text-white">Local runner</div>
						<button
							type="button"
							className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-slate-200 ring-1 ring-white/10 hover:bg-white/7.5"
							data-convexdoc-close="convexdoc-runner-help"
						>
							Close
						</button>
					</div>
					<div className="p-4 text-sm text-slate-300 space-y-3">
						<p>
							To enable interactive execution (queries/mutations/actions), serve
							these docs with{" "}
							<code className="font-mono text-slate-200">convexdoc serve</code>.
						</p>
						<p className="text-xs text-slate-400">
							The static HTML is safe to publish; the runner is a localhost-only
							proxy so secrets never ship in the generated output.
						</p>
					</div>
				</div>
			</dialog>
		</Layout>
	);
}
