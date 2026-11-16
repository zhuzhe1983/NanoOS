import { RELEASE, assertReleased, getRelease } from './installer/src/policy.mjs';
import { releaseSessions } from './installer/release.mjs';
const prepare=document.getElementById('prepare-firmware');
const backup=document.getElementById('choose-backup');
const install=document.getElementById('connect-install');
const cancel=document.getElementById('cancel-install');
const status=document.getElementById('release-state');
const detail=document.getElementById('release-detail');
const summary=document.getElementById('install-summary');
const backupRecord=document.getElementById('backup-record');
const buildLabel=document.getElementById('release-build');
const radios=[...document.querySelectorAll('input[name="install-mode"]')];
let mode='full',busy=false,prepared=false,backupChosen=false,controller=null,epoch=0;
const labels={
  downloading:'正在下载并校验固件',validating:'正在校验镜像','preparing-driver':'正在准备连接',connecting:'正在识别 ESP32-S31',
  'reading-partitions':'正在核对设备分区表','checking-protected-regions':'正在记录保护区摘要','rechecking-partitions':'写入前再次核对分区表',
  'checking-backup-source':'正在记录整片 Flash 摘要','reading-backup':'正在读取 16 MiB 完整备份','verifying-backup-source':'正在校验备份来源',
  'saving-backup':'正在保存备份并重新读回','backup-saved':'完整备份已保存','rechecking-flash':'写入前再次核对 Flash',
  writing:'正在写入 App，请保持连接','writing-full':'正在写入完整安装文件，请保持连接',
  'verifying-image':'正在完整读回 App','verifying-full-flash':'正在读回并比较全部 16 MiB','verifying-full-digest':'正在核对设备整片摘要',
  'verifying-protected-regions':'正在核对其他分区',complete:'写入与读回完成',cancelled:'已取消',error:'操作未完成',
};
function capability(){
  try{assertReleased(mode);}catch{return {ready:false,message:'最终固件与两种安装方式仍在验证；当前不会请求串口权限。'};}
  if(!window.isSecureContext||!navigator.serial?.requestPort)return {ready:false,message:'请在 HTTPS 页面使用支持 Web Serial 的桌面浏览器。'};
  if(mode==='full'&&typeof window.showSaveFilePicker!=='function')return {ready:false,message:'完整安装需要可验证的备份保存。请使用桌面 Chrome / Edge，或下载 Windows 安装包。'};
  return {ready:true,message:mode==='full'?'先准备安装文件，再选择备份保存位置；连接后先完整备份，校验成功才开始写入。':'先准备并校验 App，再连接设备；仅更新原 app0。'};
}
function render(){
  const {ready}=capability();
  for(const radio of radios){radio.checked=radio.value===mode;radio.disabled=busy;}
  prepare.disabled=busy||!ready;
  backup.hidden=mode!=='full';backup.disabled=busy||!ready||!prepared;
  install.disabled=busy||!ready||!prepared||(mode==='full'&&!backupChosen);
  install.textContent=mode==='full'?'3 · 连接设备并安装':'2 · 连接设备并安装';
  cancel.disabled=!busy;
  summary.textContent=mode==='full'
    ?'更新引导程序、分区表、启动选择和 App。先保存并验证 16 MiB 完整备份，保留其他分区与 TF 卡；适用于原厂分区或空白 Flash。'
    :'只更新 app0，适合已安装 NanoOS 的设备。要求原厂分区表，保留引导程序、启动选择及其他分区。';
  let approved=false;try{assertReleased(mode);approved=true;}catch{}
  buildLabel.textContent=getRelease(mode).build;
  for(const block of document.querySelectorAll('[data-mode-download]'))block.hidden=!approved||block.dataset.modeDownload!==mode;
}
function showIdle(){
  const state=capability();status.textContent=state.ready?'安装文件可准备':'测试与发布准备中';detail.textContent=state.message;render();
}
function onStateFor(token){return event=>{
  if(token!==epoch)return;
  status.textContent=labels[event.state]??'正在处理';
  if(event.state==='backup-saved'){backupRecord.hidden=false;backupRecord.textContent=event.message;}
  if(event.message)detail.textContent=event.message;
  else if(event.total)detail.textContent=`${event.label?`${event.part}/${event.parts} · ${event.label} · `:''}${Math.floor(event.written/event.total*100)}%`;
  if(event.recoveryNeeded)detail.textContent+=' 写入区域可能尚未完整；请保留备份并按恢复说明处理，不要直接重试。';
};}
for(const radio of radios)radio.addEventListener('change',()=>{
  if(busy){render();return;}
  epoch++;controller?.abort();Object.values(releaseSessions).forEach(s=>s.discard());
  mode=radio.value;prepared=false;backupChosen=false;backupRecord.hidden=true;showIdle();
});
prepare.addEventListener('click',async()=>{
  const token=++epoch,chosen=mode;controller=new AbortController();busy=true;prepared=false;backupChosen=false;backupRecord.hidden=true;render();
  try{
    const result=await releaseSessions[chosen].prepare({signal:controller.signal,onState:onStateFor(token)});
    if(token!==epoch)return;
    prepared=true;status.textContent=chosen==='full'?'四段安装文件已校验':'App 已校验，等待连接';
    detail.textContent=`${result.bytes.toLocaleString()} 字节 · ${chosen==='full'?'安装清单':'App'} SHA-256 ${result.sha256}`;
  }catch(error){if(token===epoch){status.textContent=error.name==='AbortError'?'已取消':'准备失败';detail.textContent=error.message;}}
  finally{if(token===epoch){busy=false;render();}}
});
backup.addEventListener('click',async()=>{
  const token=epoch;controller=new AbortController();busy=true;backupChosen=false;render();
  try{
    // Must be called directly in this click, before any await.
    const pending=window.showSaveFilePicker({suggestedName:`nanoos-flash-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.bin`,types:[{description:'NanoOS 完整 Flash 备份',accept:{'application/octet-stream':['.bin']}}]});
    const handle=await pending;
    if(token!==epoch||controller.signal.aborted)throw new DOMException('已取消','AbortError');
    releaseSessions.full.setBackupFile(handle);backupChosen=true;
    status.textContent='备份位置已选择，等待连接';detail.textContent=`连接后将读取并保存 ${handle.name}，重新读回校验成功才开始写入。`;
  }catch(error){if(token===epoch){status.textContent=error.name==='AbortError'?'未选择备份位置':'备份位置不可用';detail.textContent=error.name==='AbortError'?'可重新选择位置；设备尚未连接。':error.message;}}
  finally{if(token===epoch){busy=false;render();}}
});
install.addEventListener('click',()=>{
  const token=epoch,chosen=mode;controller=new AbortController();busy=true;prepared=false;render();
  status.textContent='请选择目标设备';detail.textContent=chosen==='full'?'连接后先完整备份并验证保存，再写入四段。':'只写入原 app0；完成后仍需确认设备正常启动。';
  try{
    // The session calls requestPort synchronously, retaining this user gesture.
    const pending=releaseSessions[chosen].install({signal:controller.signal,onState:onStateFor(token)});
    pending.catch(error=>{if(token===epoch&&!['操作未完成','已取消'].includes(status.textContent)){status.textContent='安装未完成';detail.textContent=error.message;}})
      .finally(()=>{if(token===epoch){busy=false;backupChosen=false;render();}});
  }catch(error){status.textContent='安装未开始';detail.textContent=error.message;busy=false;backupChosen=false;render();}
});
cancel.addEventListener('click',()=>{
  controller?.abort(new DOMException('已取消','AbortError'));Object.values(releaseSessions).forEach(s=>s.discard());prepared=false;backupChosen=false;
  detail.textContent='正在停止；若设备或保存位置窗口仍打开，请取消选择。已写入的内容无法撤销。';cancel.disabled=true;
});
window.addEventListener('pagehide',()=>{controller?.abort();Object.values(releaseSessions).forEach(s=>s.discard());});
showIdle();
