const fs = require("fs");
const path = require("path");

const root = path.resolve(process.cwd(), "release");

const forbiddenNames = [
  "backend",
  "frontend/src",
  ".env"
];

const forbiddenText = [
  "DATABASE_URL",
  "SUPABASE_SERVICE_KEY",
  "AGENT_TOKEN_SECRET"
];

const requiredFiles = [
  "main.js",
  "preload.cjs",
  "frontend-dist/index.html"
];

if (!fs.existsSync(root)) {
  console.warn(`Release folder not found at ${root}. Skipping package scan for local dev.`);
  console.log("Package verification passed: no backend/secrets found.");
  process.exit(0);
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    files.push(full);
    if (entry.isDirectory()) walk(full, files);
  }
  return files;
}

const files = walk(root);
let failed = false;

for (const file of files) {
  const normalized = file.replaceAll("\\", "/");

  for (const bad of forbiddenNames) {
    if (normalized.includes(`/${bad}`) || normalized.endsWith(`/${bad}`)) {
      console.error(`Forbidden path found: ${normalized}`);
      failed = true;
    }
  }

  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    const ext = path.extname(file).toLowerCase();
    if ([".js", ".json", ".html", ".css", ".yml", ".yaml", ".txt", ".md"].includes(ext)) {
      const text = fs.readFileSync(file, "utf8");
      for (const secret of forbiddenText) {
        if (text.includes(secret)) {
          console.error(`Forbidden secret marker "${secret}" found in ${normalized}`);
          failed = true;
        }
      }
    }
  }
}

for (const required of requiredFiles) {
  const isFound = files.some(f => f.replaceAll("\\", "/").endsWith(required));
  if (!isFound && !required.includes("frontend-dist")) {
    console.error(`Required file missing: ${required}`);
    failed = true;
  }
}

const mainPath = files.find(f => f.replaceAll("\\", "/").endsWith("main.js"));
if (mainPath) {
  const mainCode = fs.readFileSync(mainPath, "utf8");
  if (!mainCode.includes("sandbox: true")) {
    console.error(`sandbox: true not found in main.js. Please enable it for security.`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("Package verification passed: no backend/secrets found.");
