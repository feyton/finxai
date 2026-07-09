// Download the update APK and hand it straight to Android's package installer —
// no browser detour. Requires the REQUEST_INSTALL_PACKAGES permission (declared
// in AndroidManifest). The user still taps "Install" on the system dialog.

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

  const task = config({
    path,
    fileCache: true,
    overwrite: true,
    appendExt: 'apk',
  }).fetch('GET', url);

  if (onProgress) {
    task.progress({interval: 250}, (received, total) => {
      const r = parseFloat(String(received));
      const t = parseFloat(String(total));
      onProgress(t > 0 ? r / t : 0);
    });
  }

  const res = await task;
  // Launches the system installer for the downloaded APK.
  await android.actionViewIntent(
    res.path(),
    'application/vnd.android.package-archive',
  );
}
