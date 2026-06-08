console.log(`
====================================================
PrintEase Desktop Release CLI Tools Manual
====================================================

Available Commands:

1. Prepare a new release version:
   npm run release:prepare -- <version>
   - Example: npm run release:prepare -- 0.1.37
   - Validates semver version format, bumps version in root and desktop-shell configs.

2. Run local Linux confidence testing:
   npm run release:test:linux
   - Cleans old folders, compiles production frontend, builds unpacked Linux Electron app,
     runs package checks, locates the executable, launches it, and asks for developer sign-off.
   - Use the --no-launch flag to skip launching the app automatically.

3. Build local Linux distributable files:
   npm run release:linux
   - Compiles final AppImage, deb packages, and creates verification files locally.

4. Push release tag and trigger GitHub Actions build:
   npm run release:tag -- <version>
   - Example: npm run release:tag -- 0.1.37
   - Ensures workspace is clean, versions match, and tag doesn't exist, then creates and pushes tag to remote.

5. Print this help menu:
   npm run release:help

====================================================
Standard Release Process:
====================================================
1. Run: npm run release:prepare -- 0.1.37
2. Commit files: git commit -am "release: prepare desktop v0.1.37" && git push
3. Run: npm run release:test:linux
4. Run: npm run release:tag -- 0.1.37
5. Go to GitHub Actions, wait for the "Desktop Release Build" to finish.
6. Open draft release, download assets, manually verify.
7. Click Publish Release on GitHub.
====================================================
`);
