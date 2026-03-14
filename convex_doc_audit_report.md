# ConvexDoc Codebase Review & Audit Report

## 1. Code Quality & Architecture

**Current State:**
The architecture demonstrates a very clean separation of concerns. The codebase is broken down into intuitive boundaries:

- **[parser.ts](file:///Users/jamallyons/Developer/GitHub/convex-doc/lib/parser.ts)**: Handles the messy business of normalizing different versions of `function-spec` output.
- `**cmd/`**: CLI abstractions and actual command logic ([spec](file:///Users/jamallyons/Developer/GitHub/convex-doc/lib/cli.ts#58-111), [generate](file:///Users/jamallyons/Developer/GitHub/convex-doc/lib/cli.ts#112-175)).
- `**client/**`: React components ([markdown.tsx](file:///Users/jamallyons/Developer/GitHub/convex-doc/lib/client/markdown.tsx)), CSS ([css.ts](file:///Users/jamallyons/Developer/GitHub/convex-doc/lib/client/css.ts)), and client-side interactivity ([client-app.tsx](file:///Users/jamallyons/Developer/GitHub/convex-doc/lib/client/client-app.tsx)).
- **[server.ts](file:///Users/jamallyons/Developer/GitHub/convex-doc/lib/server.ts)**: The local proxy server.

The TypeScript usage is generally strong, utilizing strict types mirroring the Convex validation schema. There are very few instances of `any`. Error handling when shelling out to `execa` is mostly robust, providing user-friendly instructions when the command fails.

**Recommendations:**

- **Type Assertions in Parser:** Operations in [parser.ts](file:///Users/jamallyons/Developer/GitHub/convex-doc/lib/parser.ts) rely on `Record<string, unknown>` casts followed by manual property access. While safe given the dynamic nature of JSON, wrapping the incoming JSON through Zod (or a similar runtime validator) would dramatically improve the type safety and resilience against unexpected Convex CLI changes.
- **Tailwind Execution:** In [generate.tsx](file:///Users/jamallyons/Developer/GitHub/convex-doc/lib/cmd/generate.tsx), Tailwind is executed by resolving `tailwindcss/lib/cli.js` directly. This is slightly fragile and could break across major Tailwind updates. A more robust approach might be to invoke `npx tailwindcss` directly via `execa`.

## 3. Static Site Generator

**Current State:**
The project uses `renderToStaticMarkup` from `react-dom/server` alongside bundled Tailwind CSS and an `esbuild`-bundled client application (`app.js`). This is a true, lightweight SSG without the bloat of Next.js or Vite.

**Current Problems & Gaps:**

- **Asset portability:** The site attempts to be portable, but absolute/relative pathing might break if hosted on a subpath (e.g., GitHub Pages `user.github.io/repo/docs`).
- **Missing Watch Mode:** Running `convexdoc start` does a one-time build and serves it. If developers are writing new functions, they must restart the command.

**Recommendations:**

- Implement a **Watch Mode** (`convexdoc dev`). This would use `chokidar` to watch the user's `convex/` directory, automatically re-running `function-spec` and regenerating the site when a [.ts](file:///Users/jamallyons/Developer/GitHub/convex-doc/lib/cli.ts) file changes.

## 4. The Function Runner

**Current State:**
The function runner intelligently proxies requests through the local express-like Node server ([server.ts](file:///Users/jamallyons/Developer/GitHub/convex-doc/lib/server.ts)) to avoid CORS issues and inject Auth tokens. `httpAction` routes are handled smartly using direct `fetch()` calls. 

**Current Problems & Gaps:**

- **Lack of Client-Side Input Validation:** The runner allows users to paste raw JSON into the text area. It parses the JSON and blindly sends it to Convex. If the arguments are malformed (e.g., passing a string instead of a number), Convex rejects it, but ConvexDoc could provide a much better UX.
- **Admin Keys in UI:** The Auth token is stored in `localStorage`. While standard, storing sensitive tokens in a clear format might lead to accidental exposure when screen sharing.

**Recommendations:**

- Implement basic pre-flight validation against the schema parsed into the `manifest`. If a parameter expects a number, alert the user *before* making the network request.
- Mask the `Auth Token` input field (type="password") or provide an eye-icon toggle to hide it by default.

## 5. Validator Rendering

**Current State:**
The recursive [ValidatorDisplay](file:///Users/jamallyons/Developer/GitHub/convex-doc/lib/client/markdown.tsx#326-352) handles complex, nested types excellently. Collapsing logic at depth >= 3 sets a great precedent for readability.

**Current Problems & Gaps:**

- No current visual distinction between `null` and `optional: true` fields formatting beyond a `?`.

**Recommendations:**

- The current implementation is actually extremely solid. The only improvement would be adding JSDoc description tooltips directly next to the fields if that data can be extracted.

## 6. Gap Analysis — Missing Features

Beyond the above, here is what separates ConvexDoc from a "production-quality" or Enterprise tool:

1. **JSDoc Extraction (Critical):** Complex APIs require prose. Currently, descriptions have to be manually entered into [convexdoc.config.json](file:///Users/jamallyons/Developer/GitHub/convex-doc/convexdoc.config.json). ConvexDoc should parse the TypeScript source files (using the TS compiler API) to extract JSDoc comments preceding exported queries/mutations and auto-enrich the spec with descriptions.
2. **Export Formats:** The standard for API documentation is OpenAPI. ConvexDoc should add a `convexdoc export --format openapi` command that translates the parsed spec into an `openapi.json` file. This allows users to import their Convex API into Postman, Swagger, or Retool.
3. **Convex Components:** Convex's new Component system allows packaging functions. `function-spec` output includes component boundaries, but ConvexDoc currently flattens or ignores this hierarchy. Support for Components will be required soon.
4. **Integration Testing:** The `test/` folder contains decent unit tests for the parser and config. However, an E2E test leveraging Playwright to generate a site and click through the Function Runner UI is necessary for an OSS tool handling DOM interactions.

## 7. Documentation

**Current State:**
The README is clear, concise, and explains the CLI effectively.

**Current Problems & Gaps:**

- Visuals are missing. 
- No `CONTRIBUTING.md`.
- No GitHub Actions for CI.

**Recommendations:**

- Add a prominent GIF or screenshot of the generated UI to the top of the README. People judge developer tools with their eyes first.
- Add a `CONTRIBUTING.md` describing how to run the `test` suite and explaining the `parser` architecture.
- Implement a `.github/workflows/ci.yml` file to enforce `pnpm lint` and `pnpm test` on PRs.

---

## Top 10 High-Impact Improvements

*Ordered by Effort-to-Value Ratio:*

1. **Add Visuals to README:** (Low effort / High value) — Add screenshots or a loop GIF of the runner. Drives initial adoption.
2. **Add `convexdoc init` Command:** (Low effort / High value) — Scaffolds [convexdoc.config.json](file:///Users/jamallyons/Developer/GitHub/convex-doc/convexdoc.config.json) with commented defaults.
3. **Mask the Auth Token Input:** (Low effort / Medium value) — Change input type to password in the React UI to prevent screen-share leakage.
4. **Implement GitHub Actions CI:** (Low effort / Medium value) — Setup automated linting and tests to safeguard open-source contributions.
5. **Add `CONTRIBUTING.md`:** (Low effort / Medium value) — Lower the barrier for community PRs.
6. **Add Watch Mode (`convexdoc dev`):** (Medium effort / High value) — Watch `convex/` with `chokidar`, rerun generation on change. Massively improves the developer experience.
7. **Auto-Extract JSDoc Comments:** (High effort / High value) — Use the TS Compiler API to read source files and extract docstrings, injecting them into the manifest. Completely eliminates the need for manual config descriptions.
8. **Support OpenAPI Export:** (Medium effort / Medium value) — Translate the [ParsedFunctionSpec](file:///Users/jamallyons/Developer/GitHub/convex-doc/lib/parser.ts#9-29) to OpenAPI v3 JSON.
9. **Client-Side Input Validation:** (Medium effort / Medium value) — Validate JSON inputs in the browser before firing requests.
10. **E2E Testing with Playwright:** (High effort / Medium value) — Ensure the static React app builds and functions correctly in Headless Chrome.

