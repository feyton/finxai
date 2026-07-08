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
    blockList: [/[\\/]android[\\/]\.cxx[\\/]/, /[\\/]android[\\/]build[\\/]/],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
