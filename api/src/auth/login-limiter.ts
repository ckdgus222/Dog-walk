import { Injectable } from '@nestjs/common';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

interface LoginRecord {
  failures: number[];
  pending: number;
  lockedUntil: number;
}

@Injectable()
export class LoginLimiter {
  // This single API instance keeps records in memory. An owner-initiated
  // container restart clears them; sharing records across instances is not needed.
  private readonly records = new Map<string, LoginRecord>();

  begin(ip: string): boolean {
    const now = Date.now();
    if (this.records.size > 1000) {
      for (const [address, record] of this.records) {
        this.removeIfUnused(address, record, now);
      }
    }

    let record = this.records.get(ip);
    if (!record) {
      record = { failures: [], pending: 0, lockedUntil: 0 };
      this.records.set(ip, record);
    }
    if (record.lockedUntil > now) return false;

    record.failures = record.failures.filter((time) => time > now - WINDOW_MS);
    if (record.failures.length + record.pending >= MAX_FAILURES) return false;

    record.pending += 1;
    return true;
  }

  release(ip: string): void {
    const record = this.records.get(ip);
    if (!record || record.pending === 0) return;

    record.pending -= 1;
    this.removeIfUnused(ip, record, Date.now());
  }

  failed(ip: string): void {
    const record = this.records.get(ip);
    if (!record || record.pending === 0) return;

    const now = Date.now();
    record.pending -= 1;
    record.failures = record.failures.filter((time) => time > now - WINDOW_MS);
    record.failures.push(now);
    if (record.failures.length >= MAX_FAILURES) {
      record.lockedUntil = now + WINDOW_MS;
      record.failures = [];
    }
    this.removeIfUnused(ip, record, now);
  }

  clear(): void {
    this.records.clear();
  }

  private removeIfUnused(ip: string, record: LoginRecord, now: number): void {
    if (record.pending > 0 || record.lockedUntil > now) return;
    if (record.failures.some((time) => time > now - WINDOW_MS)) return;

    this.records.delete(ip);
  }
}
