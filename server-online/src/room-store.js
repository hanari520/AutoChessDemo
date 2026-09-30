import { mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export class MemoryRoomStore {
  constructor() { this.rooms = new Map(); }
  async open() { return [...this.rooms.values()].map(room => structuredClone(room)); }
  async save(room) { this.rooms.set(room.code, structuredClone(room)); }
  async remove(code) { this.rooms.delete(code); }
  async close() {}
  health() { return {kind:'memory', durable:false, healthy:true}; }
}

// Use only on a persistent, single-writer volume. An exclusive lock prevents
// an overlapping deployment from opening the same directory concurrently.
export class FileRoomStore {
  constructor(directory) { this.directory = directory; this.lock = null; }
  path(code) {
    if (!/^[A-Z2-9]{8}$/.test(code)) throw new Error('Invalid persisted room code');
    return join(this.directory, `${code}.json`);
  }
  health() { return {kind:'file', durable:true, healthy:!!this.lock}; }
  async syncDirectory() {
    // Windows cannot open directories using fs.open. Atomic rename still
    // applies; full power-loss directory durability requires a POSIX volume.
    if (process.platform === 'win32') return;
    const dir = await open(this.directory, 'r');
    try { await dir.sync(); } finally { await dir.close(); }
  }
  async open() {
    if (!this.directory) throw new Error('ROOM_STORE_DIR is required');
    await mkdir(this.directory, { recursive: true });
    this.lock = await open(join(this.directory, '.owner.lock'), 'wx');
    await this.lock.writeFile(`${process.pid}\n`);
    const rooms = [];
    try { for (const name of await readdir(this.directory)) {
      if (!/^[A-Z2-9]{8}\.json$/.test(name)) continue;
      rooms.push(JSON.parse(await readFile(join(this.directory, name), 'utf8')));
    } } catch (error) { await this.close(); throw error; }
    return rooms;
  }
  async save(room) {
    if (!this.lock) throw new Error('room store not open');
    const temp = join(this.directory, `.${room.code}.${randomUUID()}.tmp`);
    let file;
    try {
      file = await open(temp, 'wx', 0o600);
      await file.writeFile(JSON.stringify(room));
      await file.sync();
      await file.close(); file = null;
      await rename(temp, this.path(room.code));
      await this.syncDirectory();
    } finally {
      if (file) await file.close();
      await rm(temp, { force: true });
    }
  }
  async remove(code) {
    if (!this.lock) throw new Error('room store not open');
    await rm(this.path(code), { force: true });
    await this.syncDirectory();
  }
  async close() {
    if (!this.lock) return;
    await this.lock.close(); this.lock = null;
    await rm(join(this.directory, '.owner.lock'), { force: true });
  }
}
