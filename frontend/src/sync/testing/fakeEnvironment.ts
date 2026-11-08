import type { SyncEnvironment } from "../engine";

// Deterministic SyncEnvironment for tests: connectivity is a flag, timers only
// fire when the test runs them, and jitter is fixed.
export class FakeSyncEnvironment implements SyncEnvironment {
  online = true;
  private next_timer_id = 1;
  readonly timers = new Map<number, { callback: () => void; delay_ms: number }>();
  private readonly wake_listeners = new Set<() => void>();
  private readonly offline_listeners = new Set<() => void>();

  isOnline = (): boolean => this.online;

  setTimer = (callback: () => void, delay_ms: number): unknown => {
    const timer_id = this.next_timer_id++;
    this.timers.set(timer_id, { callback, delay_ms });
    return timer_id;
  };

  clearTimer = (timer_handle: unknown): void => {
    this.timers.delete(timer_handle as number);
  };

  random = (): number => 0.5;

  onWake = (listener: () => void): (() => void) => {
    this.wake_listeners.add(listener);
    return () => this.wake_listeners.delete(listener);
  };

  onOffline = (listener: () => void): (() => void) => {
    this.offline_listeners.add(listener);
    return () => this.offline_listeners.delete(listener);
  };

  wake(): void {
    for (const listener of this.wake_listeners) listener();
  }

  // Changes connectivity the way the browser reports it: losing the connection
  // fires "offline", regaining it wakes the engine.
  setOnline(is_online: boolean): void {
    this.online = is_online;
    if (is_online) {
      this.wake();
    } else {
      for (const listener of this.offline_listeners) listener();
    }
  }

  scheduledDelays(): number[] {
    return [...this.timers.values()].map((scheduled_timer) => scheduled_timer.delay_ms);
  }

  runTimers(): void {
    const due_timers = [...this.timers.entries()];
    this.timers.clear();
    for (const [, scheduled_timer] of due_timers) scheduled_timer.callback();
  }
}
