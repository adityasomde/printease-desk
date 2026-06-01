# Desktop Update Model

This document describes the update and release model for PrintEase Desktop.

- The main/source repos (frontend/backend/desktop-shell) are private.
- This public repo contains only packaged desktop resources and the built frontend bundle.
- The desktop app checks GitHub Releases on this repository for updates.
- Updates are downloaded silently and presented to the user; installation happens only when the user confirms.

Do not include backend code or any secret keys in this repository.
