import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

/**
 * Android install-permission helpers and the APK download for the in-app updater.
 *
 * The download deliberately does NOT go through react-native-blob-util. Its
 * download-to-file path is broken: ReactNativeBlobUtilFileResp's
 * ProgressReportingSource writes each chunk to the output file but never into
 * the Okio sink it was asked to fill, so the drain loop in
 * ReactNativeBlobUtilReq sees an empty buffer and stops after one 8 KB read.
 * isDownloadComplete() then compares 8192 against Content-Length and fails —
 * which is why every single in-app update attempt died with
 * "Download interrupted." regardless of URL, size or timeout.
 *
 * Android's DownloadManager is also a better fit than any JS HTTP client here:
 * it resumes across connection drops, retries on its own, and survives the app
 * being backgrounded mid-download — all of which matter for a ~50 MB APK on a
 * mobile connection.
 */
export interface Spec extends TurboModule {
  /** Whether the user has granted "install unknown apps" for FinXAI. */
  canInstallPackages(): boolean;
  /** Opens the system screen where that permission is granted. */
  openInstallPermissionSettings(): void;

  /** Enqueue an APK download. Resolves to the DownloadManager id. */
  startDownload(url: string, fileName: string): Promise<number>;
  /**
   * Poll a download. `status` is one of pending | running | paused | success |
   * failed. On success `uri` is a content:// URI the installer can read.
   */
  getDownloadStatus(id: number): Promise<{
    status: string;
    bytesDownloaded: number;
    bytesTotal: number;
    uri?: string;
    reason?: string;
  }>;
  /** Cancel and delete a download (used to clear a stale or partial attempt). */
  cancelDownload(id: number): void;
  /** Lowercase hex sha256 of the content at a content:// URI. */
  sha256OfUri(uri: string): Promise<string>;
  /** Hand the downloaded APK to Android's package installer. */
  installFromUri(uri: string): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('AppUpdate');
