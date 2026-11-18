import { lstat, mkdir, copyFile, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { RELEASE } from '../assets/installer/src/policy.mjs';
// Explicit public allowlist. Technical gates do not assert source-license resolution.
// Current release payloads are pinned below alongside the previous public versions.
const releaseContentReady = true;
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
  "releases/0.0.1/resources/atlas-v1.nfa",
  "releases/0.0.1/resources/SHA256SUMS.txt",
  "releases/0.0.1/manifest.json",
  "releases/0.0.1/SHA256SUMS.txt",
  "releases/0.0.1/FIRMWARE-NOTICES.txt",
  ".nojekyll",
  "assets/installer/src/full-policy.mjs",
  "assets/installer/src/full-installer.mjs",
  "releases/0.0.1/resources/nanoos-0.0.1-tf-resources.zip",
  "releases/0.0.1/r014e/full-manifest.json",
  "releases/0.0.1/r014e/app-manifest.json",
  "releases/0.0.1/r014e/full/bootloader.bin",
  "releases/0.0.1/r014e/full/partition-table.bin",
  "releases/0.0.1/r014e/full/ota-data.bin",
  "releases/0.0.1/r014e/full/nanoOS26_prism.bin",
  "releases/0.0.1/r014e/FIRMWARE-NOTICES.txt",
  "releases/0.0.1/r014e/SHA256SUMS.txt",
  "releases/0.0.1/r014e/NanoOS-0.0.1-Windows-x64-r014e.zip",
  "releases/0.0.1/r018/FIRMWARE-NOTICES.txt",
  "releases/0.0.1/r018/NanoOS-0.0.1-Windows-x64-r018.zip",
  "releases/0.0.1/r018/SHA256SUMS.txt",
  "releases/0.0.1/r018/TF-resources.zip",
  "releases/0.0.1/r018/app-manifest.json",
  "releases/0.0.1/r018/full/bootloader.bin",
  "releases/0.0.1/r018/full/nanoOS26_prism.bin",
  "releases/0.0.1/r018/full/ota-data.bin",
  "releases/0.0.1/r018/full/partition-table.bin",
  "releases/0.0.1/r018/full-manifest.json",
  "releases/0.0.1/r018/hardware-verification.json"
];
const exactFiles = [
  {
    "path": "index.html",
    "bytes": 7909,
    "sha256": "77f2cfa38f1ad3843e27521b2ba38009e8f38e96122b5d3dc12e9e700c3440e5"
  },
  {
    "path": "ai.html",
    "bytes": 8566,
    "sha256": "b125a64cade57c4e75ab28e456463dcd9a6680928f844e7604aab531dc2892eb"
  },
  {
    "path": "release.html",
    "bytes": 19767,
    "sha256": "f839ed6b3a69e9f5e04703e8b8cfe38f43818017081ca9be4682956e65072ac1"
  },
  {
    "path": "third-party.html",
    "bytes": 3411,
    "sha256": "2aa22d80fb3a6af62c6b0458335649e9a25a826c628960d4ba5b22612da07d1e"
  },
  {
    "path": "assets/icon.svg",
    "bytes": 371,
    "sha256": "60714e6d3da77c77e3b84e947fa3aef399f77b1673931da4753420a859e8c6cc"
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
    "path": "assets/release.css",
    "bytes": 5592,
    "sha256": "9cf45a212de04cb67f4f33b01c6a1d7d4a7dc74b3faa92201fd999b6baa04978"
  },
  {
    "path": "assets/release.js",
    "bytes": 8017,
    "sha256": "fd0db223e981932a93fd9b4f519d0b4f5e071412cf2af5eddc4c11183c342f97"
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
    "path": "assets/screen-calendar.png",
    "bytes": 10908,
    "sha256": "eae4fa563a04d6977f787d169c7ad6e5d57c0cff6f992567881e50c9fba86724"
  },
  {
    "path": "assets/installer/session.mjs",
    "bytes": 3534,
    "sha256": "5c170d6ee97f0f2db4ed6373749b37ebcfe7ca31a51f70d1cd74be15ca44f059"
  },
  {
    "path": "assets/installer/release.mjs",
    "bytes": 4210,
    "sha256": "b7650590624b45dd7122496b8021d1510652581cfabd111dd989af734eb1ddff"
  },
  {
    "path": "assets/installer/src/policy.mjs",
    "bytes": 9465,
    "sha256": "74cbf716f8aac9d4f50756c2117b638c52d6c0008b854fe33e5ad2d75da32b06"
  },
  {
    "path": "assets/installer/src/esp-adapter.mjs",
    "bytes": 8743,
    "sha256": "865b29e6f083afd462b4d3b37d99a47ea844f35b9fac9eedd8dc369a10130a94"
  },
  {
    "path": "assets/installer/src/event-transport.mjs",
    "bytes": 3972,
    "sha256": "bfae66f6e123027a4617989bd0b5f25eb573ac523824696adcb0791b421a4a6a"
  },
  {
    "path": "assets/installer/src/installer.mjs",
    "bytes": 6918,
    "sha256": "a24e87e9a80e6134c503a69a77f44ac52817063b10863af05b912b9466e52b8d"
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
    "path": "assets/installer/vendor-integrity.json",
    "bytes": 398,
    "sha256": "1da6b663fdeb090c037148a61aa2ab0bbc01c754058267f522390fba03313f2b"
  },
  {
    "path": "assets/installer/licenses/esptool-js.txt",
    "bytes": 11365,
    "sha256": "1c25f29242785d63e9adb0be7fdc137551dfbbc0756b622fcd26d9cd7de3a4f3"
  },
  {
    "path": "assets/installer/licenses/atob-lite.txt",
    "bytes": 1073,
    "sha256": "435a6722c786b0a56fbe7387028f1d9d3f3a2d0fb615bb8fee118727c3f59b7b"
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
    "path": "releases/0.0.1/nanoos-0.0.1-app0.bin",
    "bytes": 4190784,
    "sha256": "3201d1526c26ea754337a0675ea1c60a3d58570d4dbd91869b84bea56cbc60cf"
  },
  {
    "path": "releases/0.0.1/resources/atlas-v1.nfa",
    "bytes": 6771488,
    "sha256": "d95654d995826bfd03c063ab0577d7b9739614b5ace715dc555e8ea560d29d25"
  },
  {
    "path": "releases/0.0.1/resources/SHA256SUMS.txt",
    "bytes": 175,
    "sha256": "043a444503647468697bf5cac478ec651b079c36ba007134f425ac8225d40c68"
  },
  {
    "path": "releases/0.0.1/manifest.json",
    "bytes": 560,
    "sha256": "7f3aa742244ea410a15fc2a55ddf42794d8f11f2b7801bcb1f73d9ca7fff9f5f"
  },
  {
    "path": "releases/0.0.1/SHA256SUMS.txt",
    "bytes": 255,
    "sha256": "382a579e688f7142a902b63e43d96578844c1ad343ffdd47ab19c36cf8aac8bf"
  },
  {
    "path": "releases/0.0.1/FIRMWARE-NOTICES.txt",
    "bytes": 826214,
    "sha256": "11c289f75598eb326c6ea52420d5c9945ce9fefe01939733a0471235b717987e"
  },
  {
    "path": ".nojekyll",
    "bytes": 0,
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  },
  {
    "path": "assets/installer/src/full-policy.mjs",
    "bytes": 4326,
    "sha256": "f10dc6ab2a81634d3419fd51a1c52a240d31342b38f976a49f9c2c1164c91c4d"
  },
  {
    "path": "assets/installer/src/full-installer.mjs",
    "bytes": 7792,
    "sha256": "2227318d110c4b4a12cbc638cbe31fdccf2b1eff702d3e93bfe9e08f66178bd0"
  },
  {
    "path": "releases/0.0.1/resources/nanoos-0.0.1-tf-resources.zip",
    "bytes": 2867713,
    "sha256": "25cd4964b699136cf85eafe4c5ff59d12eb248e8a73d45f7d821db30a2ad463a"
  },
  {
    "path": "releases/0.0.1/r014e/full-manifest.json",
    "bytes": 1077,
    "sha256": "06f9864af0dae52cb122b866ec877b41c5a28cb91a4a577ec76ce0a7adeb9331"
  },
  {
    "path": "releases/0.0.1/r014e/app-manifest.json",
    "bytes": 628,
    "sha256": "50c2509fb8e11c012fef15970541565a962ff11f62f5113c178b56a2413032af"
  },
  {
    "path": "releases/0.0.1/r014e/full/bootloader.bin",
    "bytes": 22304,
    "sha256": "2fce714b1ed50f3e5e07ffff763617f634da977be2b6b1d676632a3bb5cba167"
  },
  {
    "path": "releases/0.0.1/r014e/full/partition-table.bin",
    "bytes": 3072,
    "sha256": "cc296c67732b24fc8fe359062e06d09b247de1abd225909b3902b5d13b1dc3df"
  },
  {
    "path": "releases/0.0.1/r014e/full/ota-data.bin",
    "bytes": 8192,
    "sha256": "7d2c7ac4888bfd75cd5f56e8d61f69595121183afc81556c876732fd3782c62f"
  },
  {
    "path": "releases/0.0.1/r014e/full/nanoOS26_prism.bin",
    "bytes": 4193808,
    "sha256": "703d2b48bab3859403c828e648e9f610d6a9a01721a368298b2371842fc7c485"
  },
  {
    "path": "releases/0.0.1/r014e/FIRMWARE-NOTICES.txt",
    "bytes": 826411,
    "sha256": "7bd64dce0a576d57c5bf176d24db598d2d6a23d4aaac0560dedf8693ed5de778"
  },
  {
    "path": "releases/0.0.1/r014e/SHA256SUMS.txt",
    "bytes": 708,
    "sha256": "4b292d40d3a636e981f128bdd274fab86802036cbe0af5c0611da83d04df1d46"
  },
  {
    "path": "releases/0.0.1/r014e/NanoOS-0.0.1-Windows-x64-r014e.zip",
    "bytes": 27611337,
    "sha256": "37e1d3304606ba61e9440ebad3c238411a6a877b205f029b1ea07a9fd5f1d6e5"
  },
  {
    "path": "releases/0.0.1/r018/FIRMWARE-NOTICES.txt",
    "bytes": 826799,
    "sha256": "8d8594ea7e5eeff0eab0759a3e19df33d20e195161dd89c3294efc66277b2fff"
  },
  {
    "path": "releases/0.0.1/r018/NanoOS-0.0.1-Windows-x64-r018.zip",
    "bytes": 42576082,
    "sha256": "0d256ff11bfb61dbaa9dd42af27865a72e6365c6fcfa45024c15b73c19a0721c"
  },
  {
    "path": "releases/0.0.1/r018/SHA256SUMS.txt",
    "bytes": 883,
    "sha256": "4c3e29f9382509e5db6b5f1f5ced27996921b0770b07c63113c846a4071134da"
  },
  {
    "path": "releases/0.0.1/r018/TF-resources.zip",
    "bytes": 17841406,
    "sha256": "90df8d527733e11adbfaa7fd0b1616a5a527a3e1dc35ebbeb2c3ecf90eda1cd2"
  },
  {
    "path": "releases/0.0.1/r018/app-manifest.json",
    "bytes": 675,
    "sha256": "541fccc1f6eec48fa7ce3502d64cb2fcb72812c520343bbe4c34bc35fcb32c16"
  },
  {
    "path": "releases/0.0.1/r018/full/bootloader.bin",
    "bytes": 22304,
    "sha256": "2fce714b1ed50f3e5e07ffff763617f634da977be2b6b1d676632a3bb5cba167"
  },
  {
    "path": "releases/0.0.1/r018/full/nanoOS26_prism.bin",
    "bytes": 4190832,
    "sha256": "0b858cc6bf7951c82a70415496498b9acb79f127f886e629923b7cbe1650daa1"
  },
  {
    "path": "releases/0.0.1/r018/full/ota-data.bin",
    "bytes": 8192,
    "sha256": "7d2c7ac4888bfd75cd5f56e8d61f69595121183afc81556c876732fd3782c62f"
  },
  {
    "path": "releases/0.0.1/r018/full/partition-table.bin",
    "bytes": 3072,
    "sha256": "cc296c67732b24fc8fe359062e06d09b247de1abd225909b3902b5d13b1dc3df"
  },
  {
    "path": "releases/0.0.1/r018/full-manifest.json",
    "bytes": 1124,
    "sha256": "31109ac3a3a591369d8e0fd628c004c0814fe3a777a8ccc87848e2b6370779c7"
  },
  {
    "path": "releases/0.0.1/r018/hardware-verification.json",
    "bytes": 527,
    "sha256": "6519627e47a28433e63fcf14a97752b03ed3fcaa157e4d483bf5640e05a6ccf0"
  }
];
if (!releaseContentReady) throw Error('Release content is not approved');
if (!RELEASE.enabled || !RELEASE.firmwareApproved || !RELEASE.hardwareVerified) throw Error('Release is not hardware-approved');
for (const mode of ['full','app']) {
  const path = `releases/0.0.1/${RELEASE.modes[mode].build}/${mode}-manifest.json`;
  const exact = exactFiles.find(item => item.path === path), binding = RELEASE.modes[mode];
  if (!exact || binding.manifestSha256 !== exact.sha256 || binding.manifestBytes !== exact.bytes || !binding.manifestUrl.endsWith('/' + path)) throw Error('Unexpected release binding: ' + mode);
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  if (manifest.hardware_verified !== true || manifest.mode !== mode || manifest.build !== binding.build) throw Error('Manifest not hardware-approved: ' + mode);
}
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
console.log(JSON.stringify({version:'0.0.1',firmware:true,install:true,publicFileCount:publicFiles.length,GPLSourceProvisionResolved:false,publicFiles}));
