import { v } from "convex/values";
import { query } from "../../_generated/server";

export const funNestedTest = query({
	args: {},
	returns: v.null(),
	handler: async () => console.log("nested test"),
});
