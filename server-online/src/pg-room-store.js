import { randomUUID } from 'node:crypto';

// The RPC locks the owner row and commits the snapshot and lease together.
// An ambiguous response fails closed; a replacement restores the committed data.
export class PgRoomStore {
  constructor({ database }) {
    this.database = database;
    this.owner = randomUUID();
    this.epoch = 0;
    this.opened = false;
    this.failed = false;
    this.tail = Promise.resolve();
  }
  health() { return { kind: 'cloudbase-pg', durable: true, healthy: this.opened && !this.failed }; }
  queue(operation) {
    const job = this.tail.then(operation);
    this.tail = job.catch(() => {});
    return job;
  }
  async call(operation, code = null, snapshot = null) {
    const { data, error } = await this.database.rpc('online_room_store', {
      p_operation: operation, p_owner: this.owner, p_epoch: this.epoch,
      p_code: code, p_snapshot: snapshot,
    }).abortSignal(AbortSignal.timeout(5000));
    if (error || !data || typeof data !== 'object') throw new Error('CloudBase PostgreSQL room storage request failed');
    return data;
  }
  async owned(operation, code, snapshot) {
    if (!this.opened || this.failed) throw new Error('Room storage unavailable');
    try { return await this.call(operation, code, snapshot); }
    catch {
      this.failed = true;
      clearTimeout(this.timer);
      throw new Error('Room persistence unavailable; writes stopped');
    }
  }
  async open() {
    if (this.opened) throw new Error('Room store already open');
    const control = await this.call('acquire');
    this.epoch = control.epoch;
    this.opened = true;
    try {
      const rooms = [];
      for (const code of control.rooms) {
        this.validateCode(code);
        const { snapshot } = await this.owned('load', code);
        const room = JSON.parse(snapshot);
        if (room.code !== code) throw new Error('Room snapshot identity mismatch');
        rooms.push(room);
      }
      this.renew();
      return rooms;
    } catch (error) { await this.close(); throw error; }
  }
  renew() {
    if (!this.opened || this.failed) return;
    this.timer = setTimeout(() => {
      this.queue(() => this.owned('renew')).then(() => this.renew()).catch(() => {});
    }, 20000);
    this.timer.unref?.();
  }
  validateCode(code) {
    if (typeof code !== 'string' || !/^[A-Z0-9]{3,12}$/.test(code)) throw new Error('Invalid persisted room code');
  }
  save(room) {
    this.validateCode(room.code);
    const snapshot = JSON.stringify(room);
    if (Buffer.byteLength(snapshot) > 8 * 1024 * 1024) throw new Error('Room snapshot exceeds persistence limit');
    return this.queue(() => this.owned('save', room.code, snapshot));
  }
  remove(code) {
    this.validateCode(code);
    return this.queue(() => this.owned('remove', code));
  }
  async close() {
    clearTimeout(this.timer);
    await this.queue(async () => {
      if (!this.opened) return;
      try { await this.call('release'); } finally { this.opened = false; }
    });
  }
}

export async function createPgRoomStore({ env = process.env.TCB_ENV, accessKey = process.env.CLOUDBASE_APIKEY } = {}) {
  if (!env || !accessKey) throw new Error('PostgreSQL persistence requires TCB_ENV and CLOUDBASE_APIKEY');
  const { default: cloudbase } = await import('@cloudbase/node-sdk');
  const app = cloudbase.init({ env, accessKey, timeout: 5000 });
  return new PgRoomStore({ database: app.rdb() });
}
