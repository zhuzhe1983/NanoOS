import { LIMITS, check, checkSignal, sha256, equal } from './policy.mjs';
import { validateFullManifest, validateFullPayloads, validateFullDeviceTable, buildExpectedFlash } from './full-policy.mjs';

// Only a successful close AND a complete file readback count as a saved backup.
// This function never transmits backup bytes or device data over the network.
export async function saveBackupToFile(handle, bytes, { signal } = {}) {
  check(handle?.kind === 'file' && typeof handle.createWritable === 'function' && typeof handle.getFile === 'function', '请先选择完整备份的保存位置');
  checkSignal(signal);
  let writable, closed=false;
  try {
    writable=await handle.createWritable(); checkSignal(signal);
    await writable.write(bytes); checkSignal(signal);
    await writable.close(); closed=true; checkSignal(signal);
    const file=await handle.getFile(); checkSignal(signal);
    check(file.size===bytes.length,'保存的备份文件长度不匹配');
    const readback=new Uint8Array(await file.arrayBuffer()); checkSignal(signal);
    check(equal(readback,bytes),'备份文件读回内容不匹配');
    return { bytes:readback.length, sha256:await sha256(readback), name:handle.name ?? '' };
  } finally {
    if(writable&&!closed) await writable.abort().catch(()=>{});
  }
}

// Candidate engine is transport-free until makeDriver. The public entry point
// fixes the release, backup writer and driver; callers cannot supply a payload.
export async function runCandidateFullInstall({ manifest, payloads, baseURL, makeDriver, md5, saveBackup, signal, onState=()=>{}, timeouts={} }) {
  const controller=new AbortController();
  const relay=()=>controller.abort(signal.reason ?? new DOMException('已取消','AbortError'));
  if(signal?.aborted) relay(); else signal?.addEventListener('abort',relay,{once:true});
  const active=controller.signal;
  let driver,writeStarted=false,failure,result,cleanupError;
  const emit=(state,detail={})=>onState({state,mode:'full',writeStarted,...detail});
  const stage=async(name,work,timeout=20000)=>{
    checkSignal(active); let timer,abort;
    const cancelled=new Promise((_,reject)=>{
      abort=()=>reject(active.reason);active.addEventListener('abort',abort,{once:true});
      timer=setTimeout(()=>controller.abort(new Error(`${name} 超时；已停止后续操作`)),timeouts[name]??timeout);
    });
    try{return await Promise.race([Promise.resolve().then(()=>{checkSignal(active);emit(name);checkSignal(active);return work();}),cancelled]);}
    finally{clearTimeout(timer);active.removeEventListener('abort',abort);}
  };
  const readAll=async state=>{
    const bytes=new Uint8Array(LIMITS.flashBytes);
    for(let offset=0;offset<bytes.length;offset+=LIMITS.readChunk){
      const length=Math.min(LIMITS.readChunk,bytes.length-offset);
      const block=await stage(state,()=>driver.read(offset,length));
      check(block instanceof Uint8Array&&block.length===length,'Flash 读取长度不匹配');
      bytes.set(block,offset);emit(state,{written:offset+length,total:bytes.length});
    }
    return bytes;
  };
  const deviceMD5=async state=>{
    const digest=await stage(state,()=>driver.digestFull(),120000);
    check(/^[a-f0-9]{32}$/.test(digest),'整片 Flash 摘要无效');return digest;
  };
  try {
    check(typeof saveBackup==='function','完整安装要求可验证的本地备份');
    const plan=validateFullManifest(manifest,baseURL);
    check(Array.isArray(payloads),'缺少完整安装文件');
    payloads=payloads.map(bytes=>{check(bytes instanceof Uint8Array,'安装文件必须为字节数组');return new Uint8Array(bytes);});
    const revision=await stage('validating',()=>validateFullPayloads(payloads,plan,md5));
    driver=await stage('preparing-driver',()=>makeDriver(active));
    const device=await stage('connecting',()=>driver.connect());
    check(device.chip===LIMITS.chip&&device.chipId===LIMITS.chipId&&device.flashBytes===LIMITS.flashBytes&&Number.isInteger(device.revision),'设备身份或容量不匹配');
    check(device.revision>=revision.minRevision&&device.revision<=revision.maxRevision,'设备芯片修订版本不满足镜像要求');
    const table=await stage('reading-partitions',()=>driver.read(LIMITS.tableOffset,LIMITS.tableBytes));
    const tableKind=await validateFullDeviceTable(table,plan,md5);
    const beforeMD5=await deviceMD5('checking-backup-source');
    const backup=await readAll('reading-backup');
    const backupMD5=md5(backup), backupSha256=await sha256(backup);
    check(backupMD5===beforeMD5&&await deviceMD5('verifying-backup-source')===backupMD5,'备份读取期间设备内容变化或摘要不匹配');
    check(equal(backup.subarray(LIMITS.tableOffset,LIMITS.tableOffset+LIMITS.tableBytes),table),'备份中的分区表与准入检查不一致');
    const saved=await stage('saving-backup',()=>saveBackup(backup,{signal:active}),120000);
    check(saved?.bytes===LIMITS.flashBytes&&saved.sha256===backupSha256,'备份保存后校验不匹配；未开始写入');
    emit('backup-saved',{message:`完整备份已保存并读回校验：${saved.name||'备份文件'} · SHA-256 ${backupSha256}`});
    checkSignal(active);
    const expected=buildExpectedFlash(backup,payloads,plan),expectedSha256=await sha256(expected);
    check(await deviceMD5('rechecking-flash')===backupMD5,'写入前设备内容变化，已中止');
    const prewriteTable=await stage('rechecking-partitions',()=>driver.read(LIMITS.tableOffset,LIMITS.tableBytes));
    check(equal(table,prewriteTable),'写入前分区表变化，已中止');
    for(let i=0;i<plan.parts.length;i++){
      const part=plan.parts[i],padded=new Uint8Array(part.writeBytes).fill(0xff);padded.set(payloads[i]);
      checkSignal(active);writeStarted=true;
      await stage('writing-full',()=>driver.writeFullPart(part.offset,padded,(written,total)=>emit('writing-full',{part:i+1,parts:plan.parts.length,label:part.label,written,total})),20*60*1000);
    }
    const readback=await readAll('verifying-full-flash');
    check(equal(readback,expected),'整片 Flash 读回不匹配；写入内容或保留区域发生异常');
    check(await sha256(readback)===expectedSha256,'整片 Flash SHA-256 不匹配');
    for(const part of plan.parts) check(await sha256(readback.subarray(part.offset,part.offset+part.bytes))===part.sha256,`${part.label}写后 SHA-256 不匹配`);
    check(await sha256(readback.subarray(LIMITS.tableOffset,LIMITS.tableOffset+LIMITS.tableBytes))===plan.tableSha256,'写后分区表 SHA-256 不匹配');
    check(await deviceMD5('verifying-full-digest')===md5(expected),'设备整片摘要与读回结果不匹配');
    checkSignal(active);
    result={mode:'full',version:plan.version,build:plan.build,backupSha256,backupMD5,backupName:saved.name??'',flashSha256:expectedSha256,partitionTableSha256:plan.tableSha256,previousTable:tableKind,preservedRegionsUnchanged:true,writtenParts:plan.parts.length,bootVerified:false};
  } catch(error){failure=error;}
  finally{
    signal?.removeEventListener('abort',relay);
    if(driver){let timer;try{await Promise.race([driver.disconnect(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('串口清理超时；请手动断开连接')),timeouts.cleanup??2500);})]);}
      catch(error){cleanupError=error;failure??=error;}finally{clearTimeout(timer);}}
  }
  if(failure){emit(failure.name==='AbortError'?'cancelled':'error',{message:failure.message+(cleanupError&&cleanupError!==failure?`；${cleanupError.message}`:''),cleanupFailed:Boolean(cleanupError),recoveryNeeded:writeStarted});throw failure;}
  emit('complete',{message:'完整安装写入与全片读回完成，其他分区保持不变；请保留备份并确认设备正常启动。',result});
  return result;
}
