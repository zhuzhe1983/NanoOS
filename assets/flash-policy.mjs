// Release data is intentionally inert. Never infer S31 support from ESP32-S3.
// A future adapter must verify the exact chip and original partition table,
// preserve every region outside app0, and verify the completed write.
export const RELEASE = Object.freeze({
  version: '0.0.1',
  chipFamily: 'ESP32-S31',
  firmwareApproved: false,
  hardwareVerified: false,
  manifestUrl: null,
  adapter: null,
  writePolicy: Object.freeze({
    partition: 'app0',
    offset: 0x10000,
    maxBytes: 0x400000,
    eraseAll: false,
    preserveOtherPartitions: true,
    requirePartitionReadback: true,
    requireWriteVerification: true,
  }),
});

// This checks capability only; it never enumerates or requests serial ports.
export function getFlashStatus(environment = {}) {
  const blockers = [];
  if (!RELEASE.firmwareApproved || !RELEASE.manifestUrl) blockers.push('firmware-unreleased');
  if (!RELEASE.hardwareVerified || !RELEASE.adapter) blockers.push('s31-unverified');
  if (!environment.secureContext) blockers.push('secure-context-required');
  if (!environment.webSerial) blockers.push('web-serial-unavailable');
  return Object.freeze({ ready: blockers.length === 0, blockers: Object.freeze(blockers) });
}

// Fail closed for callers, including any future install-button integration.
export function requireVerifiedRelease(environment) {
  const status = getFlashStatus(environment);
  if (!status.ready) throw new Error(`Installation unavailable: ${status.blockers.join(', ')}`);
  return RELEASE;
}
