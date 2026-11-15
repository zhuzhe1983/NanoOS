import { lstat, mkdir, copyFile, rm, writeFile } from 'node:fs/promises';
import { RELEASE } from '../assets/installer/src/policy.mjs';
// This preparation build intentionally cannot publish firmware or enable install.
if (RELEASE.enabled || RELEASE.firmwareApproved || RELEASE.hardwareVerified || RELEASE.manifestUrl !== null || RELEASE.manifestSha256 !== null || RELEASE.manifestBytes !== null) throw new Error('Release preparation must keep every firmware gate closed');
export const publicFiles = [
  'index.html', 'ai.html', 'release.html', 'third-party.html',
  'assets/icon.svg', 'assets/site.css', 'assets/site.js', 'assets/flash-policy.mjs',
  'assets/release.css', 'assets/release.js',
  'assets/screen-home.png', 'assets/screen-music.png', 'assets/screen-reader.png', 'assets/screen-calendar.png',
  'assets/installer/session.mjs', 'assets/installer/release.mjs',
  'assets/installer/src/policy.mjs', 'assets/installer/src/esp-adapter.mjs', 'assets/installer/src/installer.mjs',
  'assets/installer/vendor/esptool-js-0.7.1.mjs', 'assets/installer/vendor/spark-md5-3.0.2.js',
  'assets/installer/vendor-integrity.json',
  'assets/installer/licenses/esptool-js.txt', 'assets/installer/licenses/atob-lite.txt',
  'assets/installer/licenses/pako.txt', 'assets/installer/licenses/spark-md5.txt',
  'assets/installer/licenses/esp-flasher-stub-APACHE.txt', 'assets/installer/licenses/esp-flasher-stub-MIT.txt',
];
for (const file of publicFiles) {
  const bits = file.split('/');
  for (let i = 1; i <= bits.length; i++) if ((await lstat(bits.slice(0,i).join('/'))).isSymbolicLink()) throw new Error(`No public symlinks: ${file}`);
  if (!(await lstat(file)).isFile()) throw new Error(`Not a file: ${file}`);
}
try { if ((await lstat('_site')).isSymbolicLink()) throw new Error('Refusing symlink output'); } catch (error) { if(error.code !== 'ENOENT') throw error; }
await rm('_site', { recursive:true, force:true });
for (const file of publicFiles) {
  const output = `_site/${file}`;
  await mkdir(output.slice(0, output.lastIndexOf('/')), { recursive:true });
  await copyFile(file, output);
}
await writeFile('_site/.nojekyll', '');
console.log(JSON.stringify({ mode:'release-preparation', firmware:false, install:false, publicFiles }));
