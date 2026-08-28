<div align="center">
  <img src="./build/icon.png" alt="Quark Share Exporter" width="88" height="88">
  <h1>Quark Share Exporter</h1>
  <p><strong>Turn local folders or existing Quark Drive content into organized, deliverable share-link lists.</strong></p>
  <p>
    <strong>English</strong> ·
    <a href="./README.zh-CN.md">简体中文</a>
  </p>
  <p>
    <a href="https://github.com/HardToFd/quark-share-exporter/releases/latest">Download</a> ·
    <a href="https://github.com/HardToFd/quark-share-exporter/issues">Issues</a>
  </p>
</div>

![Quark Share Exporter workspace](./docs/images/workspace-overview.png)

<p align="center"><sub>Workspace preview rendered with demo data. No live account credentials or user files are shown.</sub></p>

## What it does

Quark Share Exporter, also called **QuarkLink**, combines upload, directory selection, share creation, and export in one Electron desktop application. It supports two practical workflows:

- **Local → Quark Drive:** preserve a local directory tree, upload it, and create links from the returned FIDs.
- **Quark Drive → Export:** browse or search existing cloud content, select a recursive scope, and create links without downloading it first.

The application can create one link per item or bundle items into groups, generate public or private links, apply permanent or time-limited expiry, and export the results to CSV and Excel.

> [!NOTE]
> The desktop interface is currently in Simplified Chinese. Quark Share Exporter is an independent community project, not an official Quark product and not affiliated with or endorsed by Quark. Its drive integration is based on the official [Quark Drive `quarkclouddrive` Skill v1.0.15](https://pdds.quark.cn/download/stfile/bbhhdeegcbcfbdjdp/quarkclouddrive-1.0.15.zip).

## Highlights

- Preserve nested local folders instead of flattening uploads.
- Configure each local directory independently as disabled, L0 only, down to a chosen depth, or all descendants.
- Browse Quark Drive lazily: load the root first, then expand one folder level at a time.
- Use keyword search as a secondary locator and consume the full search artifact when available.
- Share per item with up to three workers, or bundle up to 100 items into one link.
- Export successful links, server-generated passcodes, source mappings, and share failures to CSV and `.xlsx`.
- Keep completed results when a job is stopped.
- Verify the bundled Quark Drive runtime with SHA-256 before execution.

## Download

Download the current build from [GitHub Releases](https://github.com/HardToFd/quark-share-exporter/releases/latest).

| Platform | Choose this asset | Distribution |
| --- | --- | --- |
| Windows 10/11 x64 | `*-Setup-x64.exe` | Installer |
| Windows 10/11 x64 | `*-Portable-x64.exe` | Portable executable |
| macOS, Intel and Apple Silicon | `*-mac-universal.dmg` | Universal disk image |
| macOS, Intel and Apple Silicon | `*-mac-universal.zip` | Universal archive |

Release notes contain SHA-256 checksums for the published assets.

> [!WARNING]
> Current Windows builds are not Authenticode-signed. Current macOS builds are not signed or notarized with an Apple Developer ID. Review the source and release checksum before running a downloaded package; operating-system reputation prompts may appear.

## Quick start

1. Launch the package for your operating system.
2. Authorize your Quark Drive account in the system browser. If automatic return fails, paste the authorization code into the application.
3. Choose **Local upload** or **Cloud directory** as the source.
4. Select the directory root, recursion depth, and item types to share.
5. Choose per-item or bundled sharing, visibility, and expiry, then confirm the policy.
6. Select CSV, Excel, or both, choose an output folder, and start the job.

The exported files contain completed links, private-link passcodes, source paths, FIDs, policy settings, and share-creation errors.

## Recursion rules

| Level | Included scope |
| --- | --- |
| L0 | The selected directory itself |
| L1 | L0 plus its direct children |
| L2+ | Progressively deeper descendants |
| All descendants | No configured depth limit |

For a locally selected folder, the default rule creates **one link for the root folder**. Files inside the folder are uploaded as its contents and are not automatically split into separate links. Enable deeper directory rules or add files explicitly when individual links are required.

For existing cloud content, you can include or exclude the selected root and filter files, folders, or both. Unloaded levels are fetched on demand before execution.

## Sharing and export

| Setting | Supported values |
| --- | --- |
| Granularity | Per item, or bundled groups of 1–100 items |
| Visibility | Public, or private with a Quark-generated passcode |
| Expiry | Permanent, 1, 7, 30, 60, 100, or 180 days |
| Failure policy | Stop, or continue and record failed share attempts |
| Export | CSV, Excel, or both |

Exports include batch and status fields, local/cloud paths, item metadata, FIDs, the selected share policy, URLs, passcodes, timestamps, and errors. CSV uses UTF-8 with a BOM and guards cells beginning with `=`, `+`, `-`, or `@` against spreadsheet formula injection. Existing files are not overwritten; a numeric suffix is added automatically.

Excel workbooks contain two worksheets: `分享链接` (Share Links) and `任务摘要` (Task Summary).

## Limits and safeguards

- Keyword search loads at most 3,000 items per request and warns when the server reports a larger result set.
- Folder browsing stops with an explicit error if one parent exceeds the 200-page safety limit.
- Symbolic links are skipped during local inventory to avoid recursive directory loops.
- Only uploaded items that receive a valid FID can proceed to sharing. Upload failures are logged; share-creation failures also appear in the export.
- Cancelling a job stops active CLI processes and exports already completed share rows when any exist.
- Private-link passcodes are generated by Quark and cannot be customized in the application.
- Live behavior depends on account permissions, service availability, and upstream API behavior. Automated tests and launch checks do not replace an authenticated end-to-end run in your environment.

## Security and privacy

- OAuth and drive operations run through the bundled runtime extracted from the official [Quark Drive `quarkclouddrive` Skill v1.0.15 package](https://pdds.quark.cn/download/stfile/bbhhdeegcbcfbdjdp/quarkclouddrive-1.0.15.zip).
- Executable runtime files are allowlisted in `vendor/quark-drive/manifest.json` and verified with SHA-256 before execution.
- After verification, the runner applies a narrow in-memory compatibility layer that identifies the desktop application as `quarklink` and requests authorization as an unrecognized third-party agent. The verified files on disk are not rewritten.
- Release packages exclude account configuration, access tokens, search history, and other user data.
- Electron uses a sandboxed renderer, context isolation, disabled Node.js integration, and a minimal IPC bridge.
- External navigation is blocked except for HTTPS links opened by the operating system.
- Sharing cannot begin until visibility and expiry are explicitly confirmed.

## Development

Requires Node.js 24 or later and its bundled npm.

```bash
git clone https://github.com/HardToFd/quark-share-exporter.git
cd quark-share-exporter
npm ci
npm run dev
```

Run the quality gates:

```bash
npm test
npm run typecheck
npm run build
npm audit
```

Create desktop packages:

```bash
npm run dist:win  # Windows: installer and portable executable
npm run dist:mac  # macOS: universal DMG and ZIP; run on macOS
```

Build output is written to `release/`. Tagged releases and manual release runs use `.github/workflows/build-desktop.yml` to test, type-check, package, and upload Windows and macOS assets.

<details>
<summary><strong>Repository layout</strong></summary>

```text
electron/
  main/                 Electron window and IPC registration
  preload/              Sandboxed renderer bridge
  services/             Runtime, authentication, cloud data, workflow, export
src/
  app/                  React application entry
  pages/workspace/      Workspace page, state model, UI, and styles
  shared/               Shared types, utilities, and UI primitives
vendor/quark-drive/     Integrity-manifested Quark Drive runtime
```

</details>

## Project status

Checks rerun against `main` on 2026-08-28:

| Check | Result |
| --- | --- |
| `npm test` | **PASS** — 8 files, 23 tests |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |
| Dependency audit during `npm ci` | **PASS** — 0 reported vulnerabilities |
| Browser OAuth with the `quarklink` identity | **PASS** — manually confirmed on Windows with Skill v1.0.15 |
| Windows/macOS release packaging | **PASS** for [v0.1.6](https://github.com/HardToFd/quark-share-exporter/releases/tag/v0.1.6) |
| Authenticated upload → share → export | **Not asserted by this snapshot**; verify with your own account and test data |

## License and disclaimer

Quark Share Exporter is licensed under the [Apache License 2.0](LICENSE). Third-party components remain subject to their respective licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution, including the bundled official Quark Drive runtime.

Quark Share Exporter is not affiliated with or endorsed by Quark. Use it only with content you are authorized to access and share, and comply with applicable Quark Drive terms and local laws.
