// Transport-free orchestration; production dependencies are fixed in release.mjs.
// Preparation is bounded even when fetch/import ignores abort. Selection stays
// synchronous so the second click retains its browser user activation.
export function createPreparedSession({ authorize, load, select, install, prepareTimeoutMs = 180000 }) {
  if (!Number.isSafeInteger(prepareTimeoutMs) || prepareTimeoutMs < 1 || prepareTimeoutMs > 180000) throw new Error('准备超时范围无效');
  let prepared = null, operation = null, generation = 0;
  const active = signal => { if (signal?.aborted) throw signal.reason ?? new DOMException('已取消', 'AbortError'); };
  return Object.freeze({
    async prepare({ signal, onState } = {}) {
      authorize(); active(signal);
      if (operation) throw new Error('已有操作正在进行');
      const op = { kind:'prepare', generation:++generation, controller:new AbortController() };
      operation = op; prepared = null;
      const relay = () => op.controller.abort(signal.reason ?? new DOMException('已取消', 'AbortError'));
      signal?.addEventListener('abort', relay, { once:true });
      let timer, abort;
      const cancelled = new Promise((_, reject) => {
        abort = () => reject(op.controller.signal.reason);
        op.controller.signal.addEventListener('abort', abort, { once:true });
        timer = setTimeout(() => op.controller.abort(new Error('准备固件超时；未连接设备')), prepareTimeoutMs);
      });
      const current = () => { active(op.controller.signal); if(operation!==op || generation!==op.generation) throw new DOMException('准备任务已过期','AbortError'); };
      try {
        // Register abort/deadline first, then invoke work. Notifications from a
        // late old load cannot alter a newer operation's visible state.
        active(signal); current();
        let loading;
        try { loading = load({ signal:op.controller.signal, onState:event => { if(operation!==op || generation!==op.generation || op.controller.signal.aborted)return; onState?.(event); current(); } }); }
        catch (error) { loading = Promise.reject(error); }
        const value = await Promise.race([loading, cancelled]); current();
        prepared = value;
        return Object.freeze({ version:value.plan.version, bytes:value.plan.bytes, sha256:value.plan.sha256 });
      } finally {
        clearTimeout(timer); signal?.removeEventListener('abort', relay);
        op.controller.signal.removeEventListener('abort', abort);
        if (operation === op) operation = null;
      }
    },
    install({ signal, onState } = {}) {
      authorize(); active(signal);
      if (operation || !prepared) throw new Error('请先准备并校验固件');
      const value = prepared; prepared = null;
      const op = { kind:'install', generation:++generation }; operation = op;
      // No await, promise callback, import or network request before select().
      let selection;
      try { selection = select(); }
      catch (error) { if(operation===op)operation=null; throw error; }
      return Promise.resolve(selection).then(port => {
        active(signal); // permission alone does not open a port
        return install({ value, port, signal, onState });
      }).finally(() => { if(operation===op)operation=null; });
    },
    discard() {
      prepared = null;
      if (operation?.kind === 'prepare') {
        generation++;
        operation.controller.abort(new DOMException('准备已取消','AbortError'));
      }
    },
  });
}
