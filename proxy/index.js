/** @format */

const express = require("express");
const httpProxy = require("http-proxy");

const app = express();
const PORT = 8000;
require("dotenv").config();

const BASE_PATH = process.env.BASE_PATH_URL;

const proxy = httpProxy.createProxy();

app.use((req, res) => {
	let hostname = req.hostname;
	if (!hostname || !hostname.includes(".")) {
		return res.status(400).send("Invalid hostname format");
	}
	const subdomain = hostname.split(".")[0];
	const resolvesTo = `${BASE_PATH}/${subdomain}`;
	return proxy.web(req, res, { target: resolvesTo, changeOrigin: true });
});

proxy.on("proxyReq", (proxyReq, req, res) => {
	if (req.url === "/") {
		proxyReq.path += "index.html";
	}
});

app.listen(PORT, () => console.log(`Reverse Proxy Running on port ${PORT}`));
