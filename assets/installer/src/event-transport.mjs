// Add byte-arrival notification around the pinned esptool-js Transport.
// The vendor readLoop, SLIP parser, write path and stub remain unchanged.
// Serial commands have one reader. This wrapper never reads the port itself.
export function eventDrivenTransport(BaseTransport, SerialError = Error) {
  return class EventTransport extends BaseTransport {
    constructor(...args) {
      super(...args);
      this._eventEnded = false;
      this._eventStopping = false;
      this._eventReading = false;
      this._eventWaiter = undefined;
    }
    // The pinned constructor and readLoop assign this.buffer, so no polling or
    // extra getReader/read call is needed. Keep the exact byte-array identity.
    get buffer() { return this._eventBuffer; }
    set buffer(bytes) {
      this._eventBuffer = bytes;
      if (bytes?.length) this._eventWaiter?.(true);
    }
    async connect(...args) {
      this._eventStopping = false;
      this._eventEnded = false;
      return super.connect(...args);
    }
    async readLoop(...args) {
      this._eventEnded = false;
      try { return await super.readLoop(...args); }
      finally { this._eventEnded = true; this._eventWaiter?.(false); }
    }
    async disconnect(...args) {
      this._eventStopping = true;
      this._eventWaiter?.(false);
      return super.disconnect(...args);
    }
    _eventChanged(timeout) {
      return new Promise(resolve => {
        let timer;
        const finish = changed => {
          if (this._eventWaiter !== finish) return;
          this._eventWaiter = undefined;
          clearTimeout(timer);
          resolve(changed);
        };
        this._eventWaiter = finish;
        timer = setTimeout(() => finish(false), timeout);
      });
    }
    async read(timeout) {
      if (this._eventReading) throw new SerialError('Concurrent serial packet read');
      this._eventReading = true;
      try {
        // Invalid/zero timeout retains the pinned parser's original behavior.
        if (!(timeout > 0 && Number.isFinite(timeout))) return await super.read(timeout);
        let scanned = 0, escaped = false;
        for (;;) {
          if (this._eventStopping) throw new SerialError('Serial transport closed');
          const bytes = this.buffer;
          let parseNow = bytes.length > 0 && bytes[0] !== this.SLIP_END;
          if (scanned > bytes.length) { scanned = 0; escaped = false; }
          for (let i = Math.max(1, scanned); !parseNow && i < bytes.length; i++) {
            const b = bytes[i];
            // A delimiter or invalid escape is enough for the ORIGINAL parser
            // to return or throw synchronously, without its 1-ms polling loop.
            if (escaped) {
              escaped = false;
              if (b !== this.SLIP_ESC_END && b !== this.SLIP_ESC_ESC) parseNow = true;
            } else if (b === this.SLIP_END) parseNow = true;
            else if (b === this.SLIP_ESC) escaped = true;
          }
          scanned = bytes.length;
          if (parseNow) return await super.read(timeout);
          if (this._eventEnded) { this.buffer = new Uint8Array(0); throw new SerialError('Serial data stream ended'); }
          // As in the vendor loop, each received raw chunk renews the inactivity
          // timeout. The independent installer stage deadline is unchanged.
          if (!await this._eventChanged(timeout)) {
            if (this._eventStopping) throw new SerialError('Serial transport closed');
            // The original parser consumes incomplete chunks before timing out.
            // Do not leave our prebuffered partial frame for a later read.
            this.buffer = new Uint8Array(0);
            if (this._eventEnded) throw new SerialError('Serial data stream ended');
            throw new SerialError(bytes.length ? 'No serial data received.' : 'Serial data stream stopped: Possible serial noise or corruption.');
          }
        }
      } finally { this._eventReading = false; }
    }
  };
}
