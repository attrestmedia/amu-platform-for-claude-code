/**
 * @docHint
 * @purpose CardNews immutable document history의 transaction·coalescing·entry/byte cap
 * @process begin → transient replace → commit → bounded undo/redo
 * @domain card-news
 * @scope editor_state
 */

export type CardNewsHistoryOptions<T> = {
  maxEntries?: number;
  maxBytes?: number;
  serialize?: (value: T) => string;
};

type HistoryEntry<T> = { value: T; bytes: number; serialized: string; coalesceKey?: string };

function defaultSerialize<T>(value: T) {
  return JSON.stringify(value) ?? "null";
}

function byteLength(value: string) {
  return typeof TextEncoder === "undefined" ? value.length : new TextEncoder().encode(value).byteLength;
}

export class CardNewsHistory<T> {
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly serialize: (value: T) => string;
  private entries: HistoryEntry<T>[];
  private index = 0;
  private transaction: { base: HistoryEntry<T>; value: T; coalesceKey?: string } | null = null;

  constructor(initial: T, options: CardNewsHistoryOptions<T> = {}) {
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries || 50));
    this.maxBytes = Math.max(1, Math.floor(options.maxBytes || 5 * 1024 * 1024));
    this.serialize = options.serialize || defaultSerialize;
    this.entries = [this.createEntry(initial)];
  }

  private createEntry(value: T, coalesceKey?: string) {
    const serialized = this.serialize(value);
    const bytes = byteLength(serialized);
    if (bytes > this.maxBytes) throw new Error("CARD_NEWS_HISTORY_ENTRY_TOO_LARGE");
    return { value, serialized, bytes, coalesceKey };
  }

  private currentEntry() {
    return this.entries[this.index];
  }

  private trim() {
    while (this.entries.length > this.maxEntries) {
      this.entries.shift();
      this.index -= 1;
    }
    while (this.entries.length > 1 && this.totalBytes > this.maxBytes) {
      this.entries.shift();
      this.index -= 1;
    }
    this.index = Math.max(0, Math.min(this.index, this.entries.length - 1));
  }

  private get totalBytes() {
    return this.entries.reduce((total, entry) => total + entry.bytes, 0);
  }

  get present() {
    return this.currentEntry().value;
  }

  get entryCount() {
    return this.entries.length;
  }

  get bytes() {
    return this.totalBytes;
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index < this.entries.length - 1;
  }

  beginTransaction(coalesceKey?: string) {
    if (this.transaction) throw new Error("CARD_NEWS_HISTORY_TRANSACTION_ACTIVE");
    this.transaction = { base: this.currentEntry(), value: this.present, coalesceKey };
  }

  replaceTransient(next: T) {
    if (!this.transaction) throw new Error("CARD_NEWS_HISTORY_TRANSACTION_REQUIRED");
    this.transaction.value = next;
    return next;
  }

  cancelTransaction() {
    this.transaction = null;
    return this.present;
  }

  commit(next?: T) {
    if (!this.transaction) throw new Error("CARD_NEWS_HISTORY_TRANSACTION_REQUIRED");
    const transaction = this.transaction;
    this.transaction = null;
    const value = next === undefined ? transaction.value : next;
    const entry = this.createEntry(value, transaction.coalesceKey);
    if (entry.serialized === transaction.base.serialized) return false;
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push(entry);
    this.index = this.entries.length - 1;
    this.trim();
    return true;
  }

  push(next: T, coalesceKey?: string) {
    const current = this.currentEntry();
    const entry = this.createEntry(next, coalesceKey);
    if (entry.serialized === current.serialized) return false;
    if (coalesceKey && current.coalesceKey === coalesceKey) {
      this.entries[this.index] = entry;
      this.trim();
      return true;
    }
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push(entry);
    this.index = this.entries.length - 1;
    this.trim();
    return true;
  }

  undo() {
    if (!this.canUndo) return null;
    this.index -= 1;
    return this.present;
  }

  redo() {
    if (!this.canRedo) return null;
    this.index += 1;
    return this.present;
  }

  reset(next: T) {
    this.transaction = null;
    this.entries = [this.createEntry(next)];
    this.index = 0;
    return this.present;
  }
}

export function createCardNewsHistory<T>(initial: T, options: CardNewsHistoryOptions<T> = {}) {
  return new CardNewsHistory(initial, options);
}
