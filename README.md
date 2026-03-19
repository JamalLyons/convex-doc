# ConvexDoc

**ConvexDoc** is a documentation generator and interactive tester for your [Convex](https://convex.dev) deployments.

It connects to a [Convex](https://www.convex.dev/) project, fetches the function spec, and produces a polished docs site with:

- **Static HTML pages** for each module and function
- A **searchable overview** of your API surface
- An **interactive function runner** when served locally

---

## Installation

Install ConvexDoc as a dev dependency in your Convex project:

```bash
pnpm add -D convexdoc
```

You can also use other package managers if you prefer:

```bash
npm install --save-dev convexdoc
yarn add --dev convexdoc
```

Requires **Node.js 20+**.

---

## Quick start

From your Convex project root:

```bash
#1) Inizualize the project
pnpm convexdoc init

#2 Generate your documentation & start the local html server
pnpm convexdoc start
```

By default, ConvexDoc:

- Connects to your **dev** deployment
- Writes the static docs site to `./docs`
- Serves it on `http://localhost:3000` when using the`serve`/`start command`

---

## CLI overview

After installing, the `convexdoc` CLI is available (via `npx`, `pnpm convexdoc`, etc.).

Run the help command to learn about command options.

```bash
pnpm convexdoc help [cmd]
```

---

## Configuration

ConvexDoc reads configuration from:

- `convexdoc.config.json` in your project root, and/or
- Environment variables, and/or
- CLI flags (e.g. `--project-dir`, `--port`)

### `convexdoc.config.json`

Place a `convexdoc.config.json` file in the directory where you run `convexdoc`:

```jsonc
{
  // Where your Convex project lives (relative or absolute)
  "projectDir": ".",

  // Where to write the generated docs
  "docsDir": "docs",

  // Base URL for Convex HTTP actions when running locally,
  // required if using HTTP actions in your Convex functions.
  // By default convexdoc will read from our env.local file generated from convex.
  // if you place a value here, it will override the env file data.
  "httpActionDeployUrl": "https://<your-deployment>.convex.site",

  // By default convexdoc will read from our env.local file generated from convex.
  // if you place a value here, it will override the env file data.
  "deploymentUrl": "https://<your-deployment>.convex.cloud",

  // Optional: Convex auth token (e.g. a JWT) if required by your deployment.
  // This will be sent as `Authorization: Bearer <authToken>` when running functions.
  "authToken": "your-auth-token",

  // Optional: port for `convexdoc serve`
  "serverPort": 3000,

  // Optional: when true, enable verbose logging in the server and
  // show full error messages (including stack traces) in the Function
  // Runner UI. When false (default), the UI shows a compact error
  // summary plus Request ID.
  "verboseLogs": false,

  // When true, disable the function runner UI
  "disableFunctionRunner": false,

  // Target environment for fetching the function spec ("dev" or "prod").
  // The default environemnt is dev.
  "deploymentEnv": "dev",

  // UI customization
  "customization": {
    "theme": {
      // Accent color for the UI (hex string)
      "accent": "#ef4444"
    },

    // Optional path to a directory of markdown files
    // e.g. "./content"
    "contentPath": "./content",

    // When true (default), hide "Learn more about Convex..." links
    "hideConvexDocsLinks": true,

    // Optional list of Convex function types to exclude from docs
    // e.g. ["internalQuery", "internalMutation", "internalAction"] to show a public API only
    "excludeFunctionTypes": ["internalQuery", "internalMutation", "internalAction"]
  }
}
```

Only the fields you need are required; everything else falls back to sensible defaults.

### File-based markdown customization

When `customization.contentPath` is set, ConvexDoc will load markdown files from that
folder and render them into the generated HTML:

- `index.md` -> rendered on `index.html` (landing page)
- `<moduleName>.md` -> rendered on `<module>.html` before the function list

Module names include nested Convex namespaces, so nested modules map naturally:

- module `movies` -> `content/movies.md`
- module `ratings/by_movie` -> `content/ratings/by_movie.md`

Example layout:

```text
content/
  index.md
  movies.md
  ratings/
    by_movie.md
    by_user.md
```

Missing or unreadable markdown files do not fail generation; ConvexDoc logs a warning
and continues using the default page content.

### Environment variables

The following environment variables can override or supplement config:

- `CONVEXDOC_PROJECT_DIR` – Default project directory
- `CONVEXDOC_SERVER_PORT` – Default port for `serve` / `start`
- `CONVEXDOC_HTTP_ACTION_DEPLOY_URL` – Base URL for HTTP actions
- `CONVEXDOC_VERBOSE_LOGS` – `"true"` / `"false"` style toggle for verbose logs and verbose error details in the UI
- `CONVEXDOC_DISABLE_FUNCTION_RUNNER` – `"true"` to disable the function runner
- `CONVEXDOC_ENV` – `"dev"` or `"prod"` deployment environment
- `CONVEX_URL` – Deployment URL (used when `deploymentUrl` is not provided).
- `CONVEX_DEPLOYMENT` – Convex deployment identifier (e.g. `dev:my-deployment`); used by the Convex CLI itself when ConvexDoc fetches the function spec.
- `CONVEX_SITE_URL` – Site URL (used as the default `httpActionDeployUrl` when not set in config).
- `CONVEXDOC_AUTH_TOKEN` – Default auth token used by ConvexDoc when running functions (sent as a Bearer token).

Boolean strings like `"true"`, `"1"`, `"yes"` are treated as `true`, and
`"false"`, `"0"`, `"no"` as `false`.

---

## Using ConvexDoc safely in public deployments

By default, the **function runner is enabled**, which allows you to invoke Convex
functions interactively from the docs UI. For a **publicly hosted** docs site,
you should usually disable this:

- Set `"disableFunctionRunner": true` in `convexdoc.config.json`, or
- Set `CONVEXDOC_DISABLE_FUNCTION_RUNNER=true` in the environment when generating/serving

When disabled:

- The `/__convexdoc/run` route rejects requests
- The manifest marks `functionRunnerDisabled: true`

