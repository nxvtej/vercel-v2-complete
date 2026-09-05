const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { generateSlug } = require("random-word-slugs");
const { Server } = require("socket.io");
const { runBuild } = require("./build");

require("dotenv").config();

const PORT = process.env.PORT || 8080;
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, "..", "outputs");
const WORK_DIR = process.env.WORK_DIR || path.join(__dirname, "..", ".builds");
const PUBLIC_URL = process.env.PUBLIC_URL || "";

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(WORK_DIR, { recursive: true });

/** @type {Map<string, { logs: string[], status: string, gitUrl: string, url: string }>} */
const deployments = new Map();
let buildInProgress = false;
const buildQueue = [];

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

function sanitizeSlug(name) {
	if (!name) return generateSlug(2);
	return name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "") || generateSlug(2);
}

function siteUrl(req, projectId) {
	const base = PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
	return `${base}/sites/${projectId}/`;
}

function appendLog(projectId, line) {
	const entry = deployments.get(projectId);
	if (!entry) return;
	entry.logs.push(line);
	io.to(`logs:${projectId}`).emit("log", line);
}

function processQueue() {
	if (buildInProgress || buildQueue.length === 0) return;

	const job = buildQueue.shift();
	buildInProgress = true;
	const { projectId, gitUrl, req } = job;

	const entry = deployments.get(projectId);
	entry.status = "building";

	runBuild({
		projectId,
		gitUrl,
		workDir: WORK_DIR,
		outputDir: OUTPUT_DIR,
		onLog: (line) => appendLog(projectId, line),
	})
		.then(() => {
			entry.status = "success";
			entry.url = siteUrl(req, projectId);
			io.to(`logs:${projectId}`).emit("deploy:complete", {
				projectId,
				url: entry.url,
				status: "success",
			});
		})
		.catch((err) => {
			appendLog(projectId, `Error: ${err.message}`);
			entry.status = "failed";
			io.to(`logs:${projectId}`).emit("deploy:complete", {
				projectId,
				status: "failed",
				error: err.message,
			});
		})
		.finally(() => {
			buildInProgress = false;
			processQueue();
		});
}

app.use(express.json());

app.post("/api/project", (req, res) => {
	const { gitUrl, name } = req.body;

	if (!gitUrl || typeof gitUrl !== "string") {
		return res.status(400).json({ error: "gitUrl is required" });
	}

	const projectId = sanitizeSlug(name);
	if (deployments.has(projectId) && deployments.get(projectId).status === "building") {
		return res.status(409).json({ error: "A build for this name is already in progress" });
	}

	const url = siteUrl(req, projectId);
	deployments.set(projectId, {
		logs: [],
		status: "queued",
		gitUrl,
		url,
	});

	buildQueue.push({ projectId, gitUrl, req });
	processQueue();

	res.json({
		status: "success",
		data: { project: projectId, gitUrl, url },
	});
});

app.get("/api/project/:id", (req, res) => {
	const entry = deployments.get(req.params.id);
	if (!entry) {
		return res.status(404).json({ error: "Project not found" });
	}
	res.json({
		project: req.params.id,
		status: entry.status,
		url: entry.url,
		gitUrl: entry.gitUrl,
		logs: entry.logs,
	});
});

app.use("/sites/:projectId", (req, res, next) => {
	const projectDir = path.join(OUTPUT_DIR, req.params.projectId);
	if (!fs.existsSync(projectDir)) {
		return res.status(404).send("Site not found. Build may still be running.");
	}

	const requestPath = req.url === "/" || req.url === "" ? "/index.html" : req.url;
	let filePath = path.join(projectDir, requestPath);

	if (!filePath.startsWith(projectDir)) {
		return res.status(403).send("Forbidden");
	}

	if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
		filePath = path.join(projectDir, "index.html");
	}

	if (!fs.existsSync(filePath)) {
		return res.status(404).send("File not found");
	}

	// Vite/Next builds often use root-absolute asset paths (/assets/...).
	// Rewrite so they resolve under /sites/:projectId/
	if (filePath.endsWith(".html")) {
		const prefix = `/sites/${req.params.projectId}`;
		let html = fs.readFileSync(filePath, "utf8");
		html = html.replace(
			/((?:src|href)=["'])\/(assets\/|_next\/)/g,
			`$1${prefix}/$2`
		);
		return res.type("html").send(html);
	}

	return res.sendFile(filePath);
});

const frontendDist = path.join(__dirname, "public");
if (fs.existsSync(frontendDist)) {
	app.use(express.static(frontendDist));
	app.get("*", (req, res) => {
		if (req.path.startsWith("/api") || req.path.startsWith("/sites")) {
			return res.status(404).json({ error: "Not found" });
		}
		res.sendFile(path.join(frontendDist, "index.html"));
	});
}

io.on("connection", (socket) => {
	socket.on("subscribe", (projectId) => {
		const channel = `logs:${projectId}`;
		socket.join(channel);

		const entry = deployments.get(projectId);
		if (entry) {
			socket.emit("history", entry.logs);
			socket.emit("status", {
				status: entry.status,
				url: entry.url,
			});
		}
	});
});

server.listen(PORT, () => {
	console.log(`Deploy server running on http://0.0.0.0:${PORT}`);
	console.log(`Output dir: ${OUTPUT_DIR}`);
});
