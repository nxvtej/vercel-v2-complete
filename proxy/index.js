/** @format */

const express = require("express");
const httpProxy = require("http-proxy");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 8000;
require("dotenv").config();

const BASE_PATH = process.env.BASE_PATH_URL;
const LOCAL_OUTPUT_DIR = process.env.LOCAL_OUTPUT_DIR;

function getSubdomain(hostname) {
	if (!hostname || !hostname.includes(".")) {
		return null;
	}
	return hostname.split(".")[0];
}

if (LOCAL_OUTPUT_DIR) {
	app.use((req, res) => {
		const subdomain = getSubdomain(req.hostname);
		if (!subdomain) {
			return res.status(400).send("Invalid hostname format");
		}

		const projectDir = path.join(LOCAL_OUTPUT_DIR, subdomain);
		const requestPath = req.url === "/" ? "/index.html" : req.url;
		let filePath = path.join(projectDir, requestPath);

		if (!filePath.startsWith(projectDir)) {
			return res.status(403).send("Forbidden");
		}

		if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
			filePath = path.join(projectDir, "index.html");
		}

		if (!fs.existsSync(filePath)) {
			return res.status(404).send("Project not found");
		}

		return res.sendFile(filePath);
	});

	app.listen(PORT, () =>
		console.log(
			`Reverse Proxy Running on port ${PORT} (local mode: ${LOCAL_OUTPUT_DIR})`
		)
	);
} else {
	const proxy = httpProxy.createProxy();

	app.use((req, res) => {
		const subdomain = getSubdomain(req.hostname);
		if (!subdomain) {
			return res.status(400).send("Invalid hostname format");
		}

		const resolvesTo = `${BASE_PATH}/${subdomain}`;
		return proxy.web(req, res, { target: resolvesTo, changeOrigin: true });
	});

	proxy.on("proxyReq", (proxyReq, req) => {
		if (req.url === "/") {
			proxyReq.path += "index.html";
		}
	});

	app.listen(PORT, () => console.log(`Reverse Proxy Running on port ${PORT}`));
}
