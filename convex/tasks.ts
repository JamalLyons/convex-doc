import { v } from "convex/values";
import {
	action,
	httpAction,
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET,OPTIONS,POST",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

const now = () => Date.now();

// Shared validators for return types (matches schema + system fields)
const taskDoc = v.object({
	_id: v.id("tasks"),
	_creationTime: v.number(),
	title: v.optional(v.string()),
	description: v.optional(v.string()),
	done: v.boolean(),
	status: v.union(
		v.literal("todo"),
		v.literal("in_progress"),
		v.literal("done"),
	),
	assigneeId: v.optional(v.string()),
	dueDate: v.optional(v.number()),
	priority: v.number(),
	listId: v.optional(v.id("lists")),
	createdAt: v.number(),
	updatedAt: v.number(),
});
const commentDoc = v.object({
	_id: v.id("comments"),
	_creationTime: v.number(),
	taskId: v.id("tasks"),
	authorId: v.string(),
	body: v.string(),
	createdAt: v.number(),
});

// ─── Queries (read data, cached, realtime) ──────────────────────────────────

export const getTask = query({
	args: { id: v.id("tasks") },
	returns: v.union(taskDoc, v.null()),
	handler: async (ctx, args) => ctx.db.get(args.id),
});

export const listTasks = query({
	args: {
		status: v.optional(
			v.union(v.literal("todo"), v.literal("in_progress"), v.literal("done")),
		),
		limit: v.optional(v.number()),
	},
	returns: v.array(taskDoc),
	handler: async (ctx, args) => {
		const limit = args.limit ?? 50;
		const status = args.status;
		if (status) {
			return ctx.db
				.query("tasks")
				.withIndex("by_status", (q) => q.eq("status", status))
				.order("desc")
				.take(limit);
		}
		return ctx.db.query("tasks").order("desc").take(limit);
	},
});

export const listTasksByStatus = query({
	args: {
		status: v.union(
			v.literal("todo"),
			v.literal("in_progress"),
			v.literal("done"),
		),
	},
	returns: v.array(taskDoc),
	handler: async (ctx, args) =>
		ctx.db
			.query("tasks")
			.withIndex("by_status", (q) => q.eq("status", args.status))
			.collect(),
});

export const listTasksByAssignee = query({
	args: { assigneeId: v.string() },
	returns: v.array(taskDoc),
	handler: async (ctx, args) =>
		ctx.db
			.query("tasks")
			.withIndex("by_assignee", (q) => q.eq("assigneeId", args.assigneeId))
			.collect(),
});

export const getTasksDueBefore = query({
	args: { dueBefore: v.number() },
	returns: v.array(taskDoc),
	handler: async (ctx, args) => {
		const all = await ctx.db.query("tasks").collect();
		return all.filter((t) => t.dueDate != null && t.dueDate < args.dueBefore);
	},
});

export const listDoneTasks = query({
	args: {},
	returns: v.array(taskDoc),
	handler: async (ctx) =>
		ctx.db
			.query("tasks")
			.withIndex("by_done", (q) => q.eq("done", true))
			.collect(),
});

export const searchTasks = query({
	args: { titleSubstring: v.string() },
	returns: v.array(taskDoc),
	handler: async (ctx, args) => {
		const all = await ctx.db.query("tasks").collect();
		const lower = args.titleSubstring.toLowerCase();
		return all.filter((t) => t.title?.toLowerCase().includes(lower));
	},
});

export const getTaskWithComments = query({
	args: { taskId: v.id("tasks") },
	returns: v.union(
		v.object({ task: taskDoc, comments: v.array(commentDoc) }),
		v.null(),
	),
	handler: async (ctx, args) => {
		const task = await ctx.db.get(args.taskId);
		if (!task) return null;
		const comments = await ctx.db
			.query("comments")
			.withIndex("by_task", (q) => q.eq("taskId", args.taskId))
			.collect();
		return { task, comments };
	},
});

export const getTasksInList = query({
	args: { listId: v.id("lists") },
	returns: v.array(taskDoc),
	handler: async (ctx, args) =>
		ctx.db
			.query("tasks")
			.withIndex("by_list", (q) => q.eq("listId", args.listId))
			.collect(),
});

// ─── Mutations (write data, transactional) ───────────────────────────────────

export const createTask = mutation({
	args: {
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		done: v.optional(v.boolean()),
		status: v.optional(
			v.union(v.literal("todo"), v.literal("in_progress"), v.literal("done")),
		),
		assigneeId: v.optional(v.string()),
		dueDate: v.optional(v.number()),
		priority: v.optional(v.number()),
		listId: v.optional(v.id("lists")),
	},
	returns: v.id("tasks"),
	handler: async (ctx, args) => {
		const ts = now();
		return ctx.db.insert("tasks", {
			title: args.title,
			description: args.description,
			done: args.done ?? false,
			status: args.status ?? "todo",
			assigneeId: args.assigneeId,
			dueDate: args.dueDate,
			priority: args.priority ?? 0,
			listId: args.listId,
			createdAt: ts,
			updatedAt: ts,
		});
	},
});

export const updateTask = mutation({
	args: {
		id: v.id("tasks"),
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		done: v.optional(v.boolean()),
		status: v.optional(
			v.union(v.literal("todo"), v.literal("in_progress"), v.literal("done")),
		),
		assigneeId: v.optional(v.string()),
		dueDate: v.optional(v.number()),
		priority: v.optional(v.number()),
	},
	returns: v.id("tasks"),
	handler: async (ctx, args) => {
		const { id, ...updates } = args;
		const task = await ctx.db.get(id);
		if (!task) throw new Error("Task not found");
		const patch: Record<string, unknown> = { updatedAt: now() };
		if (updates.title !== undefined) patch.title = updates.title;
		if (updates.description !== undefined)
			patch.description = updates.description;
		if (updates.done !== undefined) patch.done = updates.done;
		if (updates.status !== undefined) patch.status = updates.status;
		if (updates.assigneeId !== undefined) patch.assigneeId = updates.assigneeId;
		if (updates.dueDate !== undefined) patch.dueDate = updates.dueDate;
		if (updates.priority !== undefined) patch.priority = updates.priority;
		await ctx.db.patch(id, patch);
		return id;
	},
});

export const deleteTask = mutation({
	args: { id: v.id("tasks") },
	returns: v.id("tasks"),
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
		return args.id;
	},
});

export const toggleDone = mutation({
	args: { id: v.id("tasks") },
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const task = await ctx.db.get(args.id);
		if (!task) throw new Error("Task not found");
		await ctx.db.patch(args.id, { done: !task.done, updatedAt: now() });
		return !task.done;
	},
});

export const setStatus = mutation({
	args: {
		id: v.id("tasks"),
		status: v.union(
			v.literal("todo"),
			v.literal("in_progress"),
			v.literal("done"),
		),
	},
	returns: v.union(
		v.literal("todo"),
		v.literal("in_progress"),
		v.literal("done"),
	),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.id, { status: args.status, updatedAt: now() });
		return args.status;
	},
});

export const assignTask = mutation({
	args: { id: v.id("tasks"), assigneeId: v.string() },
	returns: v.string(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.id, {
			assigneeId: args.assigneeId,
			updatedAt: now(),
		});
		return args.assigneeId;
	},
});

export const setDueDate = mutation({
	args: { id: v.id("tasks"), dueDate: v.number() },
	returns: v.number(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.id, { dueDate: args.dueDate, updatedAt: now() });
		return args.dueDate;
	},
});

export const addComment = mutation({
	args: {
		taskId: v.id("tasks"),
		authorId: v.string(),
		body: v.string(),
	},
	returns: v.id("comments"),
	handler: async (ctx, args) => {
		return ctx.db.insert("comments", {
			taskId: args.taskId,
			authorId: args.authorId,
			body: args.body,
			createdAt: now(),
		});
	},
});

// ─── Actions (external APIs, no direct DB) ────────────────────────────────────

export const runTask = action({
	args: {
		taskId: v.string(),
		delayMs: v.optional(v.number()),
	},
	returns: v.object({ taskId: v.string(), ranAt: v.number() }),
	handler: async (_ctx, args) => {
		const delay = args.delayMs ?? 100;
		await new Promise((resolve) => setTimeout(resolve, delay));
		return { taskId: args.taskId, ranAt: Date.now() };
	},
});

export const notifyTaskAssigned = action({
	args: { taskId: v.string(), assigneeId: v.string() },
	returns: v.object({
		sent: v.boolean(),
		taskId: v.string(),
		assigneeId: v.string(),
	}),
	handler: async (_ctx, args) => {
		// Simulate sending a notification (e.g. email/push).
		return { sent: true, taskId: args.taskId, assigneeId: args.assigneeId };
	},
});

export const syncTasksFromExternal = action({
	args: { sourceUrl: v.string() },
	returns: v.object({ synced: v.number(), source: v.string() }),
	handler: async (_ctx, args) => {
		// Simulate fetching from an external API.
		const res = await fetch(args.sourceUrl, { method: "GET" }).catch(
			() => null,
		);
		const count = res?.ok ? 1 : 0;
		return { synced: count, source: args.sourceUrl };
	},
});

export const processTaskBatch = action({
	args: { taskIds: v.array(v.id("tasks")) },
	returns: v.object({ processed: v.number() }),
	handler: async (_ctx, args) => {
		await new Promise((r) => setTimeout(r, 50));
		return { processed: args.taskIds.length };
	},
});

// ─── HTTP actions ───────────────────────────────────────────────────────────

export const handleTaskRequest = httpAction(async (_ctx, request) => {
	const url = new URL(request.url);
	const name = url.searchParams.get("name") ?? "world";
	return new Response(JSON.stringify({ message: `Hello, ${name}` }), {
		status: 200,
		headers: { "Content-Type": "application/json", ...CORS_HEADERS },
	});
});

export const handleTaskOptions = httpAction(async (_ctx, _request) => {
	return new Response(null, { status: 204, headers: { ...CORS_HEADERS } });
});

// ─── Internal (for testing excludeFunctionTypes) ──────────────────────────────

export const helperInternalQuery = internalQuery({
	args: { info: v.string() },
	returns: v.string(),
	handler: async (_ctx, args) => `Internal info for ${args.info}`,
});

export const helperInternalMutation = internalMutation({
	args: { count: v.number() },
	returns: v.number(),
	handler: async (_ctx, args) => args.count + 1,
});

export const helperInternalAction = internalAction({
	args: { command: v.string() },
	returns: v.string(),
	handler: async (_ctx, args) => `Executed internal action: ${args.command}`,
});
