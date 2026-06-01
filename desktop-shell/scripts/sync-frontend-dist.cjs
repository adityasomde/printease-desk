const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const frontendDist = path.join(repoRoot, "frontend", "dist");
const desktopBundle = path.join(repoRoot, "frontend-dist");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Frontend build folder missing: ${src}`);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

copyDir(frontendDist, desktopBundle);
console.log(`Synced frontend build to ${path.relative(repoRoot, desktopBundle)}`);
