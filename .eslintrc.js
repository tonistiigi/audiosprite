const OFF = 'off';

module.exports = {
  root: true,
  env: {
    node: true,
  },
  plugins: ['import'],
  extends: [
    'airbnb-base',
    'plugin:sonarjs/recommended',
  ],
  rules: {
    'no-console': OFF,
  },
  parserOptions: {
    parser: 'babel-eslint',
  },
};
