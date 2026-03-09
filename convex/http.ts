import { httpRouter } from "convex/server";
import { handleTaskOptions, handleTaskRequest } from "./tasks";

const http = httpRouter();

http.route({
	path: "/task",
	method: "GET",
	handler: handleTaskRequest,
});

http.route({
	path: "/task",
	method: "OPTIONS",
	handler: handleTaskOptions,
});

export default http;
