import { LIMITS, check, sha256, validateImage, validatePartitions } from './policy.mjs';

export const FULL_BUILD = 'r018';
export const ORIGINAL_TABLE_SHA256 = '0d07801a8c51ddc2b85b1aa302c64b770d7ec471c9dabd33a80d644b5ac7b96c';
export const FULL_PARTS = Object.freeze([
  { path:'full/bootloader.bin', offset:0x2000, bytes:22304, sha256:'2fce714b1ed50f3e5e07ffff763617f634da977be2b6b1d676632a3bb5cba167', label:'引导程序' },
  { path:'full/partition-table.bin', offset:0x8000, bytes:3072, sha256:'cc296c67732b24fc8fe359062e06d09b247de1abd225909b3902b5d13b1dc3df', label:'分区表' },
  { path:'full/ota-data.bin', offset:0xe000, bytes:8192, sha256:'7d2c7ac4888bfd75cd5f56e8d61f69595121183afc81556c876732fd3782c62f', label:'启动选择' },
  { path:'full/nanoOS26_prism.bin', offset:0x10000, bytes:4190832, sha256:'0b858cc6bf7951c82a70415496498b9acb79f127f886e629923b7cbe1650daa1', label:'NanoOS App' },
].map(Object.freeze));
export const sectorBytes = bytes => Math.ceil(bytes / 4096) * 4096;

export function validateFullManifest(m, baseURL) {
  check(m?.schema === 1 && m.version === '0.0.1' && m.build === FULL_BUILD && m.mode === 'full', '完整安装清单版本或模式不匹配');
  check(m.chip === 'esp32s31' && m.flash_bytes === LIMITS.flashBytes && m.erase_all === false, '完整安装只支持 16 MiB S31，禁止全片擦除');
  check(typeof m.hardware_verified === 'boolean' && !m.image && !m.builds, '完整安装清单结构无效');
  check(m.partition_table_offset === LIMITS.tableOffset && m.partition_table_bytes === LIMITS.tableBytes && m.partition_table_sha256 === ORIGINAL_TABLE_SHA256, '完整安装的分区表约束不匹配');
  check(Array.isArray(m.parts) && m.parts.length === FULL_PARTS.length, '完整安装必须且只能包含四段');
  const base = new URL(baseURL);
  check(base.protocol === 'https:' && !base.username && !base.password && !base.search && !base.hash, '安装清单必须使用同源 HTTPS');
  const parts = FULL_PARTS.map((allowed, i) => {
    const part = m.parts[i];
    check(part && ['path','offset','bytes','sha256'].every(key => part[key] === allowed[key]), `完整安装第 ${i + 1} 段的路径、地址、大小或摘要不匹配`);
    const url = new URL(part.path, base);
    check(url.protocol === 'https:' && url.origin === base.origin && !url.username && !url.password && !url.search && !url.hash, '安装文件必须来自同源 HTTPS');
    return Object.freeze({ ...allowed, url:url.href, writeBytes:sectorBytes(allowed.bytes) });
  });
  return Object.freeze({ mode:'full', version:m.version, build:m.build, parts:Object.freeze(parts), bytes:parts.reduce((n,p)=>n+p.bytes,0), tableSha256:ORIGINAL_TABLE_SHA256 });
}

export async function validateFullPayloads(payloads, plan, md5) {
  check(Array.isArray(payloads) && payloads.length === FULL_PARTS.length, '缺少完整安装文件');
  for (let i=0;i<plan.parts.length;i++) {
    const p=plan.parts[i], bytes=payloads[i];
    check(bytes instanceof Uint8Array && bytes.length === p.bytes && await sha256(bytes) === p.sha256, `${p.label}的大小或 SHA-256 不匹配`);
  }
  const boot = await validateImage(payloads[0], plan.parts[0]);
  const app = await validateImage(payloads[3], plan.parts[3]);
  const table = new Uint8Array(LIMITS.tableBytes).fill(0xff); table.set(payloads[1]);
  await validatePartitions(table, plan, md5);
  const minRevision=Math.max(boot.minRevision,app.minRevision), maxRevision=Math.min(boot.maxRevision,app.maxRevision);
  check(minRevision<=maxRevision,'引导程序与应用的芯片修订要求不一致');
  return { minRevision,maxRevision };
}

export async function validateFullDeviceTable(bytes, plan, md5) {
  check(bytes instanceof Uint8Array && bytes.length === LIMITS.tableBytes, '设备分区表读取不完整');
  if (bytes.every(byte=>byte===0xff)) return 'blank';
  await validatePartitions(bytes, plan, md5);
  return 'original';
}

export function buildExpectedFlash(backup, payloads, plan) {
  check(backup instanceof Uint8Array && backup.length === LIMITS.flashBytes, '完整备份长度不匹配');
  const expected=backup.slice();
  for(let i=0;i<plan.parts.length;i++) {
    const part=plan.parts[i];
    expected.fill(0xff,part.offset,part.offset+part.writeBytes);
    expected.set(payloads[i],part.offset);
  }
  return expected;
}
