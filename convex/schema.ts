import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Task manager demo schema for ConvexDoc testing.
 * See https://docs.convex.dev/functions
 */
export default defineSchema({
	tasks: defineTable({
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
	})
		.index("by_done", ["done"])
		.index("by_status", ["status"])
		.index("by_assignee", ["assigneeId"])
		.index("by_due_date", ["dueDate"])
		.index("by_list", ["listId"]),

	lists: defineTable({
		name: v.string(),
		createdAt: v.number(),
	}).index("by_created", ["createdAt"]),

	comments: defineTable({
		taskId: v.id("tasks"),
		authorId: v.string(),
		body: v.string(),
		createdAt: v.number(),
	}).index("by_task", ["taskId"]),
});
