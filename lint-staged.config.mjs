import path from 'node:path';

const quote = (value) => JSON.stringify(value);
const relative = (file) => path.relative(process.cwd(), file);

const formatWithNx = (files) => {
  const changedFiles = files.map(relative).join(',');
  return `pnpm nx format:write --files=${quote(changedFiles)}`;
};

export default {
  '*.{js,jsx,ts,tsx,mjs,cjs,json,css,scss,html,md,yml,yaml}': [formatWithNx],
  '*.{js,jsx,ts,tsx,mjs,cjs}': (files) => [
    `eslint --fix ${files.map(quote).join(' ')}`,
  ],
  '*.{rs,toml}': () => ['cargo fmt --all'],
};
