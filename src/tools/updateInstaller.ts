// Download the update APK and hand it straight to Android's package installer —
// no browser detour. Requires the REQUEST_INSTALL_PACKAGES permission (declared
// in AndroidManifest) plus the user's per-app "Install unknown apps" grant. The
// user still taps "Install" on the system dialog; nothing installs silently.
//
// The download runs through the native AppUpdate module (Android's
// DownloadManager), NOT react-native-blob-util — blob-util's download-to-file
// path never completes, see src/native/NativeAppUpdate.ts for the detail.
//
// Every step throws an UpdateError carrying a specific code, because
// "permission not granted" is common and fixable by the user while the rest are
// rare — one generic message would make them indistinguishable.

import {Linking, Platform} from 'react-native';
import NativeAppUpdate from '../native/NativeAppUpdate';
import type {UpdateInfo} from './updateChecker';

export type UpdateErrorCode = 'permission' | 'download' | 'corrupt';

export class UpdateError extends Error {
  code: UpdateErrorCode;
  constructor(code: UpdateErrorCode, message: string) {
    super(message);
    this.name = 'UpdateError';
    this.code = code;
  }
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Opens the system screen where "Install unknown apps" is granted. */
export function openInstallPermissionSettings(): void {
  if (Platform.OS === 'android') {
    NativeAppUpdate.openInstallPermissionSettings();
  }
}

export async function downloadAndInstall(
  info: UpdateInfo,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const url = info.url;
  if (!url) {
    throw new UpdateError('download', 'No download URL for this release.');
  }

  if (Platform.OS !== 'android') {
    await Linking.openURL(url);
    return;
  }

  // Checked BEFORE the download, not after: finding out the permission is
  // missing once 50 MB has been spent wastes a user's data bundle for nothing.
  if (!NativeAppUpdate.canInstallPackages()) {
    throw new UpdateError(
      'permission',
      'FinXAI needs permission to install apps. Allow "Install unknown apps" for FinXAI, then try again.',
    );
  }

  // A stale download from a previous attempt would otherwise linger in the
  // notification shade and waste the user's storage.
  const fileName = `finxai-${info.latest}.apk`;
  let id: number;
  try {
    id = await NativeAppUpdate.startDownload(url, fileName);
  } catch (e: any) {
    throw new UpdateError('download', e?.message ?? 'Could not start the download.');
  }

  // Poll DownloadManager rather than subscribing to its broadcast: polling is a
  // few cheap queries a second, and it keeps all the state in this one function
  // instead of spreading it across a receiver and an event listener.
  let uri: string | undefined;
  for (;;) {
    await sleep(500);

    let s;
    try {
      s = await NativeAppUpdate.getDownloadStatus(id);
    } catch (e: any) {
      NativeAppUpdate.cancelDownload(id);
      throw new UpdateError('download', e?.message ?? 'Lost track of the download.');
    }

    if (s.bytesTotal > 0) {
      onProgress?.(Math.min(1, s.bytesDownloaded / s.bytesTotal));
    }

    if (s.status === 'success') {
      uri = s.uri;
      break;
    }
    if (s.status === 'failed') {
      NativeAppUpdate.cancelDownload(id);
      throw new UpdateError(
        'download',
        `Download failed after ${s.bytesDownloaded} bytes (${s.reason ?? 'unknown'}).`,
      );
    }
    // pending / running / paused — DownloadManager retries and resumes on its
    // own across connection drops, so there is nothing to do but keep waiting.
  }

  if (!uri) {
    NativeAppUpdate.cancelDownload(id);
    throw new UpdateError('download', 'The download finished but produced no file.');
  }

  // The hash is authoritative when GitHub published one. The old code only
  // checked the file was bigger than 5 MB, which let a truncated or tampered
  // download reach the installer and fail there with an unactionable message.
  if (info.sha256) {
    let hash: string;
    try {
      hash = (await NativeAppUpdate.sha256OfUri(uri)).toLowerCase();
    } catch (e: any) {
      NativeAppUpdate.cancelDownload(id);
      throw new UpdateError('corrupt', e?.message ?? 'Could not verify the download.');
    }
    if (hash !== info.sha256) {
      NativeAppUpdate.cancelDownload(id); // also deletes the file
      throw new UpdateError(
        'corrupt',
        'The downloaded file does not match the published release. Nothing was installed.',
      );
    }
  }

  onProgress?.(1);

  try {
    await NativeAppUpdate.installFromUri(uri);
  } catch (e: any) {
    // Almost always the install permission being revoked between the pre-check
    // and here, so point at the same fix.
    throw new UpdateError(
      'permission',
      'Downloaded, but the installer could not open. Allow "Install unknown apps" for FinXAI, then try again.' +
        (e?.message ? `\n(${e.message})` : ''),
    );
  }
}
