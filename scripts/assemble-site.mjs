import { lstat, mkdir, copyFile, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { RELEASE } from '../assets/installer/src/policy.mjs';
// Exact tested 0.0.1 payload. Technical gates do not assert source-license resolution.
export const publicFiles = [
  "index.html",
  "ai.html",
  "release.html",
  "third-party.html",
  "assets/icon.svg",
  "assets/site.css",
  "assets/site.js",
  "assets/release.css",
  "assets/release.js",
  "assets/screen-home.png",
  "assets/screen-music.png",
  "assets/screen-reader.png",
  "assets/screen-calendar.png",
  "assets/installer/session.mjs",
  "assets/installer/release.mjs",
  "assets/installer/src/policy.mjs",
  "assets/installer/src/esp-adapter.mjs",
  "assets/installer/src/event-transport.mjs",
  "assets/installer/src/installer.mjs",
  "assets/installer/vendor/esptool-js-0.7.1.mjs",
  "assets/installer/vendor/spark-md5-3.0.2.js",
  "assets/installer/vendor-integrity.json",
  "assets/installer/licenses/esptool-js.txt",
  "assets/installer/licenses/atob-lite.txt",
  "assets/installer/licenses/pako.txt",
  "assets/installer/licenses/spark-md5.txt",
  "assets/installer/licenses/esp-flasher-stub-APACHE.txt",
  "assets/installer/licenses/esp-flasher-stub-MIT.txt",
  "releases/0.0.1/nanoos-0.0.1-app0.bin",
  "releases/0.0.1/manifest.json",
  "releases/0.0.1/SHA256SUMS.txt",
  "releases/0.0.1/FIRMWARE-NOTICES.txt",
  ".nojekyll"
];
const exactFiles = [
  {
    "path": ".nojekyll",
    "bytes": 0,
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  },
  {
    "path": "ai.html",
    "bytes": 8566,
    "sha256": "b125a64cade57c4e75ab28e456463dcd9a6680928f844e7604aab531dc2892eb"
  },
  {
    "path": "assets/icon.svg",
    "bytes": 371,
    "sha256": "60714e6d3da77c77e3b84e947fa3aef399f77b1673931da4753420a859e8c6cc"
  },
  {
    "path": "assets/installer/licenses/atob-lite.txt",
    "bytes": 1073,
    "sha256": "435a6722c786b0a56fbe7387028f1d9d3f3a2d0fb615bb8fee118727c3f59b7b"
  },
  {
    "path": "assets/installer/licenses/esp-flasher-stub-APACHE.txt",
    "bytes": 11365,
    "sha256": "d43f35ab3dc4530949ed297fbc3b2851168ad06386d037640f7f28066bfd0736"
  },
  {
    "path": "assets/installer/licenses/esp-flasher-stub-MIT.txt",
    "bytes": 1092,
    "sha256": "3494c7cc2f9ac2cf0961ee4d3182b6b509c822c2060e136f230009b54188386b"
  },
  {
    "path": "assets/installer/licenses/esptool-js.txt",
    "bytes": 11365,
    "sha256": "1c25f29242785d63e9adb0be7fdc137551dfbbc0756b622fcd26d9cd7de3a4f3"
  },
  {
    "path": "assets/installer/licenses/pako.txt",
    "bytes": 1104,
    "sha256": "a04665b3b2de56c66730c1f720f528175739e4104f79073614aa611da1e85539"
  },
  {
    "path": "assets/installer/licenses/spark-md5.txt",
    "bytes": 486,
    "sha256": "9c4214d48030b7e877ed2fd76044ea079a987c9b3f01f9b6964ba4a475a5a13d"
  },
  {
    "path": "assets/installer/release.mjs",
    "bytes": 2013,
    "sha256": "7f2008a2b9b0e6215e6225b41397dff728512b4898f694f4fbced5d849c96b08"
  },
  {
    "path": "assets/installer/session.mjs",
    "bytes": 3534,
    "sha256": "5c170d6ee97f0f2db4ed6373749b37ebcfe7ca31a51f70d1cd74be15ca44f059"
  },
  {
    "path": "assets/installer/src/esp-adapter.mjs",
    "bytes": 7521,
    "sha256": "e804dbaba581c09e995f06307c638ba5e11781d7bec7a888b9b703b8eb7f7e26"
  },
  {
    "path": "assets/installer/src/event-transport.mjs",
    "bytes": 3972,
    "sha256": "bfae66f6e123027a4617989bd0b5f25eb573ac523824696adcb0791b421a4a6a"
  },
  {
    "path": "assets/installer/src/installer.mjs",
    "bytes": 6744,
    "sha256": "cd9a29be8338f933b3cd41beaee0911fe620f10b37313292ef671d2c13f27d0f"
  },
  {
    "path": "assets/installer/src/policy.mjs",
    "bytes": 8856,
    "sha256": "2d749a48102ce2075b18a358669dbffb37e58ac448c57b8d9a6248b87f64eb7b"
  },
  {
    "path": "assets/installer/vendor-integrity.json",
    "bytes": 398,
    "sha256": "1da6b663fdeb090c037148a61aa2ab0bbc01c754058267f522390fba03313f2b"
  },
  {
    "path": "assets/installer/vendor/esptool-js-0.7.1.mjs",
    "bytes": 315949,
    "sha256": "d6a4b0b7c9b747a7370cfa976164a962f56332d5faa7c3b45cdb95a2a8b1d456"
  },
  {
    "path": "assets/installer/vendor/spark-md5-3.0.2.js",
    "bytes": 10166,
    "sha256": "d80e84c820cc5587a0ba3c8a20652099ea3fa7fc43944e812e56d449c1d9f1c9"
  },
  {
    "path": "assets/release.css",
    "bytes": 4511,
    "sha256": "38b6a03212ff163c663badeeb434768f82c106621bb0267032d781a3b0096788"
  },
  {
    "path": "assets/release.js",
    "bytes": 4066,
    "sha256": "f78b422e8a939884a663ccdb5df5903a6706c50cf7756b1633bc3a2c829c3bcb"
  },
  {
    "path": "assets/screen-calendar.png",
    "bytes": 10908,
    "sha256": "eae4fa563a04d6977f787d169c7ad6e5d57c0cff6f992567881e50c9fba86724"
  },
  {
    "path": "assets/screen-home.png",
    "bytes": 164066,
    "sha256": "bed16547942a67ce0038f3becd1e2641a3dae90a7d1f1be0b0823e34951e338b"
  },
  {
    "path": "assets/screen-music.png",
    "bytes": 44246,
    "sha256": "35caab6fbb32c1a5a0885a6a8a490ef90fee5a022b8374d0ef9d7302d35dbcf7"
  },
  {
    "path": "assets/screen-reader.png",
    "bytes": 11789,
    "sha256": "3b71d958501a974714607fa7e76bc8c916e48850a546f7547e5117ba4cb9c008"
  },
  {
    "path": "assets/site.css",
    "bytes": 19246,
    "sha256": "a91b93aa9c9ec1e0295c172d95e7865c43df0f10bd3854ab729b4977dcef4ff7"
  },
  {
    "path": "assets/site.js",
    "bytes": 1969,
    "sha256": "acc535e08d1b6b4f3cd1319d0e3ecac5e2bfc509283536ceda6501246486b2d2"
  },
  {
    "path": "index.html",
    "bytes": 7766,
    "sha256": "f6209203e919b8a1ddf9907819edc5ccc2e927ccf7c7239f7236802e0c26028e"
  },
  {
    "path": "release.html",
    "bytes": 10407,
    "sha256": "a9d4394a6469653ca2b8f23171b0cad1d8d9d37f5ebe9df3be12f5b0fbcf4497"
  },
  {
    "path": "releases/0.0.1/FIRMWARE-NOTICES.txt",
    "bytes": 826214,
    "sha256": "11c289f75598eb326c6ea52420d5c9945ce9fefe01939733a0471235b717987e"
  },
  {
    "path": "releases/0.0.1/SHA256SUMS.txt",
    "bytes": 255,
    "sha256": "382a579e688f7142a902b63e43d96578844c1ad343ffdd47ab19c36cf8aac8bf"
  },
  {
    "path": "releases/0.0.1/manifest.json",
    "bytes": 560,
    "sha256": "7f3aa742244ea410a15fc2a55ddf42794d8f11f2b7801bcb1f73d9ca7fff9f5f"
  },
  {
    "path": "releases/0.0.1/nanoos-0.0.1-app0.bin",
    "bytes": 4190784,
    "sha256": "3201d1526c26ea754337a0675ea1c60a3d58570d4dbd91869b84bea56cbc60cf"
  },
  {
    "path": "third-party.html",
    "bytes": 3055,
    "sha256": "abaa02a1aff169cf19d5d097e4db751151f1ce3915fa6ad4273170ab986ed9b6"
  }
];
if (!RELEASE.enabled || !RELEASE.firmwareApproved || !RELEASE.hardwareVerified ||
    RELEASE.manifestSha256 !== '7f3aa742244ea410a15fc2a55ddf42794d8f11f2b7801bcb1f73d9ca7fff9f5f' || RELEASE.manifestBytes !== 560 ||
    !RELEASE.manifestUrl.endsWith('/releases/0.0.1/manifest.json')) throw Error('Unexpected release binding');
for (const item of exactFiles) {
  const bits=item.path.split('/');
  for (let i=1;i<=bits.length;i++) if ((await lstat(bits.slice(0,i).join('/'))).isSymbolicLink()) throw Error(`No public symlinks: ${item.path}`);
  if (!(await lstat(item.path)).isFile()) throw Error(`Not a file: ${item.path}`);
  const bytes=await readFile(item.path);
  if(bytes.length!==item.bytes || createHash('sha256').update(bytes).digest('hex')!==item.sha256) throw Error(`Unexpected public file: ${item.path}`);
}
try { if ((await lstat('_site')).isSymbolicLink()) throw Error('Refusing symlink output'); } catch(e) { if(e.code!=='ENOENT') throw e; }
await rm('_site',{recursive:true,force:true});
for(const file of publicFiles){const output=`_site/${file}`;await mkdir(output.slice(0,output.lastIndexOf('/')),{recursive:true});await copyFile(file,output);}
console.log(JSON.stringify({version:'0.0.1',firmware:true,install:true,publicFileCount:33,GPLSourceProvisionResolved:false,publicFiles}));
