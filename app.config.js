// Separate the local hands-free cooking test app from the App Store build.
// Production is unchanged unless APP_VARIANT=development is explicitly set.
// Keep app.json as the single canonical source for regular production values.
module.exports = ({ config }) => {
  const isDevelopment = process.env.APP_VARIANT === 'development';

  if (!isDevelopment) {
    return config;
  }

  // The DEV build gets its own share-sheet entry and an ink icon, so it is
  // never mistaken for the store app when both are installed.
  const plugins = (config.plugins || []).map(plugin =>
    Array.isArray(plugin) && plugin[0] === 'expo-share-intent'
      ? [plugin[0], { ...plugin[1], iosShareExtensionName: "DEV Tariften'e Aktar" }]
      : plugin);

  return {
    ...config,
    name: 'Tariften DEV',
    scheme: 'tariften-dev',
    icon: './assets/icon-dev.png',
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.tariften.app.dev',
      icon: { ...(config.ios && config.ios.icon), light: './assets/icon-dev.png' },
    },
    android: {
      ...config.android,
      package: 'com.tariften.app.dev',
    },
    plugins: [
      ...plugins,
      ['expo-dev-client', { addGeneratedScheme: true }],
    ],
  };
};
