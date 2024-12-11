/** @format */
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const mime = require("mime-types");
const { Redis } = require("ioredis");

require("dotenv").config();

const REDIS_HOST = "";
const publisher = new Redis(REDIS_HOST);

const AWS_ACCESS_KEY_ID = "";
const AWS_SECRET_ACCESS_KEY = "";

const s3Client = new S3Client({
	region: "ap-south-1",
	credentials: {
		accessKeyId: AWS_ACCESS_KEY_ID || "",
		secretAccessKey: AWS_SECRET_ACCESS_KEY || "",
	},
});

// assume have slug/projectID
const PROJECT_ID = process.env.PROJECT_ID || "vercel-v1";

function publishLog(log) {
	publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify({ log }));
}

async function init() {
	console.log("Executing script.js");
	publishLog("Executing script.js");

	const outDirPath = path.join(__dirname, "output"); // Output directory for the build process
	publishLog(`Build Started....`);
	publishLog(`npm install && npm run build`);

	const p = exec(`cd ${outDirPath} && npm install && npm run build`);

	// all logs came from building
	console.log("streaming logs from building...");
	p.stdout.on("data", (data) => {
		console.log(data.toString());
		publishLog(data.toString());
	});

	p.stderr.on("error", (data) => {
		console.error("error encountered");
		console.error(data.toString());
		publishLog(`error: ${data.toString()}`);
	});

	p.on("close", async () => {
		console.log("Build Complete");
		publishLog("Build Complete");

		const distFolderPath = path.join(__dirname, "output", "dist");

		// Upload each file while preserving the directory structure
		async function uploadDirectory(directory, s3PathPrefix) {
			const files = fs.readdirSync(directory, { withFileTypes: true }); //not recusive: true

			for (const file of files) {
				const filePath = path.join(directory, file.name);

				if (file.isDirectory()) {
					await uploadDirectory(filePath, `${s3PathPrefix}/${file.name}`);
				} else {
					const key = `${s3PathPrefix}/${file.name}`;
					console.log(`Uploading: ${key}`);

					const command = new PutObjectCommand({
						Bucket: "vercel-v2",
						Key: key,
						Body: fs.createReadStream(filePath),
						ContentType: mime.lookup(filePath),
					});

					await s3Client.send(command);
					console.log(`Uploaded: file ${key}`);
					publishLog(`Uploaded :file ${key}`);
				}
			}
		}
		await uploadDirectory(distFolderPath, `__outputs/${PROJECT_ID}`);
		console.log("All files uploaded successfully.");
		publishLog("All files uploaded.");
	});
}

init();
