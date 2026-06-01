# Windows Printing

PrintEase Desktop detects Windows printers with PowerShell and submits PDF files through the SumatraPDF command-line interface.

Printer detection uses:

```powershell
powershell.exe -NoProfile -Command "Get-Printer | Select Name,Default,PrinterStatus"
```

PDF printing requires `SumatraPDF.exe`. PrintEase checks these locations:

- `PRINTEASE_SUMATRA_PATH`
- `desktop-shell/vendor/sumatrapdf/SumatraPDF.exe`
- bundled app resources at `vendor/sumatrapdf/SumatraPDF.exe`
- `C:\Program Files\SumatraPDF\SumatraPDF.exe`
- `C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe`

For bundled mode, place `SumatraPDF.exe` at:

```txt
desktop-shell/vendor/sumatrapdf/SumatraPDF.exe
```

This repo does not currently require that vendor file for builds, so Linux and CI builds do not fail when it is absent. If SumatraPDF is missing at runtime, Windows printing returns a clear error instead of pretending the print succeeded.

Limitations:

- Windows printing must be manually tested on Windows.
- Linux development can syntax-check the Windows module, but cannot validate PowerShell printer detection or SumatraPDF printing.
- Only PDF files are submitted through the Windows printer path.
