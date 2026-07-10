// Download the update APK and hand it straight to Android's package installer —
// no browser detour. Requires the REQUEST_INSTALL_PACKAGES permission (declared
// in AndroidManifest). The user still taps "Install" on the system dialog.
//
// Every step validates and throws with a specific message — callers surface
// the error and offer the browser as an EXPLICIT choice, never silently.

import {Linking, Platform} from 'react-native';
import RNBlobUtil from 'react-native-blob-util';

export async function downloadAndInstall(
  url: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  if (Platform.OS !== 'android') {
    await Linking.openURL(url);
    return;
  }

  const {config, fs, android} = RNBlobUtil;
  const path = `${fs.dirs.CacheDir}/finxai-update.apk`;

  // A stale half-download from a previous attempt would confuse the installer.
  await fs.unlink(path).catch(() => {});

  const task = config({path, overwrite: true, timeout: 120000}).fetch('GET', url);

  if (onProgress) {
    task.progress({interval: 250}, (received, total) => {
      const r = parseFloat(String(received));
      const t = parseFloat(String(total));
      onProgress(t > 0 ? Math.min(1, r / t) : 0);
    });
  }

  const res = await task;
  const status = res.info().status;
  if (status !== 200) {
    throw new Error(`Download failed (HTTP ${status})`);
  }

  // Sanity-check we actually got an APK, not an error page: our builds are
  // ~48 MB — anything under 5 MB is not the release asset.
  const stat = await fs.stat(res.path());
  if (!stat?.size || Number(stat.size) < 5 * 1024 * 1024) {
    await fs.unlink(res.path()).catch(() => {});
    throw new Error('Downloaded file is not a valid APK (too small)');
  }

  onProgress?.(1);

  // Launches the system installer via the library's FileProvider. If Android
  // blocks it (e.g. "Install unknown apps" not granted for FinXAI), surface
  // that instead of dying silently after a completed download.
  try {
    await android.actionViewIntent(
      res.path(),
      'application/vnd.android.package-archive',
    );
  } catch (e: any) {
    throw new Error(
      'Downloaded, but the installer could not open. Allow "Install unknown apps" for FinXAI in Settings, then try again.' +
        (e?.message ? `\n(${e.message})` : ''),
    );
  }
}
