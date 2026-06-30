# LibreOffice Converter Manager

Last updated: 2026-06-30

## Purpose

PrintEase desktop converts Office files to PDF through LibreOffice headless. The conversion command and print/order/payment workflow must stay stable. The current migration only changes how the app resolves the `soffice` executable path.

## Current Safe Layer

The public compatibility entry remains:

```txt
desktop-shell/agent/printPreparation/conversionEngine.js
```

Existing conversion code still calls:

```js
findLibreOfficeExecutable()
```

That wrapper now delegates to:

```txt
desktop-shell/src/services/converter/converterManager.js
desktop-shell/src/services/converter/libreOfficeDetector.js
desktop-shell/src/services/converter/converterConfig.js
desktop-shell/src/services/converter/conversionRunner.js
```

## Detection Priority

The resolver checks in this order:

1. Saved PrintEase converter config in the user data directory.
2. Auto-installed PrintEase converter path under the user data converter folder.
3. Explicit extra paths passed by callers.
4. User-installed LibreOffice in normal OS locations.
5. Old bundled LibreOffice fallback under Electron resources.
6. Development vendor fallback under `desktop-shell/vendor/libreoffice`.
7. `soffice` / `libreoffice` available through `PATH` for the current OS.

## Local Config

Successful system or auto-installed detections can be written to:

```txt
Windows: %LOCALAPPDATA%/PrintEase/converter/converter.json
Linux: ~/.local/share/PrintEase/converter/converter.json
macOS: ~/Library/Application Support/PrintEase/converter/converter.json
```

Use `PRINTEASE_CONVERTER_HOME` only for local diagnostics/tests.

## Startup Behavior

Desktop startup now performs a non-blocking converter check after the main window is created. It updates the desktop agent session with:

```txt
converterStatus
converterSource
converterMessage
converterPath
```

This status appears in the Conversion Diagnostics page.

## Not Implemented Yet

Automatic download/extraction is implemented but intentionally inactive until there is a stable, verified converter manifest with:

```txt
download URL
expected SHA256
archive layout
license/notice handling
```

The manifest can be supplied by:

```txt
desktop-shell/config/converter-manifest.json
PRINTEASE_CONVERTER_MANIFEST_FILE=/path/to/converter-manifest.json
PRINTEASE_CONVERTER_MANIFEST_JSON='{"platforms":{...}}'
```

An example is kept at:

```txt
desktop-shell/config/converter-manifest.example.json
```

Schema:

```json
{
  "platforms": {
    "win32": {
      "url": "https://...",
      "sha256": "...",
      "archiveType": "zip",
      "executableRelativePath": "program/soffice.com",
      "version": "..."
    },
    "linux": {
      "url": "https://...",
      "sha256": "...",
      "archiveType": "tar.gz",
      "executableRelativePath": "program/soffice",
      "version": "..."
    }
  }
}
```

Do not silently run a LibreOffice MSI installer. Runtime setup downloads to temp, verifies SHA256, extracts to temp, then moves into the final converter directory. The detector then tests the resolved `soffice` path before conversion uses it.

Extraction guards added in this migration:

```txt
- failed verified/downloaded archives clean their temp folder
- nested archive roots are searched for the declared executable path
- Linux/macOS extracted soffice files are chmodded executable when needed
- setup failure status is emitted back to the desktop agent session
```

## Do Not Change During Converter Work

Avoid touching:

```txt
auth logic
payment logic
order creation
pricing rules
page-limit rules
print dispatch
hub pairing/token logic
backend API contracts
```

Only change converter detection/setup modules unless a separate bug is proven.
