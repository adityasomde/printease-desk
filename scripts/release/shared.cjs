const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootPath = path.resolve(__dirname, "../..");
const shellPath = path.join(rootPath, "desktop-shell");

function execCmd(cmd, args = [], options = {}) {
  console.log(`Running: ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    cwd: rootPath,
    stdio: "inherit",
    shell: true,
    ...options
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status}: ${cmd} ${args.join(" ")}`);
  }
  return result;
}

function cleanBuildDirs() {
  console.log("Cleaning old release folders and installer artifacts...");
  const releaseDir = path.join(shellPath, "release");
  
  if (fs.existsSync(releaseDir)) {
    const targets = [
      path.join(releaseDir, "linux-unpacked"),
      path.join(releaseDir, "win-unpacked")
    ];
    
    for (const target of targets) {
      if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
        console.log(`Removed unpacked directory: ${target}`);
      }
    }

    const files = fs.readdirSync(releaseDir);
    for (const file of files) {
      const filePath = path.join(releaseDir, file);
      const ext = path.extname(file).toLowerCase();
      if (
        ext === ".appimage" ||
        ext === ".deb" ||
        ext === ".exe" ||
        ext === ".blockmap" ||
        file === "latest.yml" ||
        file === "latest-linux.yml"
      ) {
        fs.rmSync(filePath, { force: true });
        console.log(`Removed release artifact: ${filePath}`);
      }
    }
  }
}

module.exports = {
  rootPath,
  shellPath,
  execCmd,
  cleanBuildDirs
};
