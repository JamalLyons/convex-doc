# Task Manager API

Demo Convex backend for a task manager: **tasks** (with status, assignee, due dates, comments), **lists** (task lists), and **http** routes. Built to exercise [Convex functions](https://docs.convex.dev/functions)—queries, mutations, actions, and HTTP actions. Use `convexdoc serve` to try the interactive runner.

## Data model

- **tasks** — Title, description, status (`todo` / `in_progress` / `done`), assignee, due date, priority, optional list. Indexed by status, assignee, due date, and list.
- **lists** — Named task lists.
- **comments** — Comments on tasks (task, author, body).

## API overview

- **Tasks** — 9 queries, 8 mutations, 4 actions, 2 HTTP handlers, plus 3 internal helpers (for testing doc exclusion).
- **Lists** — 3 queries, 3 mutations.
- **HTTP** — `GET /task` and OPTIONS (CORS).

## Quick start

1. `convexdoc generate` — build the docs from your Convex function spec.
2. `convexdoc serve` — open the site locally with the function runner.
3. Use the **Modules** section below to open a module and run functions.
