/**
 * Generates static HTML docs from a parsed Convex function spec.
 * Output: convex/docs/ with index.html, one page per module, and Tailwind CSS.
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmdirSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { execa } from "execa";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type {
	ConvexFunctionSpec,
	ParsedFunctionSpec,
} from "./function-spec.js";
import { extractHttpRoutes } from "./http-routes.js";
import { IndexPage, ModulePage } from "./pages.js";
import { formatValidator, getFunctionName, getModuleName } from "./parser.js";

const TAILWIND_INPUT_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;

/* ConvexDoc base */
html { font-family: Sora, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
code, pre, kbd, samp { font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
dialog::backdrop { background: rgba(0,0,0,0.7); }
`;

const APP_JS = `// ConvexDoc client enhancements (static site)
const MANIFEST_URL = "./convexdoc.manifest.json";

async function loadManifest() {
  const res = await fetch(MANIFEST_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load manifest");
  return await res.json();
}

function q(id) {
  return document.getElementById(id);
}

function openDialog(d) {
  if (!d) return;
  if (typeof d.showModal === "function") d.showModal();
}

function closeDialog(d) {
  if (!d) return;
  if (typeof d.close === "function") d.close();
}

function attachSearch(manifestPromise) {
  const openBtn = q("convexdoc-search-open");
  const dialog = q("convexdoc-search");
  const input = q("convexdoc-search-input");
  const results = q("convexdoc-search-results");

  function renderEmpty() {
    if (!results) return;
    results.innerHTML = '<div class="px-2 py-6 text-sm text-slate-400">Type to search functions.</div>';
  }

  function renderItems(items) {
    if (!results) return;
    if (!items.length) {
      results.innerHTML = '<div class="px-2 py-6 text-sm text-slate-400">No matches.</div>';
      return;
    }
    results.innerHTML = items
      .slice(0, 30)
      .map((it) => {
        const href = it.href;
        const badgeClass =
          it.functionType === "query"
            ? "bg-sky-500/15 text-sky-200 ring-1 ring-inset ring-sky-400/30"
            : it.functionType === "mutation"
              ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-400/30"
              : it.functionType === "action"
                ? "bg-fuchsia-500/15 text-fuchsia-200 ring-1 ring-inset ring-fuchsia-400/30"
                : "bg-slate-500/15 text-slate-200 ring-1 ring-inset ring-slate-400/30";
        return \`
<a class="block rounded-xl px-3 py-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10" href="\${href}">
  <div class="flex items-center gap-2">
    <span class="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-medium \${badgeClass}">\${it.functionType}</span>
    <span class="font-mono text-sm text-white">\${it.identifier}</span>
  </div>
  <div class="mt-1 text-xs text-slate-400">\${it.moduleName}</div>
</a>\`;
      })
      .join("");
  }

  async function onInput() {
    if (!input) return;
    const term = input.value.trim().toLowerCase();
    if (!term) return renderEmpty();

    let manifest;
    try {
      manifest = await manifestPromise;
    } catch {
      results.innerHTML = '<div class="px-2 py-6 text-sm text-rose-200">Failed to load search index.</div>';
      return;
    }

    const items = (manifest.functions ?? [])
      .map((fn) => {
        const identifier = fn.identifier;
        const moduleName = fn.moduleName ?? "";
        const score =
          identifier.toLowerCase().includes(term) ? 0 :
          (fn.name ?? "").toLowerCase().includes(term) ? 1 :
          moduleName.toLowerCase().includes(term) ? 2 : 999;
        return { ...fn, identifier, moduleName, score };
      })
      .filter((x) => x.score !== 999)
      .sort((a, b) => a.score - b.score || a.identifier.localeCompare(b.identifier))
      .map((fn) => ({ ...fn, href: fn.href ?? "#" }));

    renderItems(items);
  }

  openBtn?.addEventListener("click", () => {
    openDialog(dialog);
    setTimeout(() => input?.focus(), 0);
  });

  dialog?.addEventListener("click", (e) => {
    if (e.target === dialog) closeDialog(dialog);
  });

  document.addEventListener("keydown", (e) => {
    const isMac = navigator.platform.toLowerCase().includes("mac");
    const hotkey = isMac ? e.metaKey && e.key.toLowerCase() === "k" : e.ctrlKey && e.key.toLowerCase() === "k";
    if (hotkey) {
      e.preventDefault();
      openDialog(dialog);
      setTimeout(() => input?.focus(), 0);
    }
    if (e.key === "Escape" && dialog?.open) closeDialog(dialog);
  });

  input?.addEventListener("input", onInput);
  renderEmpty();
}

function attachHelpDialog() {
  const open = q("convexdoc-open-runner-help");
  const dialog = q("convexdoc-runner-help");
  open?.addEventListener("click", (e) => {
    e.preventDefault();
    openDialog(dialog);
  });
  dialog?.addEventListener("click", (e) => {
    if (e.target === dialog) closeDialog(dialog);
  });
  document.querySelectorAll("[data-convexdoc-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeDialog(dialog));
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function prettyJson(v) {
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

function badgeClass(type) {
  return type === "query"
    ? "bg-sky-500/15 text-sky-200 ring-1 ring-inset ring-sky-400/30"
    : type === "mutation"
      ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-400/30"
      : type === "action"
        ? "bg-fuchsia-500/15 text-fuchsia-200 ring-1 ring-inset ring-fuchsia-400/30"
        : "bg-slate-500/15 text-slate-200 ring-1 ring-inset ring-slate-400/30";
}

function buildFormFromObjectValidator(rootValidator, initialArgs) {
  const fields = rootValidator?.fields ?? {};
  const state = { ...initialArgs };

  function inputForField(name, field) {
    const v = field.fieldType;
    const optional = !!field.optional;
    const cur = state[name];

    const common = \`data-field="\${escapeHtml(name)}"\`;
    const label = \`
      <div class="flex items-center justify-between">
        <div class="text-xs font-semibold text-slate-200">\${escapeHtml(name)}\${optional ? '<span class="ml-1 text-slate-400">(optional)</span>' : ""}</div>
        <div class="text-[11px] text-slate-400 font-mono">\${escapeHtml(v?.type ?? "any")}</div>
      </div>\`;

    const jsonFallback = \`
      \${label}
      <textarea \${common} class="mt-2 w-full h-24 rounded-xl bg-white/5 px-3 py-2 text-xs font-mono text-white placeholder:text-slate-500 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400/40" placeholder="JSON value">\${cur != null ? escapeHtml(prettyJson(cur)) : ""}</textarea>
      <div class="mt-1 text-[11px] text-slate-500">Enter a JSON value for complex types.</div>\`;

    if (!v || !v.type) return jsonFallback;

    if (v.type === "string" || v.type === "id" || v.type === "bytes" || v.type === "any") {
      const placeholder = v.type === "id" ? 'Id<"...">' : "";
      return \`
        \${label}
        <input \${common} class="mt-2 w-full rounded-xl bg-white/5 px-3 py-2 text-xs font-mono text-white placeholder:text-slate-500 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400/40" value="\${cur ?? ""}" placeholder="\${placeholder}" />\`;
    }
    if (v.type === "number" || v.type === "float64" || v.type === "bigint" || v.type === "int64") {
      return \`
        \${label}
        <input \${common} type="number" class="mt-2 w-full rounded-xl bg-white/5 px-3 py-2 text-xs font-mono text-white placeholder:text-slate-500 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400/40" value="\${cur ?? ""}" />\`;
    }
    if (v.type === "boolean") {
      const checked = cur === true ? "checked" : "";
      return \`
        \${label}
        <label class="mt-2 inline-flex items-center gap-2 text-xs text-slate-200">
          <input \${common} type="checkbox" \${checked} class="h-4 w-4 rounded bg-white/10 ring-1 ring-white/20" />
          <span>\${cur === true ? "true" : "false"}</span>
        </label>\`;
    }
    if (v.type === "literal") {
      const val = v.value;
      state[name] = val;
      return \`
        \${label}
        <div class="mt-2 rounded-xl bg-black/30 ring-1 ring-white/10 px-3 py-2 text-xs font-mono text-slate-200">\${escapeHtml(JSON.stringify(val))}</div>\`;
    }
    if (v.type === "union") {
      // Keep it simple: JSON fallback.
      return jsonFallback;
    }
    if (v.type === "object") {
      // Nested object: JSON fallback for now.
      return jsonFallback;
    }
    if (v.type === "array" || v.type === "set" || v.type === "map" || v.type === "record") {
      return jsonFallback;
    }
    return jsonFallback;
  }

  const html = Object.entries(fields)
    .map(([name, field]) => \`<div class="rounded-xl bg-black/20 ring-1 ring-white/10 p-3">\${inputForField(name, field)}</div>\`)
    .join("");

  function applyFromDom(container) {
    container.querySelectorAll("[data-field]").forEach((el) => {
      const name = el.getAttribute("data-field");
      if (!name) return;
      if (el.tagName === "INPUT" && el.type === "checkbox") {
        state[name] = el.checked;
        return;
      }
      const raw = el.value;
      const v = fields[name]?.fieldType;
      if (raw === "" && fields[name]?.optional) {
        delete state[name];
        return;
      }
      if (el.tagName === "TEXTAREA") {
        try {
          state[name] = raw.trim() ? JSON.parse(raw) : undefined;
        } catch {
          state[name] = raw;
        }
        return;
      }
      if (v?.type === "number" || v?.type === "float64" || v?.type === "int64" || v?.type === "bigint") {
        const n = Number(raw);
        if (!Number.isNaN(n)) state[name] = n;
        return;
      }
      state[name] = raw;
    });
    return { ...state };
  }

  return { html, applyFromDom };
}

function attachRunner(manifestPromise) {
  const panel = q("convexdoc-runner-panel");
  const panelBody = panel?.querySelector(".p-4");
  if (!panel || !panelBody) return;

  function setPanel(html) {
    panelBody.innerHTML = html;
  }

  async function runFunction(fn, args, bearerToken) {
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
    let json;
    try { json = JSON.parse(text); } catch { json = { status: "error", errorMessage: text }; }
    return { httpStatus: res.status, durationMs, json };
  }

  async function renderRunner(identifier, fnType) {
    let manifest = null;
    try { manifest = await manifestPromise; } catch { manifest = null; }
    if (!manifest) {
      setPanel(\`
        <div class="rounded-xl bg-black/30 ring-1 ring-rose-400/30 p-3">
          <div class="text-sm text-rose-200 font-semibold">Manifest unavailable</div>
          <div class="mt-2 text-xs text-slate-400">Re-run <code class="font-mono text-slate-200">convexdoc generate</code>.</div>
        </div>\`);
      return;
    }

    const fn = (manifest.functions ?? []).find((f) => f.identifier === identifier);
    if (!fn) {
      setPanel(\`
        <div class="rounded-xl bg-black/30 ring-1 ring-white/10 p-3">
          <div class="text-sm text-slate-200 font-semibold">Function not found</div>
        </div>\`);
      return;
    }

    if (fn.functionType === "httpAction") {
      setPanel(\`
        <div class="rounded-xl bg-black/30 ring-1 ring-white/10 p-3">
          <div class="text-sm text-slate-200 font-semibold">HTTP action</div>
          <div class="mt-2 text-xs text-slate-400">Use the HTTP routes panel (coming next) to test HTTP actions.</div>
        </div>\`);
      return;
    }

    const storageKey = \`convexdoc:args:\${fn.identifier}\`;
    const tokenKey = "convexdoc:bearerToken";
    const savedArgsRaw = localStorage.getItem(storageKey) ?? "{}";
    const savedToken = localStorage.getItem(tokenKey) ?? "";

    let argsObj = {};
    try { argsObj = JSON.parse(savedArgsRaw); } catch { argsObj = {}; }

    const docs = (manifest.docsByIdentifier ?? {})[fn.identifier] ?? null;
    const summary = docs?.summary ? String(docs.summary) : "";
    const details = docs?.detailsMarkdown ? String(docs.detailsMarkdown) : "";

    const canForm = fn.args && fn.args.type === "object";
    const form = canForm ? buildFormFromObjectValidator(fn.args, argsObj) : null;

    setPanel(\`
      <div class="space-y-3">
        <div class="rounded-xl bg-black/30 ring-1 ring-white/10 p-3">
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-medium \${badgeClass(fn.functionType)}">\${fn.functionType}</span>
            <div class="font-mono text-xs text-white truncate">\${escapeHtml(fn.identifier)}</div>
          </div>
          \${summary ? \`<div class="mt-2 text-xs text-slate-300">\${escapeHtml(summary)}</div>\` : ""}
          \${details ? \`<div class="mt-2 text-xs text-slate-400 whitespace-pre-wrap">\${escapeHtml(details)}</div>\` : ""}
        </div>

        <div class="rounded-xl bg-black/30 ring-1 ring-white/10 p-3">
          <div class="text-xs font-semibold text-slate-200">Auth (optional)</div>
          <input id="convexdoc-bearer" class="mt-2 w-full rounded-xl bg-white/5 px-3 py-2 text-xs font-mono text-white placeholder:text-slate-500 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400/40" placeholder="Bearer token" value="\${escapeHtml(savedToken)}" />
          <div class="mt-1 text-[11px] text-slate-500">Sent as <code class="font-mono">Authorization: Bearer …</code>.</div>
        </div>

        <div class="rounded-xl bg-black/30 ring-1 ring-white/10 overflow-hidden">
          <div class="flex items-center gap-2 px-3 py-2 border-b border-white/10">
            <button type="button" id="convexdoc-tab-json" class="rounded-lg bg-white/5 px-2.5 py-1 text-xs text-slate-200 ring-1 ring-white/10">JSON</button>
            \${canForm ? '<button type="button" id="convexdoc-tab-form" class="rounded-lg bg-transparent px-2.5 py-1 text-xs text-slate-300 hover:text-white">Form</button>' : ""}
            <div class="ml-auto">
              <button type="button" id="convexdoc-run" class="rounded-lg bg-sky-400/10 px-3 py-1.5 text-xs text-sky-100 ring-1 ring-sky-400/30 hover:bg-sky-400/15">Run</button>
            </div>
          </div>
          <div class="p-3">
            <div id="convexdoc-json-pane">
              <textarea id="convexdoc-args-json" class="w-full h-36 rounded-xl bg-white/5 px-3 py-2 text-xs font-mono text-white placeholder:text-slate-500 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400/40">\${escapeHtml(savedArgsRaw)}</textarea>
              <div class="mt-1 text-[11px] text-slate-500">Arguments object passed to the function.</div>
            </div>
            \${canForm ? \`<div id="convexdoc-form-pane" class="hidden space-y-2">\${form.html}</div>\` : ""}
          </div>
        </div>

        <div id="convexdoc-response" class="rounded-xl bg-black/30 ring-1 ring-white/10 p-3">
          <div class="text-xs text-slate-400">Response will appear here.</div>
        </div>
      </div>\`);

    const bearerEl = q("convexdoc-bearer");
    const jsonTab = q("convexdoc-tab-json");
    const formTab = q("convexdoc-tab-form");
    const jsonPane = q("convexdoc-json-pane");
    const formPane = q("convexdoc-form-pane");
    const runBtn = q("convexdoc-run");
    const jsonArgsEl = q("convexdoc-args-json");
    const respEl = q("convexdoc-response");

    let mode = "json";
    function setMode(next) {
      mode = next;
      if (mode === "json") {
        jsonPane?.classList.remove("hidden");
        formPane?.classList.add("hidden");
        jsonTab?.classList.add("bg-white/5","ring-1","ring-white/10");
        jsonTab?.classList.remove("bg-transparent");
        formTab?.classList.remove("bg-white/5","ring-1","ring-white/10");
      } else {
        jsonPane?.classList.add("hidden");
        formPane?.classList.remove("hidden");
        formTab?.classList.add("bg-white/5","ring-1","ring-white/10");
        jsonTab?.classList.remove("bg-white/5","ring-1","ring-white/10");
      }
    }

    jsonTab?.addEventListener("click", () => setMode("json"));
    formTab?.addEventListener("click", () => setMode("form"));

    bearerEl?.addEventListener("input", () => {
      localStorage.setItem(tokenKey, bearerEl.value);
    });

    async function onRun() {
      let args = {};
      const bearerToken = bearerEl?.value?.trim() ?? "";
      try {
        if (mode === "form" && canForm && formPane) {
          args = form.applyFromDom(formPane);
          if (jsonArgsEl) jsonArgsEl.value = prettyJson(args);
        } else {
          args = jsonArgsEl?.value?.trim() ? JSON.parse(jsonArgsEl.value) : {};
        }
      } catch (e) {
        respEl.innerHTML = \`
          <div class="text-sm text-rose-200 font-semibold">Invalid args</div>
          <div class="mt-2 text-xs text-slate-400">\${escapeHtml(e?.message ?? String(e))}</div>\`;
        return;
      }

      localStorage.setItem(storageKey, prettyJson(args));
      respEl.innerHTML = '<div class="text-xs text-slate-400">Running…</div>';

      try {
        const { httpStatus, durationMs, json } = await runFunction(fn, args, bearerToken);
        const ok = json?.status === "success";
        const title = ok ? "Success" : "Error";
        const titleClass = ok ? "text-emerald-200" : "text-rose-200";
        const logs = Array.isArray(json?.logLines) ? json.logLines : [];
        const value = ok ? json.value : (json?.errorMessage ?? json?.message ?? "Unknown error");
        respEl.innerHTML = \`
          <div class="flex items-center justify-between gap-3">
            <div class="text-sm font-semibold \${titleClass}">\${title}</div>
            <div class="text-[11px] text-slate-500 font-mono">HTTP \${httpStatus}\${durationMs ? \` • \${durationMs}ms\` : ""}</div>
          </div>
          <div class="mt-3 rounded-xl bg-white/5 ring-1 ring-white/10 p-3">
            <pre class="text-[11px] leading-5 text-slate-200 whitespace-pre-wrap">\${escapeHtml(prettyJson(value))}</pre>
          </div>
          \${logs.length ? \`
            <div class="mt-3 text-xs font-semibold text-slate-200">logLines</div>
            <div class="mt-2 rounded-xl bg-white/5 ring-1 ring-white/10 p-3">
              <pre class="text-[11px] leading-5 text-slate-300 whitespace-pre-wrap">\${escapeHtml(logs.join("\\n"))}</pre>
            </div>\` : ""}\`;
      } catch (e) {
        respEl.innerHTML = \`
          <div class="text-sm text-rose-200 font-semibold">Runner failed</div>
          <div class="mt-2 text-xs text-slate-400">Make sure you’re serving via <code class="font-mono text-slate-200">convexdoc serve</code>.</div>
          <div class="mt-2 text-xs text-slate-500">\${escapeHtml(e?.message ?? String(e))}</div>\`;
      }
    }

    runBtn?.addEventListener("click", onRun);
  }

  document.querySelectorAll("[data-convexdoc-try]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const host = btn.closest("[data-convexdoc-fn]");
      const identifier = host?.getAttribute("data-convexdoc-fn") ?? "(unknown)";
      const type = host?.getAttribute("data-convexdoc-fn-type") ?? "query";
      const inline = host?.querySelector("[data-convexdoc-inline-runner]");
      if (inline) inline.classList.remove("hidden");
      renderRunner(identifier, type);
    });
  });
}

const manifestPromise = loadManifest().catch(() => null);
attachSearch(manifestPromise);
attachHelpDialog();
attachRunner(manifestPromise);
`;

async function extractJsDocs(
	projectDir: string,
	spec: ParsedFunctionSpec,
): Promise<Record<string, unknown>> {
	const convexDir = join(projectDir, "convex");

	const listTsFiles = (dir: string): string[] => {
		const out: string[] = [];
		for (const ent of readdirSync(dir)) {
			if (ent === "node_modules" || ent === "dist" || ent === ".git") continue;
			const full = join(dir, ent);
			let st: ReturnType<typeof statSync>;
			try {
				st = statSync(full);
			} catch {
				continue;
			}
			if (st.isDirectory()) {
				out.push(...listTsFiles(full));
				continue;
			}
			if (!st.isFile()) continue;
			if (!ent.endsWith(".ts")) continue;
			if (ent.endsWith(".d.ts")) continue;
			out.push(full);
		}
		return out;
	};

	const moduleNameFromConvexFile = (filePath: string): string => {
		const rel = relative(convexDir, filePath);
		const noExt = rel.replace(/\.ts$/i, "");
		return noExt.split(sep).join("/");
	};

	const isExported = (node: ts.Node): boolean => {
		if (!ts.canHaveModifiers(node)) return false;
		const mods = ts.getModifiers(node);
		return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
	};

	const calledName = (expr: ts.Expression): string | null => {
		if (!ts.isCallExpression(expr)) return null;
		const callee = expr.expression;
		if (ts.isIdentifier(callee)) return callee.text;
		if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
		return null;
	};

	const getJSDocText = (node: ts.Node) => {
		const jsDocs = ts
			.getJSDocCommentsAndTags(node)
			.filter((n): n is ts.JSDoc => ts.isJSDoc(n));

		let fullComment = "";
		const examples: string[] = [];
		let deprecated = false;
		const tags: string[] = [];

		for (const doc of jsDocs) {
			if (typeof doc.comment === "string") {
				fullComment = String(doc.comment);
			}
			for (const tag of doc.tags ?? []) {
				const tagName = tag.tagName.getText();
				if (tagName === "deprecated") deprecated = true;
				if (tagName === "example") {
					const c = (tag.comment ?? "").toString();
					if (c.trim()) examples.push(c.trim());
				}
				if (tagName === "tag" || tagName === "tags") {
					const c = (tag.comment ?? "").toString();
					for (const t of c.split(/[,\n]/g)) {
						const trimmed = t.trim();
						if (trimmed) tags.push(trimmed);
					}
				}
			}
		}

		const lines = fullComment
			.split(/\r?\n/g)
			.map((l) => l.trim())
			.filter(Boolean);
		const summary = lines[0];
		const detailsMarkdown =
			lines.length > 1 ? lines.slice(1).join("\n") : undefined;

		return {
			summary,
			detailsMarkdown,
			examples,
			deprecated,
			tags,
		};
	};

	let files: string[] = [];
	try {
		files = listTsFiles(convexDir);
	} catch {
		return {};
	}

	const out: Record<string, unknown> = {};

	for (const file of files) {
		let sourceText = "";
		try {
			sourceText = readFileSync(file, "utf-8");
		} catch {
			continue;
		}
		const sf = ts.createSourceFile(
			file,
			sourceText,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		);

		const moduleName = moduleNameFromConvexFile(file);

		const visit = (node: ts.Node) => {
			if (ts.isVariableStatement(node) && isExported(node)) {
				for (const decl of node.declarationList.declarations) {
					if (!ts.isIdentifier(decl.name)) continue;
					const exportName = decl.name.text;
					const init = decl.initializer;
					if (!init) continue;
					const callee = calledName(init);
					if (!callee) continue;
					if (
						callee !== "query" &&
						callee !== "mutation" &&
						callee !== "action" &&
						callee !== "httpAction"
					) {
						continue;
					}

					const identifier = `${moduleName}:${exportName}`;
					if (!spec.byIdentifier.has(identifier)) continue;

					const doc = getJSDocText(decl);
					if (
						!doc.summary &&
						!doc.detailsMarkdown &&
						!doc.examples.length &&
						!doc.deprecated &&
						!doc.tags.length
					) {
						continue;
					}

					out[identifier] = {
						summary: doc.summary,
						detailsMarkdown: doc.detailsMarkdown,
						examples: doc.examples.length ? doc.examples : undefined,
						deprecated: doc.deprecated || undefined,
						tags: doc.tags.length ? doc.tags : undefined,
					};
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(sf);
	}

	return out;
}

/** Slug for module name to safe filename (no path separators, no special chars). */
export function moduleToSlug(name: string): string {
	if (name === "(root)") return "root";
	return name.replace(/\//g, "_").replace(/[^a-zA-Z0-9_-]/g, "_") || "module";
}

/**
 * Build module slug map. Index page uses "index" for linking to self; module pages use their slug.
 */
export function buildModuleSlugs(
	spec: ParsedFunctionSpec,
): Map<string, string> {
	const map = new Map<string, string>();
	for (const mod of spec.modules) {
		map.set(mod.name, moduleToSlug(mod.name));
	}
	return map;
}

function formatArgs(fn: ConvexFunctionSpec): string {
	if (!fn.args) return "none";
	return formatValidator(fn.args);
}

function formatReturns(fn: ConvexFunctionSpec): string {
	if (!fn.returns) return "none";
	return formatValidator(fn.returns);
}

/**
 * Generate static HTML and CSS into outputDir (e.g. project/convex/docs).
 * Ensures outputDir exists, writes index.html + one HTML file per module, then runs Tailwind.
 */
export async function generateDocs(
	spec: ParsedFunctionSpec,
	outputDir: string,
	projectDir: string,
): Promise<void> {
	if (existsSync(outputDir)) {
		rmSync(outputDir, { recursive: true });
	}
	mkdirSync(outputDir, { recursive: true });

	const baseHref = ""; // same dir as index
	const moduleSlugs = buildModuleSlugs(spec);

	// Write client JS scaffold
	writeFileSync(join(outputDir, "app.js"), APP_JS, "utf-8");

	// JSDoc enrichment (best-effort)
	const docsByIdentifier = await extractJsDocs(projectDir, spec);
	const httpRoutes = await extractHttpRoutes(projectDir, spec);

	// Write manifest scaffold (HTTP routes merged later)
	const functions = spec.raw.map((fn) => {
		const moduleName = getModuleName(fn.identifier);
		const moduleSlug = moduleSlugs.get(moduleName) ?? moduleToSlug(moduleName);
		const anchor = `fn-${fn.identifier.replace(/:/g, "-")}`;
		return {
			identifier: fn.identifier,
			name: getFunctionName(fn.identifier),
			moduleName,
			functionType: fn.functionType,
			visibility: fn.visibility?.kind ?? "public",
			args: fn.args ?? null,
			returns: fn.returns ?? null,
			href: `${moduleSlug}.html#${anchor}`,
		};
	});

	const manifest = {
		buildInfo: {
			generatedAt: new Date().toISOString(),
		},
		summary: spec.summary,
		modules: spec.modules.map((m) => ({
			name: m.name,
			slug: moduleSlugs.get(m.name) ?? moduleToSlug(m.name),
			functionCount: m.functions.length,
		})),
		functions,
		docsByIdentifier,
		httpRoutes,
	};
	writeFileSync(
		join(outputDir, "convexdoc.manifest.json"),
		JSON.stringify(manifest, null, 2),
		"utf-8",
	);

	// Index page
	const indexHtml =
		"<!DOCTYPE html>\n" +
		renderToStaticMarkup(
			<IndexPage
				spec={spec}
				title="API Overview"
				baseHref={baseHref}
				nav={{ spec, moduleSlugs }}
			/>,
		);
	writeFileSync(join(outputDir, "index.html"), indexHtml, "utf-8");

	// Per-module pages
	for (const mod of spec.modules) {
		const slug = moduleSlugs.get(mod.name) ?? moduleToSlug(mod.name);
		const filename = `${slug}.html`;
		const pageHtml =
			"<!DOCTYPE html>\n" +
			renderToStaticMarkup(
				<ModulePage
					module={mod}
					formatArgs={formatArgs}
					formatReturns={formatReturns}
					title={mod.name}
					baseHref={baseHref}
					nav={{ spec, moduleSlugs, activeModuleName: mod.name }}
				/>,
			);
		writeFileSync(join(outputDir, filename), pageHtml, "utf-8");
	}

	// Tailwind: use a temp dir for config and input so only styles.css is written to outputDir
	const contentGlob = join(outputDir, "*.html")
		.replace(/\\/g, "/")
		.replace(/"/g, '\\"');
	const jsContent = join(outputDir, "app.js")
		.replace(/\\/g, "/")
		.replace(/"/g, '\\"');
	const tmpId = `convexdoc-tailwind-${Date.now()}`;
	const tmpDir = join(tmpdir(), tmpId);
	mkdirSync(tmpDir, { recursive: true });

	const tailwindConfigPath = join(tmpDir, "tailwind.config.cjs");
	const inputCssPath = join(tmpDir, "input.css");
	const outputCssPath = join(outputDir, "styles.css");

	const tailwindConfig = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["${contentGlob}", "${jsContent}"],
  theme: { extend: {} },
  plugins: [],
};
`;
	writeFileSync(tailwindConfigPath, tailwindConfig, "utf-8");
	writeFileSync(inputCssPath, TAILWIND_INPUT_CSS, "utf-8");

	try {
		await execa(
			"npx",
			[
				"--yes",
				"tailwindcss@3",
				"-i",
				inputCssPath,
				"-o",
				outputCssPath,
				"-c",
				tailwindConfigPath,
			],
			{ env: { ...process.env } },
		);
	} finally {
		try {
			unlinkSync(tailwindConfigPath);
			unlinkSync(inputCssPath);
			rmdirSync(tmpDir);
		} catch {
			// ignore cleanup errors
		}
	}
}
