![Convex logo](https://static.convex.dev/logo/convex-logo-light.svg)

## ConvexDoc

**ConvexDoc** is a documentation generator and interactive tester for your [Convex](https://convex.dev) deployments.

It connects to a Convex project, fetches the function spec, and produces a polished docs site with:

- **Static HTML pages** for each module and function
- A **searchable overview** of your API surface
- An **interactive function runner** when served locally

---

### Installation

Install ConvexDoc as a dev dependency in your Convex project:

```bash
pnpm add -D convexdoc
```

You can also use other package managers if you prefer:

```bash
npm install --save-dev convexdoc
yarn add --dev convexdoc
```

Requires **Node.js 18+**.

---

### Quick start

From your Convex project root:

```bash
# 1) Generate docs into ./docs
pnpm convexdoc generate

# 2) Serve the docs locally at http://localhost:3000
pnpm convexdoc serve

# Or do both in one command:
pnpm convexdoc start
```

By default, ConvexDoc:

- Connects to your **dev** deployment
- Writes the static docs site to `./docs`
- Serves it on `http://localhost:3000` when using `serve`/`start`

---

### CLI overview

After installing, the `convexdoc` CLI is available (via `npx`, `pnpm convexdoc`, etc.).

- **`convexdoc spec`** – Fetch and print the function spec
- **`convexdoc generate`** – Generate a static docs site
- **`convexdoc serve`** – Serve an existing docs site locally
- **`convexdoc start`** – Generate docs and then serve them

#### `convexdoc spec`

```bash
pnpm convexdoc spec [options]
```

**Options:**

- `-p, --project-dir <path>` – Path to your Convex project root
- `-o, --output <file>` – Write the raw spec JSON to a file
- `--json` – Print the raw JSON spec instead of a formatted summary

Use this to quickly inspect which functions ConvexDoc sees on your deployment.

#### `convexdoc generate`

```bash
pnpm convexdoc generate [options]
```

**Options:**

- `-p, --project-dir <path>` – Path to your Convex project root

This:

- Fetches the Convex function spec
- Enriches it with JSDoc and HTTP route information where available
- Writes a static docs site to your configured `docsDir` (default: `docs/`)

The output folder includes:

- `index.html` – API overview page
- `<module>.html` – One page per module
- `app.js` – Bundled client runtime
- `styles.css` – Generated Tailwind-based theme
- `convexdoc.manifest.json` – Machine-readable metadata for the docs

#### `convexdoc serve`

```bash
pnpm convexdoc serve [options]
```

**Options:**

- `-p, --project-dir <path>` – Path to your Convex project root
- `-P, --port <number>` – Port to listen on (default: `3000`)
- `--verbose-logs` – Enable detailed request logs

Serves the previously generated docs folder. Requires that:

- Your `docs` directory (or `docsDir` from config) exists
- `index.html` is present inside that directory

#### `convexdoc start`

```bash
pnpm convexdoc start [options]
```

**Options:**

- `-p, --project-dir <path>` – Path to your Convex project root
- `-P, --port <number>` – Port to listen on (default: `3000`)
- `--verbose-logs` – Enable detailed request logs

This is a convenience command that:

1. Fetches the function spec
2. Generates the docs to `docsDir`
3. Starts the local docs server

---

### Configuration

ConvexDoc reads configuration from:

- `convexdoc.config.json` in your project root, and/or
- Environment variables, and/or
- CLI flags (e.g. `--project-dir`, `--port`)

#### `convexdoc.config.json`

Place a `convexdoc.config.json` file in the directory where you run `convexdoc`:

```jsonc
{
  // Where your Convex project lives (relative or absolute)
  "projectDir": ".",

  // Where to write the generated docs
  "docsDir": "docs",

  // Base URL for Convex HTTP actions when running locally
  "httpActionDeployUrl": "http://localhost:3218",

  // Optional: override deployment URL when fetching the function spec
  "deploymentUrl": "https://your-deployment.convex.cloud",

  // Optional: Convex admin key if required by your deployment
  "adminKey": "your-admin-key",

  // Optional: port for `convexdoc serve` / `convexdoc start`
  "serverPort": 3000,

  // When true, disable the function runner (for public deployments)
  "disableFunctionRunner": false,

  // Target environment for fetching the function spec ("dev" or "prod")
  "deploymentEnv": "dev",

  // UI customization and per-module docs
  "customization": {
    "theme": {
      // Accent color for the UI (hex string)
      "accent": "#ef4444"
    },
    "modules": {
      // Keyed by module name
      "tasks": {
        "description": "Core task CRUD operations.",
        "functions": {
          "getTask": {
            "description": "Fetch a single task by ID."
          },
          "createTask": {
            "description": "Create a new task."
          }
        }
      }
    },

    // When true (default), hide "Learn more about Convex..." links
    "hideConvexDocsLinks": true,

    // Optional path to a markdown or text file for the landing page
    // e.g. "./landing.md" or "./README.md"
    "landingPage": "./landing.md",

    // Optional list of Convex function types to exclude from docs
    // e.g. ["internalQuery", "internalMutation", "internalAction"] to show a public API only
    "excludeFunctionTypes": ["internalQuery", "internalMutation", "internalAction"]
  }
}
```

Only the fields you need are required; everything else falls back to sensible defaults.

#### Environment variables

The following environment variables can override or supplement config:

- `CONVEXDOC_PROJECT_DIR` – Default project directory
- `CONVEXDOC_SERVER_PORT` – Default port for `serve` / `start`
- `CONVEXDOC_HTTP_ACTION_DEPLOY_URL` – Base URL for HTTP actions
- `CONVEXDOC_VERBOSE_LOGS` – `"true"` / `"false"` style toggle for verbose logs
- `CONVEXDOC_DISABLE_FUNCTION_RUNNER` – `"true"` to disable the function runner
- `CONVEXDOC_ENV` – `"dev"` or `"prod"` deployment environment
- `CONVEX_URL` – Deployment URL (used when `deploymentUrl` is not provided)
- `CONVEX_ADMIN_KEY` – Admin key for your Convex deployment

Boolean strings like `"true"`, `"1"`, `"yes"` are treated as `true`, and
`"false"`, `"0"`, `"no"` as `false`.

---

### Using ConvexDoc safely in public deployments

By default, the **function runner is enabled**, which allows you to invoke Convex
functions interactively from the docs UI. For a **publicly hosted** docs site,
you should usually disable this:

- Set `"disableFunctionRunner": true` in `convexdoc.config.json`, or
- Set `CONVEXDOC_DISABLE_FUNCTION_RUNNER=true` in the environment when generating/serving

When disabled:

- The `/__convexdoc/run` route rejects requests
- The manifest marks `functionRunnerDisabled: true`

This keeps your public docs safe while still allowing rich API exploration locally.

---

### Project scripts (optional)

You can add convenience scripts to your Convex project’s `package.json`:

```jsonc
{
  "scripts": {
    "convexdoc:spec": "convexdoc spec",
    "convexdoc:generate": "convexdoc generate",
    "convexdoc:serve": "convexdoc serve",
    "convexdoc:start": "convexdoc start"
  }
}
```

Then run:

```bash
pnpm convexdoc:start
```

