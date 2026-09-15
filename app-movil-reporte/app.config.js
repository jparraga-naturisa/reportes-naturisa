const ES_PRUEBA = process.env.APP_VARIANT === 'development';

module.exports = ({ config }) => {
  if (!ES_PRUEBA) return config;

  return {
    ...config,
    name: `${config.name} (Prueba)`,
    android: {
      ...config.android,
      package: `${config.android.package}.dev`,
      adaptiveIcon: {
        ...config.android.adaptiveIcon,
        backgroundColor: '#FFD9A0',
      },
    },
  };
};
