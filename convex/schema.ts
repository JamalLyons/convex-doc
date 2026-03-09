import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Dummy schema for ConvexDoc testing.
 */
export default defineSchema({
  tasks: defineTable({
    title: v.optional(v.string()),
    done: v.boolean(),
  }).index("by_done", ["done"]),
});
