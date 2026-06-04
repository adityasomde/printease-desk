# PrintEase Desktop — Build & Run (Local)

## Prerequisites
- Node.js and npm installed
- Basic build tools for native modules (make, gcc) on Linux

## Quick commands

1) Install dependencies
```bash
cd desktop-shell
npm install
```

2) Development (frontend + Electron)
```bash
# in one terminal: start frontend dev server
cd frontend
npm install
npm run dev

# in another terminal: start Electron
cd ../desktop-shell
npm run dev
```

3) Build distributable (AppImage for Linux)
```bash
cd desktop-shell
npm install
npm run dist:appimage
chmod +x release/PrintEase-Desktop-*.AppImage
./release/PrintEase-Desktop-*.AppImage
```

## Notes
- The packager copies `../frontend-dist` into the app. Ensure the frontend production build exists:
```bash
cd frontend
npm run build
```
- Build artifacts are written to `desktop-shell/release/`.
- On some Linux systems you may need `libfuse2` or AppImage runtime support to run AppImages.
