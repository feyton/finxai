const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // Gradle's native builds churn temp dirs under android/.cxx and android/build;
    // watching them crashes Metro's fallback watcher (ENOENT) mid-build.
    // apps/web is the Next.js web app — a separate npm project; Metro must not
    // crawl its node_modules/.next or it picks up a second React copy.
    blockList: [
      /[\\/]android[\\/]\.cxx[\\/]/,
      /[\\/]android[\\/]build[\\/]/,
      /[\\/]apps[\\/]web[\\/]/,
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
