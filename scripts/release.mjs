#!/usr/bin/env node
/**
 * Local release: bump version → build a signed arm64 APK → publish a GitHub
 * Release with the APK attached. Much faster than CI and produces a ~40MB
 * single-ABI APK instead of the ~130MB universal build.
 *
 *   node scripts/release.mjs            # interactive: asks major/minor/patch
 *   node scripts/release.mjs minor      # non-interactive
 *
 * Requirements: gh CLI authenticated, signing creds in ~/.gradle/gradle.properties.
 */
import {execSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import {readFileSync, writeFileSync} from 'node:fs';
import {stdin, stdout} from 'node:process';

const GRADLE = 'android/app/build.gradle';
const VERSION_TS = 'src/appVersion.ts';
const REPO_APK = 'android/app/build/outputs/apk/release/app-release.apk';

const run = (cmd, opts = {}) =>
  execSync(cmd, {stdio: 'inherit', ...opts});
const capture = cmd => execSync(cmd, {encoding: 'utf8'}).trim();

function readVersion() {
  const g = readFileSync(GRADLE, 'utf8');
  const code = parseInt(/versionCode\s+(\d+)/.exec(g)[1], 10);
  const name = /versionName\s+"([^"]+)"/.exec(g)[1];
  const [maj = 0, min = 0, patch = 0] = name.split('.').map(n => parseInt(n, 10) || 0);
  return {code, name, maj, min, patch};
}

function bump(v, kind) {
  if (kind === 'major') {return `${v.maj + 1}.0.0`;}
  if (kind === 'patch') {return `${v.maj}.${v.min}.${v.patch + 1}`;}
  return `${v.maj}.${v.min + 1}.0`; // minor (default)
}

async function main() {
  // Guard: clean working tree
  const dirty = capture('git status --porcelain');
  if (dirty) {
    console.error('✗ Working tree is not clean. Commit or stash first.');
    process.exit(1);
  }

  const v = readVersion();
  let kind = process.argv[2];
  if (!['major', 'minor', 'patch'].includes(kind)) {
    const rl = createInterface({input: stdin, output: stdout});
    const ans = (
      await rl.question(
        `Current v${v.name} (code ${v.code}). Bump [major / minor / patch] (default minor): `,
      )
    ).trim().toLowerCase();
    rl.close();
    kind = ans.startsWith('maj') ? 'major' : ans.startsWith('pat') ? 'patch' : 'minor';
  }

  const newName = bump(v, kind);
  const newCode = v.code + 1;
  const tag = `v${newName}`;
  console.log(`\n→ ${kind} bump: v${v.name} → ${tag} (code ${newCode})\n`);

  // 1. Write version into gradle + appVersion.ts
  let g = readFileSync(GRADLE, 'utf8');
  g = g.replace(/versionCode\s+\d+/, `versionCode ${newCode}`);
  g = g.replace(/versionName\s+"[^"]+"/, `versionName "${newName}"`);
  writeFileSync(GRADLE, g);
  writeFileSync(
    VERSION_TS,
    readFileSync(VERSION_TS, 'utf8').replace(/APP_VERSION = '[^']+'/, `APP_VERSION = '${newName}'`),
  );

  // 2. Commit + tag
  run('git add android/app/build.gradle src/appVersion.ts');
  run(`git commit -m "chore: release ${tag}"`);
  run(`git tag ${tag}`);

  // 3. Build signed arm64 APK (single ABI = ~40MB, not the ~130MB universal)
  console.log('\n→ Building signed arm64 APK…\n');
  run('gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a --console=plain', {
    cwd: 'android',
  });

  // 4. Publish GitHub Release with the APK
  const asset = `finxai-${tag}.apk`;
  run(`cp ${REPO_APK} ${asset}`, {shell: 'bash'});
  run('git push origin main');
  run(`gh release create ${tag} ${asset} --title ${tag} --generate-notes --target main`);
  run(`rm -f ${asset}`, {shell: 'bash'});

  const sizeMb = (readFileSync(REPO_APK).length / (1024 * 1024)).toFixed(1);
  console.log(`\n✓ Released ${tag} — ${asset} (${sizeMb} MB) is live on GitHub Releases.`);
  console.log('  Obtainium / the in-app updater will pick it up shortly.');
}

main().catch(e => {
  console.error('\n✗ Release failed:', e.message);
  process.exit(1);
});
