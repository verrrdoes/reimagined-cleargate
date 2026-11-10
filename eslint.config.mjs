import next from 'eslint-config-next';

const config = [
  { ignores: ['.next/**', 'generated/**', '.claude/**', '.taste-skill/**', 'node_modules/**'] },
  ...next,
];

export default config;
