const { cleanBuildDirs, execCmd, shellPath } = require("./shared.cjs");
const fs = require("fs");
const path = require("path");

try {
  // 1. Clean
  cleanBuildDirs();

  // 2. Build frontend
  console.log("\nBuilding frontend source...");
  execCmd("npm", ["run", "build:frontend"]);

  // 3. Run final Linux build
  console.log("\nBuilding final Linux distributable packages...");
  execCmd("npm", ["run", "dist:linux"], { cwd: shellPath });

  // 4. Verify package inside desktop-shell
  console.log("\nRunning package verification checks...");
  execCmd("npm", ["run", "verify:package"], {
    cwd: shellPath,
    env: { ...process.env, PE_TARGET_PLATFORM: "linux" }
  });

  // 5. Print generated files and sizes
  console.log("\n====================================================");
  console.log("SUCCESS: Linux build completed.");
  console.log("====================================================");
  
  const releaseDir = path.join(shellPath, "release");
  if (fs.existsSync(releaseDir)) {
    const files = fs.readdirSync(releaseDir);
    let foundArtifacts = false;

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext === ".appimage" || ext === ".deb" || file === "latest-linux.yml") {
        const filePath = path.join(releaseDir, file);
        const stat = fs.statSync(filePath);
        const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
        console.log(`- ${file} (${sizeMB} MB)`);
        foundArtifacts = true;
      }
    }

    if (!foundArtifacts) {
      console.log("No final release artifacts found in output folder.");
    }
  }

  console.log("\n[WARNING] Do not upload unless the local unpacked app was tested successfully!");
  console.log("====================================================\n");

} catch (err) {
  console.error("\nLinux build process failed:", err.message);
  process.exit(1);
}
