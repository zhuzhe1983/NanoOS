// Transport-free orchestration; production dependencies are fixed in release.mjs.
// Separating preparation from selection preserves the click's user activation.
export function createPreparedSession({ authorize, load, select, install }) {
  let prepared = null, busy = false;
  const active = signal => { if (signal?.aborted) throw signal.reason ?? new DOMException('已取消', 'AbortError'); };
  return Object.freeze({
    async prepare({ signal, onState } = {}) {
      authorize(); active(signal);
      if (busy) throw new Error('已有操作正在进行');
      busy = true; prepared = null;
      try {
        const value = await load({ signal, onState }); active(signal);
        prepared = value;
        return Object.freeze({ version: value.plan.version, bytes: value.plan.bytes, sha256: value.plan.sha256 });
      } finally { busy = false; }
    },
    install({ signal, onState } = {}) {
      authorize(); active(signal);
      if (busy || !prepared) throw new Error('请先准备并校验固件');
      const value = prepared; prepared = null; busy = true;
      // No await, promise callback, import or network request before select().
      // A second click invokes the native chooser directly in this stack.
      let selection;
      try { selection = select(); }
      catch (error) { busy = false; throw error; }
      return Promise.resolve(selection).then(port => {
        active(signal); // selection grants permission but does not open the port
        return install({ value, port, signal, onState });
      }).finally(() => { busy = false; });
    },
    discard() { prepared = null; },
  });
}
