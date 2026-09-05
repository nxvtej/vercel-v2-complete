const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

function copyDirectory(src, dest) {
	fs.mkdirSync(dest, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDirectory(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

function runBuild({ projectId, gitUrl, workDir, outputDir, onLog }) {
	return new Promise((resolve, reject) => {
		const cloneDir = path.join(workDir, projectId);

		onLog(`Cloning ${gitUrl}...`);

		const clone = exec(`git clone --depth 1 "${gitUrl}" "${cloneDir}"`);

		clone.stderr.on("data", (data) => onLog(data.toString()));
		clone.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`git clone failed (exit ${code})`));
				return;
			}

			onLog("Running npm install && npm run build...");
			const build = exec("npm install && npm run build", { cwd: cloneDir });

			build.stdout.on("data", (data) => onLog(data.toString()));
			build.stderr.on("data", (data) => onLog(data.toString()));

			build.on("close", (buildCode) => {
				if (buildCode !== 0) {
					reject(new Error(`build failed (exit ${buildCode})`));
					return;
				}

				const distDir = [path.join(cloneDir, "dist"), path.join(cloneDir, "out")].find(
					(dir) => fs.existsSync(dir)
				);

				if (!distDir) {
					reject(
						new Error(
							"build finished but no output folder found (expected dist/ or out/)"
						)
					);
					return;
				}

				onLog(`Using build output: ${path.basename(distDir)}/`);

				const dest = path.join(outputDir, projectId);
				if (fs.existsSync(dest)) {
					fs.rmSync(dest, { recursive: true, force: true });
				}

				onLog(`Copying artifacts to ${dest}...`);
				copyDirectory(distDir, dest);

				try {
					fs.rmSync(cloneDir, { recursive: true, force: true });
				} catch {
					onLog("Warning: could not remove temp build directory");
				}

				onLog("Deploy complete.");
				resolve(dest);
			});
		});
	});
}

module.exports = { runBuild };
