declare module "jsx-async-runtime" {
	/**
	 * Render a JSX tree to a string.
	 *
	 * The real implementation is expected to live at runtime; this is a typing shim
	 * so TypeScript can typecheck with `jsxImportSource: "jsx-async-runtime"`.
	 */
	export function jsxToString(this: unknown, node: JSX.Element): Promise<string>;
}

declare module "jsx-async-runtime/jsx-runtime" {
	// Minimal JSX runtime surface for TypeScript's `react-jsx` transform.
	export const Fragment: any;
	export function jsx(type: any, props: any, key?: any): JSX.Element;
	export function jsxs(type: any, props: any, key?: any): JSX.Element;
}

