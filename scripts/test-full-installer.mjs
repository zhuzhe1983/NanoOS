import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {LIMITS,RELEASE,sha256,validateManifest,validateImage} from '../assets/installer/src/policy.mjs';
import {FULL_PARTS,validateFullManifest,validateFullPayloads,buildExpectedFlash} from '../assets/installer/src/full-policy.mjs';
import {runCandidateFullInstall,saveBackupToFile} from '../assets/installer/src/full-installer.mjs';
import {runCandidateInstall} from '../assets/installer/src/installer.mjs';
import {createEspDriver} from '../assets/installer/src/esp-adapter.mjs';
import {releaseSessions} from '../assets/installer/release.mjs';
const baseURL='https://nanoos.test/releases/0.0.1/r014e/full-manifest.json';
const manifest=JSON.parse(await readFile(new URL('../releases/0.0.1/r014e/full-manifest.json',import.meta.url)));
const appManifest=JSON.parse(await readFile(new URL('../releases/0.0.1/r014e/app-manifest.json',import.meta.url)));
const payloads=await Promise.all(manifest.parts.map(async p=>new Uint8Array(await readFile(new URL('../releases/0.0.1/r014e/'+p.path,import.meta.url)))));
const plan=validateFullManifest(manifest,baseURL);
const md5=b=>createHash('md5').update(b).digest('hex');
const table=new Uint8Array(4096).fill(0xff);table.set(payloads[1]);
function fileHandle({badRead=false,failClose=false}={}){
  let stored,closed=false,aborted=false;
  return {kind:'file',name:'local-backup.bin',get stored(){return stored;},get closed(){return closed;},get aborted(){return aborted;},
    async createWritable(){return {async write(b){stored=b.slice();},async close(){if(failClose)throw Error('disk full');closed=true;},async abort(){aborted=true;}};},
    async getFile(){const value=stored.slice();if(badRead)value[100]^=1;return {size:value.length,async arrayBuffer(){return value.buffer;}};}};
}
function fixture(options={}){
  const memory=new Uint8Array(LIMITS.flashBytes).fill(0xa5);memory.set(options.blank?new Uint8Array(4096).fill(0xff):table,0x8000);
  if(options.badTable)memory[0x8000]^=1;
  const before=memory.slice(),writes=[],events=[];let disconnects=0,digests=0,connected=0;
  const handle=fileHandle(options);
  const driver={async connect(){connected++;return {chip:'ESP32-S31',chipId:32,flashBytes:LIMITS.flashBytes,revision:0};},
    async read(offset,length){if(options.readFailure&&offset===0x30000)throw Error('read failed');return memory.slice(offset,offset+length);},
    async digestFull(){digests++;if(options.prewriteChange&&digests===3)memory[0x9000]^=1;return md5(memory);},
    async digest(offset,length){return md5(memory.subarray(offset,offset+length));},
    async writeFullPart(offset,bytes,progress){assert.equal(handle.closed,true,'no write before backup closes');writes.push({offset,bytes:bytes.length});memory.set(bytes,offset);progress?.(bytes.length,bytes.length);if(options.corruptPreserved&&writes.length===4)memory[0x9000]^=1;},
    async writeApp(bytes,progress){writes.push({offset:0x10000,bytes:bytes.length});memory.set(bytes,0x10000);progress?.(bytes.length,bytes.length);},
    async disconnect(){disconnects++;if(options.cleanupFailure)throw Error('close failed');}};
  const run=extra=>runCandidateFullInstall({manifest,payloads,baseURL,md5,makeDriver:()=>driver,
    saveBackup:(bytes,opts)=>saveBackupToFile(handle,bytes,opts),onState:e=>events.push(e),...extra});
  return {memory,before,writes,events,handle,driver,run,get disconnects(){return disconnects;},get connected(){return connected;}};
}
test('real four-part payload validates boot, app and padded partition table',async()=>{
  assert.deepEqual(await validateFullPayloads(payloads,plan,md5),{minRevision:0,maxRevision:99});
  const appPlan=validateManifest(appManifest,new URL('app-manifest.json',baseURL).href);
  await validateImage(payloads[3],appPlan);
});
test('full manifest rejects all unsupported write plans before any device access',()=>{
  const changes=[m=>m.parts.pop(),m=>m.parts.push(m.parts[0]),m=>m.parts.reverse(),m=>m.parts[0].offset=0,m=>m.parts[0].bytes++,m=>m.parts[0].sha256='a'.repeat(64),m=>m.parts[0].path='https://elsewhere.test/boot.bin',m=>m.parts[0].path+='?x=1',m=>m.erase_all=true,m=>m.chip='esp32s3',m=>m.flash_bytes*=2,m=>m.mode='app',m=>m.partition_table_sha256='0'.repeat(64)];
  for(const change of changes){const m=structuredClone(manifest);change(m);assert.throws(()=>validateFullManifest(m,baseURL));}
  assert.throws(()=>validateFullManifest(manifest,baseURL.replace('https:','http:')));
});
test('full keeps every non-written byte and verifies the saved backup and all Flash',async()=>{
  const f=fixture();const result=await f.run();
  assert.deepEqual(f.writes.map(w=>w.offset),[0x2000,0x8000,0xe000,0x10000]);
  assert.equal(f.handle.closed,true);assert.deepEqual(f.handle.stored,f.before);
  assert.deepEqual(f.memory,buildExpectedFlash(f.before,payloads,plan));
  assert.equal(result.backupSha256,await sha256(f.before));assert.equal(result.preservedRegionsUnchanged,true);assert.equal(result.bootVerified,false);assert.equal(f.disconnects,1);
  assert.equal(f.events.at(-1).state,'complete');
});
test('full accepts a completely blank table but still preserves the other bytes',async()=>{
  const f=fixture({blank:true});const result=await f.run();assert.equal(result.previousTable,'blank');assert.deepEqual(f.memory.subarray(0x9000,0xe000),f.before.subarray(0x9000,0xe000));
});
test('unrecognized table stops before backup and writing',async()=>{
  const f=fixture({badTable:true});await assert.rejects(f.run(),/分区表/);assert.equal(f.writes.length,0);assert.equal(f.handle.stored,undefined);assert.equal(f.disconnects,1);
});
test('corrupt payload stops before connecting',async()=>{
  const f=fixture(),bad=payloads.map(x=>x.slice());bad[0][100]^=1;
  await assert.rejects(f.run({payloads:bad}),/SHA-256/);assert.equal(f.connected,0);assert.equal(f.writes.length,0);
});
test('backup file close failure prevents writing and retains an error',async()=>{
  const f=fixture({failClose:true});await assert.rejects(f.run(),/disk full/);assert.equal(f.writes.length,0);assert.equal(f.handle.aborted,true);assert.equal(f.events.at(-1).recoveryNeeded,false);
});
test('backup file readback corruption prevents writing',async()=>{
  const f=fixture({badRead:true});await assert.rejects(f.run(),/备份文件读回/);assert.equal(f.writes.length,0);
});
test('device changes after the saved backup stop before writing',async()=>{
  const f=fixture({prewriteChange:true});await assert.rejects(f.run(),/写入前设备内容变化/);assert.equal(f.writes.length,0);
});
test('protected NVS corruption is detected by full readback',async()=>{
  const f=fixture({corruptPreserved:true});await assert.rejects(f.run(),/整片 Flash 读回不匹配/);assert.equal(f.events.at(-1).recoveryNeeded,true);assert.equal(f.disconnects,1);
});
test('cancel in the first full write prevents all later parts',async()=>{
  const f=fixture(),c=new AbortController();await assert.rejects(f.run({signal:c.signal,onState:e=>{f.events.push(e);if(e.state==='writing-full'&&e.written)c.abort();}}),{name:'AbortError'});
  assert.equal(f.writes.length,1);assert.equal(f.events.at(-1).recoveryNeeded,true);assert.equal(f.disconnects,1);
});
test('read failure and cleanup failure never become success',async()=>{
  const f=fixture({readFailure:true,cleanupFailure:true});await assert.rejects(f.run(),/read failed/);assert.equal(f.writes.length,0);assert.equal(f.events.at(-1).cleanupFailed,true);assert.notEqual(f.events.at(-1).state,'complete');
});
test('cancel while saving a backup prevents later device writes',async()=>{
  const f=fixture(),c=new AbortController();await assert.rejects(f.run({signal:c.signal,saveBackup:async()=>{c.abort();return {bytes:LIMITS.flashBytes,sha256:'a'.repeat(64)};}}),{name:'AbortError'});assert.equal(f.writes.length,0);
});
test('original app engine remains app-only with the new application',async()=>{
  const f=fixture();const result=await runCandidateInstall({manifest:appManifest,image:payloads[3],baseURL:new URL('app-manifest.json',baseURL).href,md5,makeDriver:()=>f.driver});
  assert.deepEqual(f.writes,[{offset:0x10000,bytes:payloads[3].length}]);assert.deepEqual(f.memory.subarray(0,0x10000),f.before.subarray(0,0x10000));assert.deepEqual(f.memory.subarray(0x410000),f.before.subarray(0x410000));assert.equal(result.protectedRegionsUnchanged,true);
});
test('both production modes require release approval and a secure browser before fetch or chooser',async()=>{
  let fetched=0;const old=globalThis.fetch,secure=globalThis.isSecureContext;globalThis.isSecureContext=false;globalThis.fetch=()=>{fetched++;throw Error('unexpected network');};
  const reason=RELEASE.enabled&&RELEASE.firmwareApproved&&RELEASE.hardwareVerified?/HTTPS/:/门禁关闭/;
  try{for(const s of Object.values(releaseSessions)){await assert.rejects(s.prepare(),reason);assert.throws(()=>s.install(),reason);}assert.equal(fetched,0);}finally{globalThis.fetch=old;if(secure===undefined)delete globalThis.isSecureContext;else globalThis.isSecureContext=secure;}
});
test('adapter cannot enlarge, reorder or append full writes; App remains fixed',async()=>{
  const written=[];
  class Transport{constructor(){this.buffer=new Uint8Array(0);}async connect(){}async disconnect(){}async write(){}}
  class Loader{constructor({transport}){this.transport=transport;this.chip={CHIP_NAME:'ESP32-S31',IMAGE_CHIP_ID:32,getChipRevision:async()=>0};}async detectChip(){await this.transport.connect();}async getSecurityInfo(){return {chipId:32,flashCryptCnt:0,parsedFlags:{SECURE_BOOT_EN:false,SECURE_DOWNLOAD_ENABLE:false}};}async runStub(){this.IS_STUB=true;}async detectFlashSize(){return '16MB';}async writeFlash(options){written.push(options);} }
  const driver=await createEspDriver({port:{},md5,implementation:{ESPLoader:Loader,Transport,ESPError:Error}});await driver.connect();
  await assert.rejects(driver.writeFullPart(0x8000,new Uint8Array(4096)),/顺序/);
  await assert.rejects(driver.writeFullPart(0x2000,new Uint8Array(0x7000)),/长度/);
  for(const p of plan.parts){const data=new Uint8Array(p.writeBytes).fill(0xff);data.set(payloads[plan.parts.indexOf(p)]);await driver.writeFullPart(p.offset,data);}
  await assert.rejects(driver.writeFullPart(0x10000,new Uint8Array(0x400000)),/顺序/);
  for(const w of written){assert.equal(w.eraseAll,false);assert.equal(w.flashMode,'keep');assert.equal(w.fileArray.length,1);}
  await driver.disconnect();
});
test('write deadline stops the full operation and releases the driver',async()=>{
  const f=fixture();f.driver.writeFullPart=()=>new Promise(()=>{});
  await assert.rejects(f.run({timeouts:{'writing-full':5}}),/超时/);assert.equal(f.disconnects,1);assert.equal(f.events.at(-1).recoveryNeeded,true);
});
test('App mode still rejects blank partition tables',async()=>{
  const f=fixture({blank:true});await assert.rejects(runCandidateInstall({manifest:appManifest,image:payloads[3],baseURL:new URL('app-manifest.json',baseURL).href,md5,makeDriver:()=>f.driver}),/分区表/);assert.equal(f.writes.length,0);
});
