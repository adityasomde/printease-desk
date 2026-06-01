const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const shellRoot = path.resolve(__dirname, "..");
const releaseDir = path.join(shellRoot, "release");
const { version } = require(path.join(shellRoot, "package.json"));
const appBuilder = path.join(
  shellRoot,
  "node_modules",
  "app-builder-bin",
  process.platform,
  process.arch,
  "app-builder"
);

if (!fs.existsSync(releaseDir)) {
  throw new Error(`Release directory does not exist: ${releaseDir}`);
}

const appImages = fs
  .readdirSync(releaseDir)
  .filter((file) => file.endsWith(".AppImage") && file.includes(`-${version}-`))
  .map((file) => path.join(releaseDir, file));

if (appImages.length === 0) {
  throw new Error("No AppImage files found for blockmap generation.");
}

for (const appImage of appImages) {
  const blockMap = `${appImage}.blockmap`;
  const result = spawnSync(appBuilder, ["blockmap", "--input", appImage, "--output", blockMap], {
    cwd: shellRoot,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `Failed to create blockmap for ${path.basename(appImage)}.`,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  console.log(`Created ${path.relative(shellRoot, blockMap)}`);
}
