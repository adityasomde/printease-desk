# PrintEase Desktop Release CI Automation

This document details the automated release pipeline for PrintEase Desktop using GitHub Actions.

---

## 1. Safety Release Model

PrintEase Desktop releases are built automatically but **published manually**. 

Because previous builds had issues (where compilation succeeded, but the app rendered a blank screen upon launch due to missing packaged files), CI is configured to output a **Draft Release** only.

> [!IMPORTANT]
> **NEVER** publish a draft release until you have downloaded, installed, and launched the resulting artifacts on both Linux and Windows machines to confirm they load successfully.

---

## 2. Triggering the Workflow

The workflow can be triggered in two ways:

### A. Tag-Based Release (Recommended)
Pushing a tag starting with `desktop-v` will automatically trigger the release pipeline for that version:

```bash
git checkout main
git pull
git tag desktop-v0.1.39
git push origin desktop-v0.1.39
```

### B. Manual Workflow Dispatch
You can manually run the build via the GitHub Actions UI:
1. Go to the **Actions** tab of the `adityasomde/printease-desk` repository.
2. Select the **Desktop Release Build** workflow.
3. Click the **Run workflow** dropdown.
4. Input the version number (e.g., `0.1.36`) and select the branch (e.g., `main`).
5. Click **Run workflow**.

---

## 3. Workflow Outputs

Once the jobs finish, a draft release will be created on GitHub with the following attached files:

### Linux Assets:
- `PrintEase-Desktop-<version>-x86_64.AppImage` (Linux standalone)
- `PrintEase-Desktop-<version>-amd64.deb` (Debian/Ubuntu package)
- `latest-linux.yml` (For Linux auto-updater tracking)

### Windows Assets:
- `PrintEase-Desktop-Setup-<version>.exe` (Windows setup installer)
- `latest.yml` (For Windows auto-updater tracking)

---

## 4. Manual Verification Checklist

Before changing the release status from **Draft** to **Published**:

1. **Download the artifacts** from the draft release page.
2. **On Linux**:
   - Make the AppImage executable: `chmod +x PrintEase*.AppImage`
   - Run the AppImage: `./PrintEase*.AppImage`
   - Verify that the app opens, the login/dashboard renders (no blank screen), and the printer page loads.
3. **On Windows**:
   - Double-click the `.exe` installer.
   - Install the application.
   - Run the application and confirm there is no blank screen and the agent prints/detects successfully.
4. **Publish**:
   - Once all manual tests are clean, edit the draft release on GitHub and click **Publish release**.

---

## 5. Troubleshooting Job Failures

### If the Windows Build Job Fails:
- Check for dependency mismatches or compilation errors in Windows-specific printer code (e.g., `printer/windows`).
- Confirm that `vendor/win/SumatraPDF.exe` exists in the repository.

### If the Linux Build Job Fails:
- Verify that standard dependency builds compile properly under Node 24.
- Check if package verification (`verify-package-files.cjs`) reported forbidden file inclusion (e.g., Windows printer files inside a Linux build).

### Clean Stale Files (Local Developer Builds):
If running package verification locally and it fails because of cross-platform builds:
- The verification script now automatically targets the platform directory (`release/linux-unpacked` or `release/win-unpacked`) depending on the `PE_TARGET_PLATFORM` environment variable. This avoids false positives from stale files.
- To clean the folders manually, you can run step 1 in the Release Builder GUI or run:
  ```bash
  npm run clean --prefix desktop-shell
  ```
