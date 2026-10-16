// Separate the local hands-free cooking test app from the App Store build.
// Production is unchanged unless APP_VARIANT=development is explicitly set.
// Keep app.json as the single canonical source for regular production values.
module.exports = ({ config }) => {
  const isDevelopment = process.env.APP_VARIANT === 'development';

  if (!isDevelopment) {
    return config;
  }

  return {
    ...config,
    name: 'Tariften DEV',
    scheme: 'tariften-dev',
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.tariften.app.dev',
    },
    android: {
      ...config.android,
      package: 'com.tariften.app.dev',
    },
    plugins: [
      ...(config.plugins || []),
      ['expo-dev-client', { addGeneratedScheme: true }],
    ],
  };
};
