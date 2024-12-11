/** @format */

const express = require("express");
const http = require("http");
const app = express();
const PORT = 9000;

require("dotenv").config();
console.log(require("fs").readdirSync("./"));
console.log("REDIS_HOST:", process.env.REDIS_HOST);

const {
	AWS_ACCESS_KEY_ID,
	AWS_SECRET_ACCESS_KEY,
	AWS_CLUSTER,
	AWS_TASK_DEFINITION,
	AWS_SUBNET1,
	AWS_SUBNET2,
	AWS_SUBNET3,
	AWS_SECURITY_GROUP,
} = process.env;

console.log(
	"all envs",
	AWS_ACCESS_KEY_ID,
	AWS_SECRET_ACCESS_KEY,
	AWS_CLUSTER,
	AWS_TASK_DEFINITION,
	AWS_SUBNET1,
	AWS_SUBNET2,
	AWS_SUBNET3,
	AWS_SECURITY_GROUP
);

const Redis = require("ioredis");
const { Server } = require("socket.io");

const REDISHOST = "";
const subscriber = new Redis(REDISHOST);

subscriber.on("connect", () => console.log("Connected to Redis"));
subscriber.on("error", (err) => console.error("Redis error:", err));

const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: "*",
	},
});

io.on("connection", (socket) => {
	console.log("Client connected running socket.io");

	socket.on("subscribe", (channel) => {
		socket.join(channel);
		socket.emit("message", `joined to ${channel}`);
	});
});

const { generateSlug } = require("random-word-slugs");
const { ECSClient, RunTaskCommand } = require("@aws-sdk/client-ecs");

const ecsClient = new ECSClient({
	region: "ap-south-1",
	credentials: {
		accessKeyId: AWS_ACCESS_KEY_ID,
		secretAccessKey: AWS_SECRET_ACCESS_KEY,
	},
});

const config = {
	CLUSTER: AWS_CLUSTER,
	TASK: AWS_TASK_DEFINITION,
};

app.use(express.json());

app.post("/project", async (req, res) => {
	const { gitUrl } = req.body;
	const project = generateSlug(2);

	const command = new RunTaskCommand({
		cluster: config.CLUSTER,
		taskDefinition: config.TASK,
		count: 1,
		launchType: "FARGATE",
		networkConfiguration: {
			awsvpcConfiguration: {
				subnets: [AWS_SUBNET1, AWS_SUBNET2, AWS_SUBNET3],
				securityGroups: [AWS_SECURITY_GROUP],
				assignPublicIp: "ENABLED",
			},
		},
		overrides: {
			containerOverrides: [
				{
					name: "builder-image",
					environment: [
						{
							name: "GIT_REPOSITORY__URL",
							value: gitUrl,
						},
						{
							name: "PROJECT_ID",
							value: project,
						},
					],
				},
			],
		},
	});

	await ecsClient.send(command);
	res.json({
		status: "success",
		data: {
			project,
			gitUrl,
			url: `http://${project}.localhost:8000/`,
		},
	});
});

async function initRedisSubscriber() {
	console.log("Subscribing to logs:*");
	subscriber.psubscribe("logs:*");
	subscriber.on("pmessage", (pattern, channel, message) => {
		io.to(channel).emit("message", message);
	});
}

async function _initRedisSubscriber() {
	console.log("subscribing to logs:*");
	subscriber.psubscribe("logs:*");
	subscriber.on("message", (channel, message) => {
		// const [, project] = channel.split(":");
		// io.to(project).emit("message", message);
		// jo bhi message aya use hi emit kr dena hai

		io.to(channel).emit("message", message);
	});
}

server.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
	initRedisSubscriber();
});
