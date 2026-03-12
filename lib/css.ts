export const TAILWIND_INPUT_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;

/* ConvexDoc base */
html {
  font-family: Sora, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
  -webkit-text-size-adjust: 100%;
  scroll-behavior: smooth;
}
body { overflow-x: hidden; }
code, pre, kbd, samp { font-family: 'JetBrains Mono', 'Fira Code', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
dialog::backdrop { background: rgba(0,0,0,0.7); }

/* Theme scrollbars */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--phoenix-zinc-600) var(--phoenix-zinc-900);
}
*::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
*::-webkit-scrollbar-track {
  background: var(--phoenix-zinc-900);
}
*::-webkit-scrollbar-thumb {
  background: var(--phoenix-zinc-600);
  border-radius: 4px;
  border: 2px solid var(--phoenix-zinc-900);
}
*::-webkit-scrollbar-thumb:hover {
  background: var(--phoenix-zinc-500);
}
*::-webkit-scrollbar-corner {
  background: var(--phoenix-zinc-900);
}

/**
 * Phoenix Macro UI theme: Zinc + Red Zone (https://github.com/JamalLyons/phoenix-macro)
 * Glossy, polished (Apple-like) with glass and gradients.
 */
:root {
  --phoenix-zinc-50: #fafafa;
  --phoenix-zinc-100: #f4f4f5;
  --phoenix-zinc-200: #e4e4e7;
  --phoenix-zinc-300: #d4d4d8;
  --phoenix-zinc-400: #a1a1aa;
  --phoenix-zinc-500: #71717a;
  --phoenix-zinc-600: #52525b;
  --phoenix-zinc-700: #3f3f46;
  --phoenix-zinc-800: #27272a;
  --phoenix-zinc-900: #18181b;
  --phoenix-zinc-950: #09090b;
  --phoenix-red-zone: #ef4444;
  --phoenix-red-zone-hover: #dc2626;
  --phoenix-red-zone-glow: rgba(239, 68, 68, 0.35);
  --phoenix-red-zone-gradient-start: #ea580c;
  --phoenix-red-zone-gradient-end: #dc2626;
  --phoenix-red-zone-active-start: #f97316;
  --phoenix-red-zone-active-end: #ef4444;
  --phoenix-glass-bg: rgba(39, 39, 42, 0.65);
  --phoenix-glass-border: rgba(255, 255, 255, 0.08);
  --phoenix-glass-highlight: rgba(255, 255, 255, 0.05);
  --phoenix-glass-blur: 12px;
  --phoenix-app-bg: var(--phoenix-zinc-950);
  --phoenix-app-surface: var(--phoenix-zinc-900);
  --phoenix-text: var(--phoenix-zinc-50);
  --phoenix-text-muted: var(--phoenix-zinc-400);
  --phoenix-text-dim: var(--phoenix-zinc-500);
  --phoenix-success: #22c55e;
  --phoenix-error: var(--phoenix-red-zone);
  --phoenix-border: rgba(255,255,255,0.12);
  --phoenix-border-strong: rgba(255,255,255,0.2);
  --phoenix-input-bg: rgba(255,255,255,0.06);
  --phoenix-hover-surface: rgba(255,255,255,0.06);
}
.phoenix-glass {
  background: var(--phoenix-glass-bg);
  backdrop-filter: blur(var(--phoenix-glass-blur));
  -webkit-backdrop-filter: blur(var(--phoenix-glass-blur));
  border: 1px solid var(--phoenix-glass-border);
  box-shadow: 0 1px 0 0 var(--phoenix-glass-highlight) inset, 0 2px 8px -2px rgba(0,0,0,0.4);
}
.phoenix-btn-primary {
  background: linear-gradient(180deg, var(--phoenix-red-zone-active-start) 0%, var(--phoenix-red-zone-gradient-start) 40%, var(--phoenix-red-zone-gradient-end) 100%);
  color: white;
  border: 1px solid rgba(255,255,255,0.15);
  box-shadow: 0 1px 0 0 rgba(255,255,255,0.2) inset, 0 2px 8px -2px var(--phoenix-red-zone-glow);
  font-weight: 700;
}
.phoenix-btn-primary:hover:not(:disabled) {
  background: linear-gradient(180deg, #fb923c 0%, var(--phoenix-red-zone-active-start) 40%, var(--phoenix-red-zone-hover) 100%);
  box-shadow: 0 1px 0 0 rgba(255,255,255,0.25) inset, 0 4px 12px -2px var(--phoenix-red-zone-glow);
}
.phoenix-btn-ghost {
  background: var(--phoenix-glass-bg);
  color: var(--phoenix-text-muted);
  border: 1px solid var(--phoenix-glass-border);
}
.phoenix-btn-ghost:hover:not(:disabled) {
  background: var(--phoenix-zinc-700);
  color: var(--phoenix-text);
}
.convexdoc-input {
  background: var(--phoenix-input-bg);
  color: var(--phoenix-text);
  border: 1px solid var(--phoenix-border);
}
.convexdoc-input:focus {
  outline: none;
  border-color: var(--phoenix-red-zone);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--phoenix-red-zone) 25%, transparent);
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up {
  animation: fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.toast-enter {
  animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.syntax-string { color: #10b981; }
.syntax-number { color: #f59e0b; }
.syntax-boolean { color: #3b82f6; }
.syntax-null { color: #ef4444; }
.syntax-key { color: #8b5cf6; font-weight: 500; }

/* Landing page markdown / prose */
.convexdoc-prose { color: var(--phoenix-text); }
.convexdoc-prose h1 { font-family: Sora, sans-serif; font-size: 1.875rem; font-weight: 600; margin-bottom: 0.5rem; }
.convexdoc-prose h2 { font-family: Sora, sans-serif; font-size: 1.125rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; color: var(--phoenix-text); }
.convexdoc-prose h3 { font-size: 1rem; font-weight: 600; margin-top: 1rem; margin-bottom: 0.25rem; }
.convexdoc-prose p { margin-bottom: 0.75rem; color: var(--phoenix-text-muted); line-height: 1.6; }
.convexdoc-prose p:last-child { margin-bottom: 0; }
.convexdoc-prose ul, .convexdoc-prose ol { margin: 0.5rem 0 0.75rem 1.25rem; color: var(--phoenix-text-muted); }
.convexdoc-prose li { margin-bottom: 0.25rem; }
.convexdoc-prose a { color: var(--phoenix-red-zone); text-decoration: none; }
.convexdoc-prose a:hover { text-decoration: underline; }
.convexdoc-prose code { font-family: ui-monospace, monospace; font-size: 0.875em; padding: 0.15em 0.4em; border-radius: 0.25rem; background: var(--phoenix-app-surface); color: var(--phoenix-text); }
.convexdoc-prose pre { margin: 0.75rem 0; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; background: var(--phoenix-app-surface); border: 1px solid var(--phoenix-border); }
.convexdoc-prose pre code { padding: 0; background: none; }
`;
