# Bundled Quark Drive runtime

This directory contains only the executable runtime files extracted from the
locally installed official `quarkclouddrive` Skill v1.0.15. Account files,
access tokens, search artifacts, and other user data are deliberately excluded.

The desktop app verifies both files against `manifest.json` before invoking the
runtime. Authentication remains owned by the official CLI and is stored in the
CLI-selected per-user configuration location.

To update this runtime, first update the global Skill with its official
`scripts/install.sh`, then replace both files and refresh their SHA-256 values.
