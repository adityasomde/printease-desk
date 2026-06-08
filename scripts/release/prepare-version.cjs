const { execCmd } = require("./shared.cjs");
const path = require("path");

const versionArg = process.argv[2];

if (!versionArg) {
  console.error("Error: Missing version argument.");
  console.log("Usage: npm run release:prepare -- <version>");
  console.log("Example: npm run release:prepare -- 0.1.37");
  process.exit(1);
}

const semverRegex = /^\d+\.\d+\.\d+$/;
if (!semverRegex.test(versionArg)) {
  console.error(`Error: Invalid version format "${versionArg}". Must be semver-like (e.g. 0.1.37).`);
  process.exit(1);
}

try {
  console.log(`Bumping root package version to ${versionArg}...`);
  execCmd("npm", ["version", versionArg, "--no-git-tag-version"]);

  console.log(`Bumping desktop-shell package version to ${versionArg}...`);
  execCmd("npm", ["version", versionArg, "--no-git-tag-version", "--prefix", "desktop-shell"]);

  console.log("\n====================================================");
  console.log("SUCCESS: Version bump completed successfully.");
  console.log("====================================================");
  console.log(`Version set to: ${versionArg} in both root and desktop-shell.`);
  console.log("\nNext Steps:");
  console.log("1. Review git changes:");
  console.log("   git diff");
  console.log("2. Stage and commit files:");
  console.log(`   git add package.json package-lock.json desktop-shell/package.json desktop-shell/package-lock.json`);
  console.log(`   git commit -m "release: prepare desktop v${versionArg}"`);
  console.log("   git push");
  console.log("3. Test local startup:");
  console.log("   npm run release:test:linux");
  console.log("4. Tag and trigger CI Release build:");
  console.log(`   npm run release:tag -- ${versionArg}`);
  console.log("====================================================\n");
} catch (err) {
  console.error("Error occurred during version preparation:", err.message);
  process.exit(1);
}
