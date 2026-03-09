import { httpRouter } from "convex/server";
import { handleTaskRequest } from "./tasks";

const http = httpRouter();

http.route({
	path: "/task",
	method: "GET",
	handler: handleTaskRequest,
});

export default http;
