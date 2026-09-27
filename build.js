import { build } from 'esbuild';
import { readFile, writeFile, readdir } from 'node:fs/promises';
await build({ entryPoints: ['background.js'], bundle: true, format: 'esm', platform: 'browser', target: 'chrome120', outfile: 'dist/background.js', metafile: true });
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const notices = [];
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path || info.dev) continue;
  const files = await readdir(path);
  const license = files.find(name => /^licen[sc]e(?:[.-]|$)/i.test(name));
  const licensePath = license ? `${path}/${license}` : path === 'node_modules/@nodable/entities' ? 'licenses/nodable-entities-MIT.txt' : null;
  if (!licensePath) throw new Error(`Missing dependency license: ${path}`);
  notices.push(`${path} (${info.version})\n\n${await readFile(licensePath, 'utf8')}`);
}
await writeFile('dist/DEPENDENCY_LICENSES.txt', notices.join('\n\n--------------------\n\n'));
