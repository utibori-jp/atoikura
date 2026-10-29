import type { LocalDb, RecoverableLocalDb } from "../db/client";
import { SyncStore } from "./store";
import type { SyncTransport } from "./transport";
import type { PushResult } from "./wire";

// Reset and re-sync (#204): when the local database can't be migrated safely,
// its pending changes are pushed first, then it is recreated empty, and the
// engine pulls everything again from 0 (a fresh database has no cursor).
//
// The old database is only read here, apart from removing outbox entries the
// server has answered. It is recreated only once its outbox is empty, so a
// network failure leaves everything in place for the next attempt.

export interface RecoveryReport {
  pushed_change_count: number;
  // Changes the server refused. The old database can't record them, and the
  // new one starts empty, so the caller shows these to the user directly.
  rejected_results: PushResult[];
}

const MAX_RECOVERY_PUSH_ROUNDS = 100;

export async function pushOutboxAndRecreate(
  recoverable_db: RecoverableLocalDb,
  transport: SyncTransport
): Promise<{ local_db: LocalDb; recovery_report: RecoveryReport }> {
  const recovery_store = new SyncStore(recoverable_db);
  const recovery_report: RecoveryReport = { pushed_change_count: 0, rejected_results: [] };

  for (let push_round = 0; ; push_round++) {
    const push_batch = await recovery_store.buildPushBatch();
    if (!push_batch) break;
    if (push_round >= MAX_RECOVERY_PUSH_ROUNDS) {
      throw new Error("未送信の変更を送りきれませんでした");
    }
    const push_results = await transport.push(push_batch.changes);
    recovery_report.pushed_change_count += push_batch.changes.length;
    recovery_report.rejected_results.push(
      ...push_results.filter((push_result) => push_result.status === "rejected")
    );
    const answered_ids = new Set(push_results.map((push_result) => push_result.id));
    const outbox_deletes = push_batch.changes
      .filter((push_change) => answered_ids.has(push_change.id))
      .flatMap((push_change) =>
        [...(push_batch.sent_fields_by_id.get(push_change.id) ?? [])].map(
          ([field_name, sent_field]) => ({
            sql: "DELETE FROM _outbox WHERE collection = ? AND record_id = ? AND field = ? AND hlc = ?",
            bind: [push_change.collection, push_change.id, field_name, sent_field.hlc],
          })
        )
      );
    if (outbox_deletes.length === 0) {
      throw new Error("サーバーが未送信の変更に応答しませんでした");
    }
    await recoverable_db.batch(outbox_deletes);
  }

  const local_db = await recoverable_db.recreate();
  return { local_db, recovery_report };
}
