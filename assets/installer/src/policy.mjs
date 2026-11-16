export const LIMITS = Object.freeze({
  chip: 'ESP32-S31', chipId: 32, flashBytes: 0x1000000,
  appOffset: 0x10000, appBytes: 0x400000,
  tableOffset: 0x8000, tableBytes: 0x1000,
  readChunk: 0x10000, manifestBytes: 8192,
});

// No query parameter, storage entry, DOM control or caller option overrides this.
// Bound to the tested ESP32-S31 application image and original partition table.
export const RELEASE = Object.freeze({
  enabled: true,
  firmwareApproved: true,
  hardwareVerified: true,
  manifestUrl: new URL('../../../releases/0.0.1/manifest.json', import.meta.url).href,
  manifestSha256: '7f3aa742244ea410a15fc2a55ddf42794d8f11f2b7801bcb1f73d9ca7fff9f5f',
  manifestBytes: 560,
});

export function assertReleased() {
  if (!RELEASE.enabled || !RELEASE.firmwareApproved || !RELEASE.hardwareVerified ||
      !RELEASE.manifestUrl || !RELEASE.manifestSha256 || !Number.isSafeInteger(RELEASE.manifestBytes) || RELEASE.manifestBytes < 1 || RELEASE.manifestBytes > LIMITS.manifestBytes) {
    throw new Error('发布门禁关闭：固件未获准发布，S31 实机刷写尚未验证。');
  }
}

export const hex = bytes => [...bytes].map(n => n.toString(16).padStart(2, '0')).join('');
export const sha256 = async bytes => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
export const equal = (a, b) => a.length === b.length && a.every((n, i) => n === b[i]);
export function check(condition, message) { if (!condition) throw new Error(message); }
export function checkSignal(signal) { if (signal?.aborted) throw signal.reason ?? new DOMException('已取消', 'AbortError'); }

export function validateManifest(m, baseURL) {
  check(m?.schema === 1 && m.product === 'NanoOS' && m.version === '0.0.1', '发布描述格式或版本不匹配');
  check(m.target?.chip === LIMITS.chip && m.target.chipId === LIMITS.chipId && m.target.flashBytes === LIMITS.flashBytes, '目标必须是 16 MiB ESP32-S31，不能用 S3 替代');
  check(m.image?.offset === LIMITS.appOffset && m.image.partition === 'app0', '只允许写入 app0 / 0x10000');
  check(Number.isSafeInteger(m.image.bytes) && m.image.bytes >= 64 && m.image.bytes <= LIMITS.appBytes && m.image.bytes % 16 === 0, '镜像长度必须对齐且不超过原 app0 的 4 MiB');
  check(/^[a-f0-9]{64}$/.test(m.image.sha256), '缺少有效镜像 SHA-256');
  check(m.partitionTable?.offset === LIMITS.tableOffset && m.partitionTable.bytes === LIMITS.tableBytes && /^[a-f0-9]{64}$/.test(m.partitionTable.sha256), '缺少原分区表的精确校验约束');
  check(m.eraseAll === false && m.preserveOtherPartitions === true && !m.parts && !m.builds, '禁止全擦或附加写入部分');
  const base = new URL(baseURL), url = new URL(m.image.path, base);
  check(base.protocol === 'https:' && url.protocol === 'https:' && url.origin === base.origin && !url.username && !url.password && !url.hash && !url.search && typeof m.image.path === 'string', '固件只能来自同源 HTTPS 路径');
  return Object.freeze({
    version: m.version, url: url.href, bytes: m.image.bytes, sha256: m.image.sha256,
    tableSha256: m.partitionTable.sha256, offset: LIMITS.appOffset,
  });
}

export async function validateImage(bytes, plan) {
  check(bytes instanceof Uint8Array && bytes.length === plan.bytes, '下载镜像长度不匹配');
  check(await sha256(bytes) === plan.sha256, '镜像 SHA-256 不匹配');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  check(bytes[0] === 0xe9 && bytes[1] >= 1 && bytes[1] <= 16, '不是受支持的 ESP 应用镜像');
  check(v.getUint16(12, true) === LIMITS.chipId, '镜像芯片 ID 必须为 32 / ESP32-S31');
  check(bytes[23] === 1, '候选仅接受附带 SHA-256 的未签名应用镜像');
  let offset = 24, checksum = 0xef;
  for (let n = 0; n < bytes[1]; n++) {
    check(offset + 8 <= bytes.length, '镜像段头被截断');
    const size = v.getUint32(offset + 4, true); offset += 8;
    check(offset + size <= bytes.length, '镜像段越界');
    for (const byte of bytes.subarray(offset, offset + size)) checksum ^= byte;
    offset += size;
  }
  const checksumOffset = Math.ceil((offset + 1) / 16) * 16 - 1;
  check(checksumOffset + 33 === bytes.length && bytes[checksumOffset] === checksum, '镜像尾部、长度或内部校验错误');
  check(await sha256(bytes.subarray(0, checksumOffset + 1)) === hex(bytes.subarray(checksumOffset + 1)), '镜像内嵌 SHA-256 不匹配');
  return { minRevision: v.getUint16(15, true), maxRevision: v.getUint16(17, true) };
}

export async function validatePartitions(bytes, plan, md5) {
  check(bytes.length === LIMITS.tableBytes && await sha256(bytes) === plan.tableSha256, '设备分区表与获准的原分区表不一致');
  const entries = [], v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let hasDigest = false;
  for (let offset = 0; offset < 0xc00; offset += 32) {
    const magic = v.getUint16(offset, true);
    if (magic === 0xebeb) {
      check(bytes.subarray(offset + 2, offset + 16).every(b => b === 0xff), '分区 MD5 标记错误');
      check(md5(bytes.subarray(0, offset)) === hex(bytes.subarray(offset + 16, offset + 32)), '分区表内部 MD5 错误');
      check(bytes.subarray(offset + 32).every(b => b === 0xff), '分区摘要后存在非填充数据');
      hasDigest = true; break;
    }
    check(magic === 0x50aa, '分区条目损坏或缺少 MD5');
    const entry = { type: bytes[offset + 2], subtype: bytes[offset + 3], offset: v.getUint32(offset + 4, true), bytes: v.getUint32(offset + 8, true), label: new TextDecoder().decode(bytes.subarray(offset + 12, offset + 28)).replace(/\0.*$/s, ''), flags: v.getUint32(offset + 28, true) };
    check(entry.bytes > 0 && entry.offset >= 0x9000 && entry.offset % 4096 === 0 && entry.bytes % 4096 === 0 && entry.offset + entry.bytes <= LIMITS.flashBytes, '分区边界不合法');
    entries.push(entry);
  }
  check(hasDigest, '分区表没有完整的 MD5 记录');
  const sorted = [...entries].sort((a, b) => a.offset - b.offset);
  for (let i = 1; i < sorted.length; i++) check(sorted[i - 1].offset + sorted[i - 1].bytes <= sorted[i].offset, '分区重叠');
  const apps = entries.filter(e => e.label === 'app0');
  check(apps.length === 1 && apps[0].type === 0 && apps[0].subtype === 0x10 && apps[0].offset === LIMITS.appOffset && apps[0].bytes === LIMITS.appBytes && apps[0].flags === 0, 'app0 必须保留原偏移、4 MiB 容量及未加密属性');
  return entries;
}

async function downloadBytes(url, expectedBytes, signal, fetcher) {
  checkSignal(signal);
  check(Number.isSafeInteger(expectedBytes) && expectedBytes > 0 && expectedBytes <= LIMITS.appBytes, '下载大小必须有界');
  const response = await fetcher(url, { signal, redirect: 'error', credentials: 'omit', cache: 'no-store' });
  check(response.ok && response.body, '下载失败或响应没有流');
  const declared = response.headers.get('content-length');
  // Fetch exposes decoded bytes, while Content-Length describes the encoded
  // transfer when Pages/CDNs use gzip or Brotli. Bound the decoded stream below;
  // its exact size and the caller's pinned SHA-256 remain authoritative.
  const encoding = response.headers.get('content-encoding')?.trim().toLowerCase();
  const encoded = Boolean(encoding && encoding !== 'identity');
  check(encoded || declared === null || Number(declared) === expectedBytes, '下载声明长度不匹配');
  const reader = response.body.getReader(), bytes = new Uint8Array(expectedBytes);
  let offset = 0;
  try {
    while (true) {
      checkSignal(signal);
      const { value, done } = await reader.read();
      if (done) break;
      check(offset + value.length <= expectedBytes, '下载超出已批准大小');
      bytes.set(value, offset); offset += value.length;
    }
    check(offset === expectedBytes, '下载内容被截断');
    return bytes;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function boundedFetch(url, expectedBytes, signal, fetcher = fetch, timeoutMs = 30000) {
  checkSignal(signal);
  const controller = new AbortController();
  const relay = () => controller.abort(signal.reason ?? new DOMException('已取消', 'AbortError'));
  signal?.addEventListener('abort', relay, { once: true });
  let timer, onAbort;
  const deadline = new Promise((_, reject) => {
    onAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => controller.abort(new Error('下载超时；未连接设备')), timeoutMs);
  });
  try { return await Promise.race([downloadBytes(url, expectedBytes, controller.signal, fetcher), deadline]); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', relay); controller.signal.removeEventListener('abort', onAbort); }
}
