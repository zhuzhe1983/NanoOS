import { assertReleased, getRelease, check, checkSignal, sha256, validateManifest, validateImage, boundedFetch } from './src/policy.mjs';
import { runCandidateInstall } from './src/installer.mjs';
import { validateFullManifest, validateFullPayloads } from './src/full-policy.mjs';
import { runCandidateFullInstall, saveBackupToFile } from './src/full-installer.mjs';
import { createEspDriver } from './src/esp-adapter.mjs';
import { createPreparedSession } from './session.mjs';

const md5 = bytes => globalThis.SparkMD5.ArrayBuffer.hash(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));

// Only these two immutable bindings can reach the real port. No caller-provided
// manifest, address, file URL or payload is accepted by a production session.
export function createReleaseSession(mode) {
  const release=getRelease(mode);
  let backupHandle=null, selectedBackup=null;
  const authorize=()=>{
    assertReleased(mode);
    check(globalThis.isSecureContext&&globalThis.navigator?.serial?.requestPort,'需要 HTTPS 与支持 Web Serial 的桌面浏览器');
    if(mode==='full')check(typeof globalThis.showSaveFilePicker==='function','完整安装需要可验证的本地文件保存，请使用桌面 Chrome / Edge 或 Windows 安装包');
  };
  const session=createPreparedSession({
    authorize,
    async load({signal,onState=()=>{}}){
      onState({state:'downloading',mode});checkSignal(signal);
      const bytes=await boundedFetch(release.manifestUrl,release.manifestBytes,signal);
      check(await sha256(bytes)===release.manifestSha256,'发布描述摘要不匹配');
      const manifest=JSON.parse(new TextDecoder().decode(bytes));
      check(manifest.build===release.build&&manifest.mode===mode&&manifest.hardware_verified===true,'该安装包尚未完成实机放行或模式不匹配');
      await import('./vendor/spark-md5-3.0.2.js');
      let value;
      if(mode==='full'){
        const rawPlan=validateFullManifest(manifest,release.manifestUrl);
        const plan=Object.freeze({...rawPlan,sha256:release.manifestSha256});
        const payloads=[];
        for(const part of plan.parts){
          onState({state:'downloading',mode,message:`正在校验${part.label}`});
          payloads.push(await boundedFetch(part.url,part.bytes,signal,fetch,120000));
        }
        await validateFullPayloads(payloads,plan,md5);
        value={manifest,plan,payloads};
      }else{
        const plan=validateManifest(manifest,release.manifestUrl);
        const image=await boundedFetch(plan.url,plan.bytes,signal,fetch,120000);
        await validateImage(image,plan);value={manifest,plan,image};
      }
      checkSignal(signal);
      await import('./vendor/esptool-js-0.7.1.mjs');checkSignal(signal);
      return value;
    },
    select:()=>{
      if(mode==='full')check(backupHandle?.kind==='file','请先选择完整备份的保存位置');
      selectedBackup=backupHandle;
      return navigator.serial.requestPort();
    },
    install:({value,port,signal,onState})=>{
      const options={manifest:value.manifest,baseURL:release.manifestUrl,signal,onState,md5,
        makeDriver:activeSignal=>createEspDriver({port,signal:activeSignal,md5})};
      return mode==='full'
        ?runCandidateFullInstall({...options,payloads:value.payloads,saveBackup:(bytes,options)=>saveBackupToFile(selectedBackup,bytes,options)})
        :runCandidateInstall({...options,image:value.image});
    },
  });
  return Object.freeze({
    prepare(options){backupHandle=null;selectedBackup=null;return session.prepare(options);},
    install(options){const pending=session.install(options);return pending.finally(()=>{backupHandle=null;selectedBackup=null;});},
    setBackupFile(handle){check(mode==='full'&&handle?.kind==='file'&&typeof handle.createWritable==='function'&&typeof handle.getFile==='function','备份保存位置无效');backupHandle=handle;},
    discard(){backupHandle=null;session.discard();},
  });
}
export const releaseSessions=Object.freeze({full:createReleaseSession('full'),app:createReleaseSession('app')});
// Legacy app-only reference remains app-only; it cannot select the full mode.
export const releaseSession=releaseSessions.app;
