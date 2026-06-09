const { execCmd, rootPath } = require("./shared.cjs");
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const versionArg = process.argv[2];

if (!versionArg) {
  console.error("Error: Missing version argument.");
  console.log("Usage: npm run release:tag -- <version>");
  console.log("Example: npm run release:tag -- 0.1.37");
  process.exit(1);
}

// 1. Check root package.json version
const rootPkg = require(path.join(rootPath, "package.json"));
if (rootPkg.version !== versionArg) {
  console.error(`Error: Root package.json version "${rootPkg.version}" does not match argument "${versionArg}".`);
  console.log("Please run: npm run release:prepare -- " + versionArg);
  process.exit(1);
}

// 2. Check desktop-shell/package.json version
const shellPkg = require(path.join(rootPath, "desktop-shell/package.json"));
if (shellPkg.version !== versionArg) {
  console.error(`Error: desktop-shell/package.json version "${shellPkg.version}" does not match argument "${versionArg}".`);
  console.log("Please run: npm run release:prepare -- " + versionArg);
  process.exit(1);
}

// Helper to run git commands and get string output
function runGit(args) {
  const result = spawnSync("git", args, { cwd: rootPath, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Git command failed: git ${args.join(" ")}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

try {
  // 3. Check git working tree is clean
  const status = runGit(["status", "--porcelain"]);
  if (status !== "") {
    console.error("Error: Git working tree is not clean. Commit or stash your changes first.");
    console.log("Git Status:\n" + status);
    process.exit(1);
  }

  // 4. Check current branch is main or ask
  const currentBranch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const proceedWithTag = () => {
    // 5. Check if tag already exists locally
    const tagName = `desktop-v${versionArg}`;
    const localTagExists = runGit(["tag", "-l", tagName]);
    if (localTagExists) {
      console.error(`Error: Tag ${tagName} already exists locally.`);
      rl.close();
      process.exit(1);
    }

    // 6. Check if tag already exists remotely
    console.log("Checking remote tags...");
    const remoteTagExists = runGit(["ls-remote", "--tags", "origin", `refs/tags/${tagName}`]);
    if (remoteTagExists) {
      console.error(`Error: Tag ${tagName} already exists on remote origin.`);
      rl.close();
      process.exit(1);
    }

    // 7. Create tag
    console.log(`Creating tag ${tagName}...`);
    runGit(["tag", tagName]);

    // 8. Push tag
    console.log(`Pushing tag ${tagName} to origin...`);
    runGit(["push", "origin", tagName]);

    console.log("\n====================================================");
    console.log("SUCCESS: Tag pushed.");
    console.log("====================================================");
    console.log("GitHub Actions will automatically build Linux + Windows and create a DRAFT release.");
    console.log("REMINDER: The release is created as a DRAFT. You MUST download and test the built");
    console.log("installers on your target device before publishing the draft manually on GitHub.");
    console.log("====================================================\n");
    rl.close();
    process.exit(0);
  };

  if (currentBranch !== "main") {
    rl.question(`WARNING: You are on branch "${currentBranch}", not "main". Proceed anyway? Type YES to confirm: `, (answer) => {
      if (answer.trim().toUpperCase() === "YES") {
        proceedWithTag();
      } else {
        console.log("Aborted tag operation.");
        rl.close();
        process.exit(1);
      }
    });
  } else {
    proceedWithTag();
  }

} catch (err) {
  console.error("Git checks failed:", err.message);
  process.exit(1);
}
