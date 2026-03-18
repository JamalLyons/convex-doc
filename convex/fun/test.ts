import { v } from "convex/values";
import { query } from "../_generated/server";

export const funTest = query({
	args: {},
	returns: v.null(),
	handler: async () => console.log("test"),
});
