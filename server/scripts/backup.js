/**
 * Copies the database and all photos/videos to BACKUP_DIR (e.g. iCloud Drive
 * or an external drive). Runs nightly via launchd; safe to run any time:
 *   npm run backup
 *
 *   <BACKUP_DIR>/db/garage-YYYY-MM-DD.db   a consistent snapshot per day (last 30 kept)
 *   <BACKUP_DIR>/media/…                  every resized photo and video
 *   <BACKUP_DIR>/originals/…              the original uploads
 * Media files never change once written, so only new ones are copied.
 */
import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { loadConfig } from "../src/config.js";

const KEEP_DAYS = 30;
const config = loadConfig();
if (!config.backupDir) {
  console.error("Set BACKUP_DIR in .env first.");
  process.exit(1);
}
const dest = path.resolve(config.backupDir);

async function mirror(from, to) {
  let copied = 0;
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copied += await mirror(src, dst);
    else if (entry.isFile()) {
      const existing = await stat(dst).catch(() => null);
      if (!existing || existing.size !== (await stat(src)).size) {
        await copyFile(src, dst);
        copied++;
      }
    }
  }
  return copied;
}

const day = new Date().toISOString().slice(0, 10);
await mkdir(path.join(dest, "db"), { recursive: true });
const db = new Database(config.dbFile, { readonly: true });
await db.backup(path.join(dest, "db", `garage-${day}.db`));
db.close();

const media = await mirror(config.mediaDir, path.join(dest, "media"));
const originals = await mirror(config.originalsDir, path.join(dest, "originals"));

const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
for (const f of await readdir(path.join(dest, "db"))) {
  const m = f.match(/^garage-(\d{4}-\d{2}-\d{2})\.db$/);
  if (m && m[1] < cutoff) await rm(path.join(dest, "db", f));
}
console.log(`[backup] ${new Date().toISOString()} → ${dest}: database snapshot ${day}, ${media} new media files, ${originals} new originals`);
