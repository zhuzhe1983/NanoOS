import { RELEASE, assertReleased, check, checkSignal, sha256, validateManifest, validateImage, boundedFetch } from './src/policy.mjs';
import { runCandidateInstall } from './src/installer.mjs';
import { createEspDriver } from './src/esp-adapter.mjs';
import { createPreparedSession } from './session.mjs';

function authorize() {
  assertReleased();
  check(globalThis.isSecureContext && globalThis.navigator?.serial?.requestPort, '需要 HTTPS 与支持 Web Serial 的桌面浏览器');
}

// No DOM, URL, localStorage or call parameter can replace release metadata.
export const releaseSession = createPreparedSession({
  authorize,
  async load({ signal, onState = () => {} }) {
    onState({ state: 'downloading' }); checkSignal(signal);
    const bytes = await boundedFetch(RELEASE.manifestUrl, RELEASE.manifestBytes, signal);
    check(await sha256(bytes) === RELEASE.manifestSha256, '发布描述摘要不匹配');
    const manifest = JSON.parse(new TextDecoder().decode(bytes));
    const plan = validateManifest(manifest, RELEASE.manifestUrl);
    const image = await boundedFetch(plan.url, plan.bytes, signal, fetch, 120000);
    await validateImage(image, plan); checkSignal(signal);
    // Load dependencies during preparation, before the connect-button click.
    await import('./vendor/spark-md5-3.0.2.js');
    await import('./vendor/esptool-js-0.7.1.mjs');
    checkSignal(signal);
    return { manifest, plan, image };
  },
  select: () => navigator.serial.requestPort(),
  install: ({ value, port, signal, onState }) => runCandidateInstall({
    manifest: value.manifest, image: value.image, baseURL: RELEASE.manifestUrl, signal, onState,
    md5: bytes => globalThis.SparkMD5.ArrayBuffer.hash(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    makeDriver: activeSignal => createEspDriver({ port, signal: activeSignal,
      md5: bytes => globalThis.SparkMD5.ArrayBuffer.hash(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) }),
  }),
});
