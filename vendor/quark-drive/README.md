# Bundled Quark Drive runtime

This directory contains only the executable runtime files extracted from the
locally installed official `quarkclouddrive` Skill v1.0.15. Account files,
access tokens, search artifacts, and other user data are deliberately excluded.

The desktop app verifies both files against `manifest.json` before invoking the
runtime. Authentication remains owned by the official CLI and is stored in the
CLI-selected per-user configuration location.

To update this runtime, first update the global Skill with its official
`scripts/install.sh`, then replace both files and refresh their SHA-256 values.

## License and attribution

The upstream official `quarkclouddrive` Skill identifies the project as
licensed under the Apache License 2.0. This bundled runtime remains attributed
to its upstream copyright holder and is not relicensed as original work of
Quark Share Exporter. See the repository-level `LICENSE`, `NOTICE`, and
`THIRD_PARTY_NOTICES.md` files for details.
