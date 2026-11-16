import { RELEASE, assertReleased } from './installer/src/policy.mjs';
import { releaseSession } from './installer/release.mjs';
const prepare = document.getElementById('prepare-firmware');
const install = document.getElementById('connect-install');
const cancel = document.getElementById('cancel-install');
const status = document.getElementById('release-state');
const detail = document.getElementById('release-detail');
let controller;
const labels = {
  downloading: '正在下载并校验固件', validating: '正在校验镜像', 'preparing-driver': '正在准备连接',
  connecting: '正在识别 ESP32-S31', 'reading-partitions': '正在核对原分区表',
  'checking-protected-regions': '正在记录保护区摘要', 'rechecking-partitions': '写入前再次核对保护区',
  writing: '正在写入 app0，请保持连接', 'verifying-image': '正在完整读回校验',
  'verifying-protected-regions': '正在核对其他分区', complete: '写入与读回完成', cancelled: '已取消', error: '操作未完成',
};
function onState(event) {
  status.textContent = labels[event.state] ?? '正在处理';
  if (event.total) detail.textContent = `${Math.floor(event.written / event.total * 100)}%`;
  else if (event.message) detail.textContent = event.message;
  if (event.recoveryNeeded) detail.textContent += ' app0 可能尚未完整写入；请按获准的恢复步骤处理，不要直接重试。';
}
let ready = false;
try { assertReleased(); ready = window.isSecureContext && Boolean(navigator.serial?.requestPort); } catch {}
prepare.disabled = !ready;
// The firmware URL is never emitted into a download link before release.
if (!RELEASE.enabled) {
  status.textContent = '测试与发布准备中';
  detail.textContent = '固件尚未开放下载；此页不会请求串口权限。';
} else if (!ready) detail.textContent = '请在 HTTPS 页面使用支持 Web Serial 的桌面浏览器。';
else { status.textContent = '固件可准备'; detail.textContent = '先下载并校验固件；完成后再次点击连接设备。'; }
prepare.addEventListener('click', async () => {
  controller = new AbortController(); prepare.disabled = true; install.disabled = true; cancel.disabled = false;
  try {
    const result = await releaseSession.prepare({ signal: controller.signal, onState });
    status.textContent = '固件已校验，等待连接';
    detail.textContent = `${result.bytes.toLocaleString()} 字节 · SHA-256 ${result.sha256}`;
    install.disabled = false;
  } catch (error) { status.textContent = error.name === 'AbortError' ? '已取消' : '准备失败'; detail.textContent = error.message; }
  finally { prepare.disabled = !ready; cancel.disabled = true; }
});
install.addEventListener('click', () => {
  controller = new AbortController(); prepare.disabled = true; install.disabled = true; cancel.disabled = false;
  status.textContent = '请选择目标设备';
  detail.textContent = '只写入现有 app0；完成后仍需确认设备正常启动。';
  try {
    const pending = releaseSession.install({ signal: controller.signal, onState });
    pending.catch(error => {
      if (!['操作未完成', '已取消'].includes(status.textContent)) {
        status.textContent = '安装未完成'; detail.textContent = error.message;
      }
    }).finally(() => { prepare.disabled = !ready; cancel.disabled = true; });
  } catch (error) { status.textContent = '安装未开始'; detail.textContent = error.message; prepare.disabled = !ready; cancel.disabled = true; }
});
cancel.addEventListener('click', () => {
  controller?.abort(new DOMException('已取消', 'AbortError')); releaseSession.discard();
  // Web Serial has no API to dismiss its native chooser. Cancellation still
  // prevents opening a port selected later; the user may dismiss the chooser.
  detail.textContent = '正在停止；若设备选择窗口仍打开，请取消选择。已写入的内容无法撤销。';
  cancel.disabled = true;
});
window.addEventListener('pagehide', () => { controller?.abort(); releaseSession.discard(); });
