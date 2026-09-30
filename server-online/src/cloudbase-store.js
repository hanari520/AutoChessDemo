import { randomUUID } from 'node:crypto';

const CONTROL_ID = 'room-service-owner';
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;

function checked(result) {
  if (result?.code) throw new Error('CloudBase storage request failed');
  return result;
}

async function readDocument(reference) {
  const { data } = checked(await reference.get());
  return Array.isArray(data) ? data[0] ?? null : data;
}

/** A single authoritative process, fenced by a transactionally checked lease.
 * Room snapshots and the room manifest commit before the service sends replies.
 * JSON strings keep SDK field-path handling away from game/user object keys.
 */
export class CloudBaseRoomStore {
  constructor({ database, collection = 'online_room_state', leaseMs = 60_000, now = Date.now } = {}) {
    if (!database || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(collection)) {
      throw new Error('CloudBase database and a valid collection are required');
    }
    if (!Number.isFinite(leaseMs) || leaseMs < 1000) throw new Error('Invalid owner lease duration');
    this.database = database;
    this.collection = collection;
    this.leaseMs = leaseMs;
    this.now = now;
    this.owner = randomUUID();
    this.epoch = null;
    this.opened = false;
    this.failed = false;
    this.timer = null;
    this.tail = Promise.resolve();
  }

  health() { return { kind: 'cloudbase', durable: true, healthy: this.opened && !this.failed }; }

  queue(operation) {
    const job = this.tail.then(operation);
    this.tail = job.catch(() => {});
    return job;
  }

  reference(transaction, id) { return transaction.collection(this.collection).doc(id); }

  async ownedTransaction(operation) {
    if (!this.opened || this.failed) throw new Error('CloudBase room store is unavailable');
    try {
      return await this.database.runTransaction(async transaction => {
        const reference = this.reference(transaction, CONTROL_ID);
        const control = await readDocument(reference);
        if (!control || control.owner !== this.owner || control.epoch !== this.epoch || control.expiresAt <= this.now()) {
          throw new Error('Room service ownership was lost');
        }
        const result = await operation(transaction, control);
        control.expiresAt = this.now() + this.leaseMs;
        // Every mutation writes this fence: a new owner racing this commit
        // conflicts rather than allowing two independent copies of a room.
        const { _id, ...value } = control;
        checked(await reference.set(value));
        return result;
      });
    } catch {
      this.failed = true;
      clearTimeout(this.timer);
      throw new Error('CloudBase room persistence unavailable; writes stopped');
    }
  }

  async open() {
    if (this.opened) throw new Error('Room store is already open');
    let control;
    await this.database.runTransaction(async transaction => {
      const reference = this.reference(transaction, CONTROL_ID);
      const current = await readDocument(reference);
      if (current?.owner && current.expiresAt > this.now()) throw new Error('Another room service owns the storage lease');
      if (current && (current.schema !== 1 || !Array.isArray(current.rooms))) throw new Error('Unsupported room storage manifest');
      control = { schema: 1, owner: this.owner, epoch: (current?.epoch ?? 0) + 1, expiresAt: this.now() + this.leaseMs, rooms: current?.rooms ?? [] };
      checked(await reference.set(control));
    });
    this.epoch = control.epoch;
    this.opened = true;
    try {
      const rooms = [];
      // Loading one room per transaction keeps below CloudBase's 100-operation
      // transaction limit and extends the lease throughout large restores.
      // Data-level corruption is dropped, not thrown: one bad snapshot must
      // not brick startup. Storage-level failures still fail open().
      for (const code of control.rooms) {
        this.validateCode(code);
        const snapshot = await this.ownedTransaction(async transaction => {
          const document = await readDocument(this.reference(transaction, `room-${code}`));
          return document?.schema === 1 && typeof document.snapshot === 'string' ? document.snapshot : null;
        });
        let room = null;
        try { room = JSON.parse(snapshot); } catch { room = null; }
        if (!room || room.code !== code) {
          await this.remove(code);
          continue;
        }
        rooms.push(room);
      }
      this.scheduleRenewal();
      return rooms;
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  scheduleRenewal() {
    if (!this.opened || this.failed) return;
    this.timer = setTimeout(() => {
      this.queue(() => this.ownedTransaction(async () => {}))
        .then(() => this.scheduleRenewal())
        .catch(() => { /* health() exposes failure; mutation admission fails closed */ });
    }, Math.floor(this.leaseMs / 3));
    this.timer.unref?.();
  }

  validateCode(code) {
    if (typeof code !== 'string' || !/^[A-Z0-9]{3,12}$/.test(code)) throw new Error('Invalid persisted room code');
  }

  save(room) {
    this.validateCode(room.code);
    const snapshot = JSON.stringify(room);
    if (Buffer.byteLength(snapshot) > MAX_SNAPSHOT_BYTES) throw new Error('Room snapshot exceeds persistence limit');
    const code = room.code;
    return this.queue(() => this.ownedTransaction(async (transaction, control) => {
      checked(await this.reference(transaction, `room-${code}`).set({ schema: 1, snapshot }));
      if (!control.rooms.includes(code)) control.rooms.push(code);
    }));
  }

  remove(code) {
    this.validateCode(code);
    return this.queue(() => this.ownedTransaction(async (transaction, control) => {
      checked(await this.reference(transaction, `room-${code}`).remove());
      control.rooms = control.rooms.filter(value => value !== code);
    }));
  }

  async close() {
    clearTimeout(this.timer);
    await this.queue(async () => {
      if (!this.opened) return;
      // A failed/ambiguous commit may still own a lease. Release only if the
      // authoritative fence is ours; never touch a replacement process's lease.
      try {
        await this.database.runTransaction(async transaction => {
          const reference = this.reference(transaction, CONTROL_ID);
          const control = await readDocument(reference);
          if (control?.owner !== this.owner || control.epoch !== this.epoch) return;
          const { _id, ...value } = control;
          checked(await reference.set({ ...value, owner: null, expiresAt: 0 }));
        });
      } finally { this.opened = false; }
    });
  }
}

export async function createCloudBaseRoomStore({ env = process.env.TCB_ENV, accessKey = process.env.CLOUDBASE_APIKEY, collection = process.env.ROOM_STORE_COLLECTION || 'online_room_state' } = {}) {
  if (!env || !accessKey) throw new Error('CloudBase persistence requires TCB_ENV and CLOUDBASE_APIKEY');
  const { default: cloudbase } = await import('@cloudbase/node-sdk');
  const app = cloudbase.init({ env, accessKey, timeout: 5000 });
  const database = app.database();
  return new CloudBaseRoomStore({ database, collection });
}
