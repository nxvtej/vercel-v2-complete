/** @format */
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const mime = require("mime-types");
const { Redis } = require("ioredis");

require("dotenv").config();

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1:6379";
const publisher = new Redis(REDIS_HOST);

publisher.on("connect", () => console.log("Connected to Redis"));
publisher.on("error", (err) => console.error("Redis error:", err));

const LOCAL_OUTPUT_DIR = process.env.LOCAL_OUTPUT_DIR;

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

	p.stderr.on("data", (data) => {
		console.error(data.toString());
		publishLog(`error: ${data.toString()}`);
	});

	p.on("close", async (code) => {
		if (code !== 0) {
			console.error(`Build failed with exit code ${code}`);
			publishLog(`Build failed with exit code ${code}`);
			process.exit(code);
		}

		console.log("Build Complete");
		publishLog("Build Complete");

		const distFolderPath = path.join(__dirname, "output", "dist");

		async function copyDirectory(directory, destDirectory) {
			fs.mkdirSync(destDirectory, { recursive: true });
			const files = fs.readdirSync(directory, { withFileTypes: true });

			for (const file of files) {
				const sourcePath = path.join(directory, file.name);
				const destPath = path.join(destDirectory, file.name);

				if (file.isDirectory()) {
					await copyDirectory(sourcePath, destPath);
				} else {
					fs.copyFileSync(sourcePath, destPath);
					console.log(`Copied: ${destPath}`);
					publishLog(`Copied: ${destPath}`);
				}
			}
		}

		async function uploadDirectory(directory, s3PathPrefix) {
			const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
			const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

			if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
				throw new Error(
					"AWS credentials required for S3 upload. Set LOCAL_OUTPUT_DIR for local mode."
				);
			}

			const s3Client = new S3Client({
				region: "ap-south-1",
				credentials: {
					accessKeyId: AWS_ACCESS_KEY_ID,
					secretAccessKey: AWS_SECRET_ACCESS_KEY,
				},
			});

			const files = fs.readdirSync(directory, { withFileTypes: true });

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

		if (LOCAL_OUTPUT_DIR) {
			const destDirectory = path.join(LOCAL_OUTPUT_DIR, PROJECT_ID);
			await copyDirectory(distFolderPath, destDirectory);
			console.log(`All files copied to ${destDirectory}`);
			publishLog(`All files copied to ${destDirectory}`);
			return;
		}

		await uploadDirectory(distFolderPath, `__outputs/${PROJECT_ID}`);
		console.log("All files uploaded successfully.");
		publishLog("All files uploaded.");
	});
}

init();
