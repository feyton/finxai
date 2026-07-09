// In-app self-update checker. Compares the running app version against the
// latest GitHub Release and points at the APK asset so the user can side-load
// the update without waiting on the store / Obtainium.

import {APP_VERSION} from '../appVersion';

const REPO = 'feyton/finxai';

export interface UpdateInfo {
  available: boolean;
  current: string;
  latest: string;
  url?: string; // APK download URL (or release page as fallback)
  notes?: string;
}

// semver-ish compare; returns >0 if a > b. Tolerates a leading "v".
function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) {
      return (pa[i] || 0) - (pb[i] || 0);
    }
  }
  return 0;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    {headers: {Accept: 'application/vnd.github+json'}},
  );
  if (!res.ok) {
    throw new Error(`GitHub responded ${res.status}`);
  }
  const data = await res.json();
  const latest = String(data.tag_name ?? '').replace(/^v/, '');
  const apk = (data.assets ?? []).find((a: any) =>
    String(a.name ?? '').toLowerCase().endsWith('.apk'),
  );
  return {
    available: !!latest && compareVersions(latest, APP_VERSION) > 0,
    current: APP_VERSION,
    latest: latest || APP_VERSION,
    url: apk?.browser_download_url ?? data.html_url,
    notes: data.body,
  };
}
