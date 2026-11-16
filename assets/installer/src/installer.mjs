import { LIMITS, assertReleased, check, checkSignal, sha256, equal, validateManifest, validateImage, validatePartitions, boundedFetch } from './policy.mjs';

// This engine receives a driver explicitly for deterministic mock testing.
// The only browser-facing path to a real SerialPort is installReleased below.
export async function runCandidateInstall({ manifest, image, baseURL, makeDriver, md5, signal, onState = () => {}, timeouts = {} }) {
  const controller = new AbortController();
  const relayAbort = () => controller.abort(signal.reason ?? new DOMException('已取消', 'AbortError'));
  if (signal?.aborted) relayAbort();
  else signal?.addEventListener('abort', relayAbort, { once: true });
  const activeSignal = controller.signal;
  let driver, writeStarted = false, failure, result, cleanupError;
  const emit = (state, detail = {}) => onState({ state, writeStarted, ...detail });
  const stage = async (name, work, timeout = 20000) => {
    checkSignal(activeSignal);
    let timer, abort;
    const cancelled = new Promise((_, reject) => {
      abort = () => reject(activeSignal.reason);
      activeSignal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => controller.abort(new Error(`${name} 超时；已停止后续操作`)), timeouts[name] ?? timeout);
    });
    try {
      return await Promise.race([Promise.resolve().then(() => {
        checkSignal(activeSignal);
        emit(name);
        // Observers may cancel synchronously. Do not start work after that.
        checkSignal(activeSignal);
        return work();
      }), cancelled]);
    } finally { clearTimeout(timer); activeSignal.removeEventListener('abort', abort); }
  };
  try {
    const plan = validateManifest(manifest, baseURL);
    check(image instanceof Uint8Array, '镜像必须为字节数组');
    image = new Uint8Array(image);
    const revision = await stage('validating', () => validateImage(image, plan));
    driver = await stage('preparing-driver', () => makeDriver(activeSignal));
    const device = await stage('connecting', () => driver.connect());
    check(device.chip === LIMITS.chip && device.chipId === 32 && device.flashBytes === LIMITS.flashBytes && Number.isInteger(device.revision), '设备身份或容量不匹配');
    check(device.revision >= revision.minRevision && device.revision <= revision.maxRevision, '设备芯片修订版本不满足镜像要求');
    const before = await stage('reading-partitions', () => driver.read(0, LIMITS.appOffset));
    await validatePartitions(before.subarray(LIMITS.tableOffset, LIMITS.tableOffset + LIMITS.tableBytes), plan, md5);
    const tailStart = LIMITS.appOffset + LIMITS.appBytes;
    const tailBefore = await stage('checking-protected-regions', () => driver.digest(tailStart, LIMITS.flashBytes - tailStart), 120000);
    check(/^[a-f0-9]{32}$/.test(tailBefore), '保护尾区摘要无效');
    // Detect any change between the initial read and the actual write.
    const prewrite = await stage('rechecking-partitions', () => driver.read(0, LIMITS.appOffset));
    check(equal(before, prewrite), '写入前保护区变化，已中止');
    checkSignal(activeSignal);
    writeStarted = true;
    await stage('writing', () => driver.writeApp(image, (written, total) => emit('writing', { written, total })), 20 * 60 * 1000);
    const readback = new Uint8Array(plan.bytes);
    for (let offset = 0; offset < plan.bytes; offset += LIMITS.readChunk) {
      const length = Math.min(LIMITS.readChunk, plan.bytes - offset);
      const bytes = await stage('verifying-image', () => driver.read(LIMITS.appOffset + offset, length));
      check(bytes.length === length, '写后读回长度不匹配');
      readback.set(bytes, offset);
      emit('verifying-image', { written: offset + length, total: plan.bytes });
    }
    check(await sha256(readback) === plan.sha256, '写后整镜像 SHA-256 不匹配');
    const after = await stage('verifying-protected-regions', () => driver.read(0, LIMITS.appOffset));
    check(equal(before, after), '引导区、分区表、NVS 或 OTA 数据发生变化');
    const tailAfter = await stage('verifying-protected-regions', () => driver.digest(tailStart, LIMITS.flashBytes - tailStart), 120000);
    check(tailBefore === tailAfter, 'app0 之后的保护区发生变化');
    checkSignal(activeSignal);
    result = { version: plan.version, imageSha256: plan.sha256, partitionTableSha256: plan.tableSha256, protectedRegionsUnchanged: true, writeOffset: LIMITS.appOffset, bytes: plan.bytes, bootVerified: false };
  } catch (error) {
    failure = error;
  } finally {
    signal?.removeEventListener('abort', relayAbort);
    if (driver) {
      let timer;
      try {
        await Promise.race([driver.disconnect(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('串口清理超时；请手动断开连接')), timeouts.cleanup ?? 2500); })]);
      } catch (error) { cleanupError = error; failure ??= error; }
      finally { clearTimeout(timer); }
    }
  }
  if (failure) {
    const cancelled = failure.name === 'AbortError';
    emit(cancelled ? 'cancelled' : 'error', { message: failure.message + (cleanupError && cleanupError !== failure ? `；${cleanupError.message}` : ''), cleanupFailed: Boolean(cleanupError), recoveryNeeded: writeStarted });
    throw failure;
  }
  emit('complete', { message: 'app0 写入与校验完成；未更改启动选择，启动结果尚未验证。', result });
  return result;
}

export async function installReleased({ signal, onState, fetcher = fetch, serial = globalThis.navigator?.serial, md5 }) {
  const release = assertReleased('app'); // MUST precede every network request, import and port access.
  check(globalThis.isSecureContext && serial?.requestPort, '需要 HTTPS 与 Web Serial');
  // Future release metadata must be committed alongside an approved manifest
  // digest and bounded manifest size; there is no user-selected firmware path.
  const manifestBytes = await boundedFetch(release.manifestUrl, release.manifestBytes, signal, fetcher);
  check(await sha256(manifestBytes) === release.manifestSha256, '发布描述摘要不匹配');
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  check(manifest.mode === 'app' && manifest.build === release.build && manifest.hardware_verified === true, '该 App 安装包尚未完成实机放行');
  const plan = validateManifest(manifest, release.manifestUrl);
  const image = await boundedFetch(plan.url, plan.bytes, signal, fetcher, 120000);
  await validateImage(image, plan);
  checkSignal(signal);
  const port = await serial.requestPort();
  checkSignal(signal);
  const { createEspDriver } = await import('./esp-adapter.mjs');
  return runCandidateInstall({ manifest, image, baseURL: release.manifestUrl, signal, onState, md5, makeDriver: activeSignal => createEspDriver({ port, signal: activeSignal, md5 }) });
}
