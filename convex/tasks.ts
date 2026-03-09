import { v } from "convex/values";
import { action, httpAction, mutation, query } from "./_generated/server";

export const getTask = query({
	args: {
		id: v.id("tasks"),
	},
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});

export const createTask = mutation({
	args: {
		title: v.optional(v.string()),
		done: v.boolean(),
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("tasks", {
			title: args.title,
			done: args.done,
		});
	},
});

export const runTask = action({
	args: {
		taskId: v.string(),
		delayMs: v.optional(v.number()),
	},
	handler: async (_ctx, args) => {
		const delay = args.delayMs ?? 100;
		await new Promise((resolve) => setTimeout(resolve, delay));
		return { taskId: args.taskId, ranAt: Date.now() };
	},
});

export const handleTaskRequest = httpAction(async (_ctx, request) => {
	const url = new URL(request.url);
	const name = url.searchParams.get("name") ?? "world";
	return new Response(JSON.stringify({ message: `Hello, ${name}` }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
});
