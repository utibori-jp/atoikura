# Manual test: one user's phone and browser (Step 7a, #205)

The automated multi-device tests (`frontend/e2e/multi-device.spec.ts`) run two
Chromium contexts against one server. This checklist covers what they cannot:
a real phone (iOS Safari or Android Chrome, installed as a PWA) next to a
desktop browser, with real network loss.

## Setup

- Both devices reach the same backend over HTTPS. OPFS and the service worker
  need a secure context, so a plain `http://<LAN IP>` URL does not work on the
  phone.
- Sign up on the browser, install the app on the phone (Add to Home Screen) and
  sign in there with the same account.
- "Sync" below means: bring the app to the foreground, or tap the sync status
  pill and press 今すぐ同期.
- "Offline" means airplane mode on the phone and the network turned off in the
  browser's dev tools (or Wi-Fi off).

## Checklist

Record the result of each step in the table at the end.

1. **Entries.** On the phone, record an expense. Sync the browser: it appears
   in 仕訳 with the same amount, item and category.
2. **Field-level merge.** Take both devices offline. On the phone, change the
   amount of that entry; on the browser, change its item. Bring both online and
   sync both: each shows the new amount *and* the new item.
3. **Same field.** Offline on both, change the amount on the phone, then a
   moment later on the browser. Online and sync both: both show the browser's
   amount (the later edit).
4. **Deletion.** Offline on both, delete an entry on the browser and edit it on
   the phone. Online and sync both: the entry is gone on both.
5. **Notes.** Offline on both, write a daily note for the same day on each
   device. Online and sync both: both show the two notes on separate lines.
   Repeat with a monthly review memo for the same category (振り返り).
6. **Masters.** On the browser (online), add a category group and a category
   in マスタ. Sync the phone: the new category can be picked when recording.
7. **Recurring expenses.** On the phone, add a fixed recurring expense whose
   billing day has already passed this month. Sync both: 仕訳 shows exactly one
   posting of it on each device. Add a variable one, confirm it on the browser,
   and check the phone shows the confirmed entry and no longer lists it as
   pending.
8. **Savings and income.** On the browser, add a savings goal and an income
   record and change the base income. Sync the phone: all three show, and the
   budget figures match on both devices.
9. **Offline reading.** Put the phone in airplane mode, close the app
   completely and open it again: it starts, every screen shows data, and
   online-only edit buttons are disabled with the offline notice.
10. **Offline writing.** Still offline, record two expenses and a note on the
    phone. The sync pill shows 未送信. Go online: they are sent on their own and
    appear on the browser after a sync.
11. **Sign-out.** Sign out on the phone and sign in again: everything comes
    back from the server.

## Results

| Date | Phone (model, OS, browser) | Browser | Steps passed | Issues found |
|------|----------------------------|---------|--------------|--------------|
|      |                            |         |              |              |
