# Shipping FinXAI to your device (no Play Store)

## How releases work (continuous delivery)

**Every push to `main` is a release.** `.github/workflows/release.yml` builds a
signed arm64 APK with heavy caching and publishes it as a GitHub Release, which
the in-app updater and Obtainium pick up. There is no release command and no
version-bump commit.

- **Version** is derived from git: `versionName = <VERSION file>.<commits since
  VERSION last changed>`, `versionCode = commit count on main`. To bump
  major/minor, edit the `VERSION` file at the repo root (the patch resets to 0).
- **Skipping a release:** put `[skip ci]` in the commit message, or note that
  pushes touching only `apps/web/**`, `supabase/**`, `eval/**`, or Markdown
  don't trigger an APK build (web has its own deploy workflow).
- **Manual dry run:** Actions tab → Release APK → Run workflow with
  `dry_run: true` builds and verifies but publishes nothing (and warms the
  caches for the next real release).
- Old releases are pruned automatically — the workflow keeps the newest 5.
- **Rapid commits collapse into one release, and that is fine.** The workflow
  uses a `release-apk` concurrency group with `cancel-in-progress: false`, so a
  run never interrupts one that is already building. GitHub allows only one
  *pending* run per group, though, so when three commits land while a build is
  running, the middle one is **cancelled** and the newest is built. A cancelled
  run in the list is normal — the latest code still ships. Only worry if the
  most recent run is cancelled or failed.

### Why arm64-only?
Real phones are arm64-v8a; a single-ABI build is ~40 MB instead of the ~130 MB
universal APK, with zero downside for side-loading. The
`-PreactNativeArchitectures=arm64-v8a` flag is what actually filters prebuilt
`.so` files from AAR deps — a `buildType abiFilters` block does not.

## Signing

- The release keystore lives ONLY in GitHub Actions secrets (`KEYSTORE_BASE64`,
  `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`) plus offline backups.
  **Never commit it or its passwords** — the original 2025 keystore and its
  passwords leaked in public git history and had to be rotated (releases ≥ 1.32
  are signed with the replacement key; devices on ≤ 1.31 needed a one-time
  uninstall/reinstall, guided by the updater).
- The workflow verifies the built APK's certificate against the repo variable
  `RELEASE_CERT_SHA256` **before publishing** — a wrong key installs fine on a
  clean device and breaks only existing installs, so it must never reach the
  update channel. After any future rotation, update that variable:

  ```bash
  keytool -list -v -keystore <keystore> -storepass <pass> | grep SHA256
  gh variable set RELEASE_CERT_SHA256 -R feyton/finxai --body "<AA:BB:...>"
  ```

- **BACK THE KEYSTORE UP** (file + passwords) in a password manager and a cloud
  drive. If it is lost, every installed device refuses updates until the user
  uninstalls.
- Play Store restricts `READ_SMS` apps heavily — side-loading avoids that
  fight entirely.

## In-app self-update
The app checks GitHub Releases on Home and Profile. Downloads go through
Android's DownloadManager, are **SHA-256-verified against GitHub's published
asset digest** (a release without a digest is refused), then handed to the
system installer. `src/appVersion.ts` is rewritten by CI at build time.

## Obtainium (auto-updates on device)
Install [Obtainium](https://github.com/ImranR98/Obtainium), add app →
`https://github.com/feyton/finxai`. It installs/updates whenever a new Release
appears.

## Local dev build / install

```bash
npm run build   # signed arm64 APK → android/app/build/outputs/apk/release/app-release.apk
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Local builds report version `1.31-dev` and need signing creds in
`~/.gradle/gradle.properties` (`KEYSTORE_PASSWORD`, `KEY_ALIAS`,
`KEY_PASSWORD`) plus the keystore at `android/app/finxai_release.keystore`.
This is for on-device testing only — releases come from CI.

## CI performance notes (ported from the bibiliya pipeline, all measured)
- `gradle/actions/setup-gradle@v5` (pinned: v6's caching is closed-source and
  this job holds the signing key) + `org.gradle.caching=true` in
  `android/gradle.properties` — the env-var form of that toggle silently does
  nothing.
- ccache wraps the NDK compilers (React Native's CMake picks it up from PATH);
  `compiler_check=content` is required on CI or every lookup misses. Native
  rebuild: 81.7s cold → 11.1s warm.
- Don't add a `.cxx` directory cache — it never hits (Gradle's up-to-date check
  reads state in `app/build/` that isn't cached alongside it).

## Alternatives considered
- **Firebase App Distribution** — nice tester UX, but requires Firebase + App
  Tester. Worth it only with a bigger tester group.
- **OTA JS updates** — [hot-updater](https://github.com/gronxb/hot-updater)
  supports Supabase storage as backend and ships JS-only changes without an
  APK install. Consider once the native side stabilizes.
