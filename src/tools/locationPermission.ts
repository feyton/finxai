import {PermissionsAndroid, Platform} from 'react-native';

/**
 * Location permission for transaction tagging.
 *
 * Android will NOT grant background location in the same request as foreground
 * location — asking for both at once silently denies the background one. It has
 * to be a two-step flow: get foreground first, then ask for "Allow all the
 * time" as a separate request, which Android shows as a jump to system settings
 * on newer versions.
 *
 * Background access is what this feature actually needs, because the SMS
 * broadcast is delivered while the app is not in the foreground. Foreground-only
 * permission would mean a location on the rare expense that happens to arrive
 * while the app is open, and nothing otherwise — worse than not offering it.
 */
export type LocationState = 'always' | 'foreground' | 'denied' | 'unavailable';

const FINE = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
const COARSE = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
// Not present in older typings; referenced by string so the build doesn't depend
// on the RN version's permission map.
const BACKGROUND = 'android.permission.ACCESS_BACKGROUND_LOCATION' as any;

export async function getLocationState(): Promise<LocationState> {
  if (Platform.OS !== 'android') {
    return 'unavailable';
  }
  try {
    const fine = await PermissionsAndroid.check(FINE);
    const coarse = await PermissionsAndroid.check(COARSE);
    if (!fine && !coarse) {
      return 'denied';
    }
    // Below Android 10 there is no separate background permission — foreground
    // access is background access.
    if ((Platform.Version as number) < 29) {
      return 'always';
    }
    const bg = await PermissionsAndroid.check(BACKGROUND);
    return bg ? 'always' : 'foreground';
  } catch {
    return 'denied';
  }
}

/**
 * Runs the two-step request. Returns the state actually reached, which may be
 * 'foreground' if the user granted the first prompt and declined the second —
 * that is a normal outcome, not an error, and the caller should say so plainly
 * rather than nagging.
 */
export async function requestLocationAlways(): Promise<LocationState> {
  if (Platform.OS !== 'android') {
    return 'unavailable';
  }
  try {
    const first = await PermissionsAndroid.requestMultiple([FINE, COARSE]);
    const granted =
      first[FINE] === PermissionsAndroid.RESULTS.GRANTED ||
      first[COARSE] === PermissionsAndroid.RESULTS.GRANTED;
    if (!granted) {
      return 'denied';
    }
    if ((Platform.Version as number) < 29) {
      return 'always';
    }
    // Separate request, necessarily. On Android 11+ the system does not show a
    // dialog here at all — it directs the user to app settings — so the caller
    // must be prepared for this to return 'foreground' even on success-looking
    // interactions, and simply re-check later.
    const bg = await PermissionsAndroid.request(BACKGROUND);
    return bg === PermissionsAndroid.RESULTS.GRANTED ? 'always' : 'foreground';
  } catch {
    return 'denied';
  }
}
