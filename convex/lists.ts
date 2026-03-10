import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const now = () => Date.now();

// Shared validator for list document return type
const listDoc = v.object({
	_id: v.id("lists"),
	_creationTime: v.number(),
	name: v.string(),
	createdAt: v.number(),
});

// ─── Queries ─────────────────────────────────────────────────────────────────

export const listLists = query({
	args: {},
	returns: v.array(listDoc),
	handler: async (ctx) =>
		ctx.db
			.query("lists")
			.withIndex("by_created", (q) => q)
			.order("desc")
			.collect(),
});

export const getList = query({
	args: { id: v.id("lists") },
	returns: v.union(listDoc, v.null()),
	handler: async (ctx, args) => ctx.db.get(args.id),
});

export const getListByName = query({
	args: { name: v.string() },
	returns: v.union(listDoc, v.null()),
	handler: async (ctx, args) => {
		const all = await ctx.db.query("lists").collect();
		return all.find((l) => l.name === args.name) ?? null;
	},
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const createList = mutation({
	args: { name: v.string() },
	returns: v.id("lists"),
	handler: async (ctx, args) =>
		ctx.db.insert("lists", { name: args.name, createdAt: now() }),
});

export const renameList = mutation({
	args: { id: v.id("lists"), name: v.string() },
	returns: v.id("lists"),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.id, { name: args.name });
		return args.id;
	},
});

export const deleteList = mutation({
	args: { id: v.id("lists") },
	returns: v.id("lists"),
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
		return args.id;
	},
});

export const throwError = mutation({
	args: {},
	returns: v.any(),
	handler: async () => {
		throw new Error("This is a test error");
	},
});
