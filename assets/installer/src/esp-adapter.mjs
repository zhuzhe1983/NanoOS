import { LIMITS, check, checkSignal, hex } from './policy.mjs';
import { eventDrivenTransport } from './event-transport.mjs';

const READ_PACKET_BYTES = 256;
const u32 = n => { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, n, true); return bytes; };

// esptool-js 0.7.1 leaves the stub's final MD5 packet unread (#273).
// This narrow protocol adapter consumes AND checks it before another command.
// The pinned S31 stub accepts requested packets up to 4096 bytes and already
// limits outstanding packets to one. Request 256 B; retain exact length checks.
export async function readFlashVerified(loader, address, length, md5, signal) {
  checkSignal(signal);
  check(loader.IS_STUB === true, '读取要求已启动并识别的 flasher stub');
  check(Number.isSafeInteger(address) && Number.isSafeInteger(length) && address >= 0 && length > 0 && length <= LIMITS.readChunk && address + length <= LIMITS.flashBytes, '读取范围超限');
  const command = new Uint8Array(16);
  [address, length, READ_PACKET_BYTES, 1].forEach((n, i) => command.set(u32(n), i * 4));
  check(await loader.checkCommand('read flash', loader.ESP_READ_FLASH, command) === 0, '设备拒绝 Flash 读取');
  const bytes = new Uint8Array(length);
  let received = 0;
  while (received < length) {
    checkSignal(signal);
    const packet = await loader.transport.read(5000);
    check(packet instanceof Uint8Array && packet.length === Math.min(READ_PACKET_BYTES, length - received), `Flash 数据包过短、超长或失步（received=${received}, expected=${Math.min(READ_PACKET_BYTES, length - received)}, actual=${packet instanceof Uint8Array ? packet.length : 'not-Uint8Array'}）`);
    bytes.set(packet, received); received += packet.length;
    checkSignal(signal);
    await loader.transport.write(u32(received));
  }
  checkSignal(signal);
  const digest = await loader.transport.read(5000);
  checkSignal(signal);
  check(digest instanceof Uint8Array && digest.length === 16 && hex(digest) === md5(bytes), 'Flash 读取末尾 MD5 校验失败');
  return bytes;
}

export async function createEspDriver({ port, signal, md5, implementation }) {
  // The real code is only loaded by the release-gated entry point. Tests inject
  // classes, never a real SerialPort. No navigator access exists in this module.
  checkSignal(signal);
  const { ESPLoader, Transport: VendorTransport, ESPError } = implementation ?? await import('../vendor/esptool-js-0.7.1.mjs');
  const Transport = eventDrivenTransport(VendorTransport, ESPError);
  checkSignal(signal);
  const transport = new Transport(port, false);
  let opening, disconnecting, closing, ownsPort = false, connected = false, stopped = false;
  const checkActive = () => { checkSignal(signal); check(!stopped, '设备已停止'); };
  for (const name of ['write', 'setDTR', 'setRTS', 'setSignals']) {
    if (typeof transport[name] !== 'function') continue;
    const original = transport[name].bind(transport);
    transport[name] = async (...args) => { checkActive(); return original(...args); };
  }
  const originalConnect = transport.connect.bind(transport);
  transport.connect = (...args) => {
    checkActive(); check(!opening && !disconnecting, '串口正在打开或关闭');
    const attempt = Promise.resolve().then(() => {
      checkActive(); return originalConnect(...args);
    }).then(value => { ownsPort = true; return value; });
    opening = attempt;
    return attempt.then(value => { checkActive(); return value; }).finally(() => {
      if (opening === attempt) opening = undefined;
    });
  };
  const originalDisconnect = transport.disconnect.bind(transport);
  transport.disconnect = () => {
    if (disconnecting) return disconnecting;
    const attempt = Promise.resolve().then(async () => {
      // Web Serial open cannot be aborted. If it succeeds late, close the
      // owned port then; never cache an early close on a still-closed port.
      const pendingOpen = opening;
      if (pendingOpen) await pendingOpen.catch(() => {});
      if (!ownsPort) return;
      await originalDisconnect();
      ownsPort = false;
    });
    disconnecting = attempt;
    const clear = () => { if (disconnecting === attempt) disconnecting = undefined; };
    attempt.then(clear, clear);
    return attempt;
  };
  const terminal = { clean() {}, write() {}, writeLine() {} };
  const loader = new ESPLoader({ transport, baudrate: 115200, romBaudrate: 115200, serialOptions: { bufferSize: 65536 }, terminal, debugLogging: false, enableTracing: false });
  const disconnect = () => {
    stopped = true; connected = false;
    if (!closing) {
      const attempt = transport.disconnect();
      closing = attempt;
      attempt.catch(() => { if (closing === attempt) closing = undefined; });
    }
    return closing;
  };
  const onAbort = () => { disconnect().catch(() => {}); };
  signal?.addEventListener('abort', onAbort, { once: true });
  return {
    async connect() {
      checkActive();
      await loader.detectChip('default_reset');
      checkActive();
      const info = await loader.getSecurityInfo();
      check(loader.chip?.CHIP_NAME === LIMITS.chip && loader.chip?.IMAGE_CHIP_ID === LIMITS.chipId && info.chipId === LIMITS.chipId, '连接的芯片不是 ESP32-S31 / ID 32');
      check(!loader.secureDownloadMode && info.flashCryptCnt === 0 && info.parsedFlags?.SECURE_BOOT_EN === false && info.parsedFlags.SECURE_DOWNLOAD_ENABLE === false, '不支持安全启动、加密 Flash 或受限下载模式');
      const revision = await loader.chip.getChipRevision(loader);
      if (loader.chip.postConnect) await loader.chip.postConnect(loader);
      checkSignal(signal);
      await loader.runStub();
      check(loader.IS_STUB === true, 'S31 stub 未成功启动');
      const size = await loader.detectFlashSize();
      check(size === '16MB', '设备 Flash 容量不是预期的 16 MiB');
      checkSignal(signal); connected = true;
      return { chip: LIMITS.chip, chipId: LIMITS.chipId, flashBytes: LIMITS.flashBytes, revision };
    },
    async read(address, length) {
      check(connected && !closing, '设备未连接或已停止');
      return readFlashVerified(loader, address, length, md5, signal);
    },
    async digest(address, length) {
      checkSignal(signal); check(connected && !closing, '设备未连接或已停止');
      check(address === LIMITS.appOffset + LIMITS.appBytes && length === LIMITS.flashBytes - address, '仅允许对完整保护尾区计算摘要');
      const digest = await loader.flashMd5sum(address, length);
      check(/^[a-f0-9]{32}$/.test(digest), '保护区摘要格式无效');
      return digest;
    },
    async writeApp(bytes, progress) {
      checkSignal(signal); check(connected && !closing, '设备未连接或已停止');
      check(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= LIMITS.appBytes && bytes.length % 16 === 0, 'app0 写入大小超限');
      // No caller may change address, eraseAll or flash-header settings.
      await loader.writeFlash({
        fileArray: [{ data: bytes, address: LIMITS.appOffset }],
        flashMode: 'keep', flashFreq: 'keep', flashSize: 'keep',
        eraseAll: false, compress: true,
        calculateMD5Hash: md5,
        reportProgress: (_file, written, total) => { checkSignal(signal); progress?.(written, total); },
      });
      checkSignal(signal);
    },
    async disconnect() {
      signal?.removeEventListener('abort', onAbort);
      return disconnect();
    },
  };
}
