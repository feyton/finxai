# Shipping FinXAI to your device (no Play Store)

## One-time setup (already done on this machine)

- **Release keystore**: `android/app/finxai_release.keystore` (gitignored). Credentials live in
  `C:\Users\feyto\.gradle\gradle.properties` (outside the repo — Gradle reads it automatically):
  `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.
  Do NOT put them back in `android/gradle.properties` — that file is git-tracked and the old
  passwords were exposed in the repo history (rotated 2026-07-08 for that reason).
- **BACK BOTH UP** (keystore + passwords) somewhere safe (password manager + cloud drive).
  If you lose them, devices with the app installed will refuse updates until they uninstall.
- Play Store restricts `READ_SMS` apps heavily — side-loading avoids that fight entirely.

## Cut a release (primary path — local build)

**One command:**

```bash
npm run release            # asks major / minor / patch, then does everything
# or non-interactive:
npm run release -- minor
```

It bumps `versionCode` + `versionName` (and `src/appVersion.ts`), commits, tags,
builds a **signed arm64-v8a APK** (~40 MB, not the ~130 MB universal build),
pushes `main`, and publishes a GitHub Release with the APK attached via `gh`.

Requirements: [`gh`](https://cli.github.com/) authenticated (`gh auth login`) and
signing creds in `~/.gradle/gradle.properties`.

### Why arm64-only?
The old CI build was a **universal APK** bundling native libs for all four ABIs
(arm64, armeabi-v7a, x86, x86_64) → ~130 MB. Real phones are arm64-v8a, so a
single-ABI build is ~1/3 the size with zero downside for side-loading. The
`-PreactNativeArchitectures=arm64-v8a` flag is baked into `npm run build` and the
release script.

### Version bump prompt on push
`.githooks/pre-push` asks "is this a release? maj/min/patch/N" when you push
`main`. Pick a bump type and it runs `npm run release <type>` for you; pick N and
the push proceeds normally. Enable once (already done on this machine):

```bash
git config core.hooksPath .githooks
```

## In-app self-update checker
The app checks GitHub Releases on opening **Profile** and shows a **New** badge on
"Check for updates" when a newer version is out; tapping it opens the APK
download. `src/appVersion.ts` holds the running version (the release script keeps
it in sync). No store needed.

## Manual APK build / install

```bash
npm run build   # signed arm64 APK → android/app/build/outputs/apk/release/app-release.apk
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Or copy the APK to the phone and open it — allow "install unknown apps".

## Obtainium (auto-updates on device)

Install [Obtainium](https://github.com/ImranR98/Obtainium), add app →
`https://github.com/feyton/finxai`. It installs/updates whenever a new Release
appears. Private repo? Add a GitHub PAT with `repo` read scope in Obtainium
settings.

## CI (fallback only)
`.github/workflows/release.yml` no longer runs on tags — it's a **manual**
`workflow_dispatch` fallback (Actions tab) that uploads an arm64 APK artifact.
Use it only when you can't build locally.

### CI secrets (GitHub → repo → Settings → Secrets and variables → Actions)

| Secret | Value |
|---|---|
| `KEYSTORE_BASE64` | `base64 -w0 android/app/finxai_release.keystore` output |
| `KEYSTORE_PASSWORD` | same as local gradle.properties |
| `KEY_ALIAS` | same as local gradle.properties |
| `KEY_PASSWORD` | same as local gradle.properties |

PowerShell one-liner for the base64:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("android\app\finxai_release.keystore")) | Set-Clipboard
```

## Alternatives considered

- **Firebase App Distribution** — nice tester UX and install analytics, but requires
  adding Firebase to the project and testers installing App Tester. Worth it only
  if you start distributing to several people.
- **OTA JS updates (CodePush-style)** — CodePush itself retired with App Center.
  The modern option is [hot-updater](https://github.com/gronxb/hot-updater), which
  supports **Supabase storage** as the backend (which you already run). It ships
  JS-only changes instantly without reinstalling the APK. Native changes still
  need a new APK. Consider this once the native side stabilizes.
