export type AppLogLevel = "info" | "success" | "warning" | "error";

export interface AppLogEntry {
  id: number;
  timestamp: string;
  level: AppLogLevel;
  message: string;
  detail: string | null;
}

type LogListener = (entries: AppLogEntry[]) => void;

const MAX_ENTRIES = 200;

class AppLogger {
  private entries: AppLogEntry[] = [];
  private listeners = new Set<LogListener>();
  private nextId = 1;

  getEntries(): AppLogEntry[] {
    return [...this.entries];
  }

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    listener(this.getEntries());
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.entries = [];
    this.emit();
  }

  info(message: string, detail?: string | null): void {
    this.write("info", message, detail);
  }

  success(message: string, detail?: string | null): void {
    this.write("success", message, detail);
  }

  warning(message: string, detail?: string | null): void {
    this.write("warning", message, detail);
  }

  error(message: string, detail?: string | null): void {
    this.write("error", message, detail);
  }

  private write(
    level: AppLogLevel,
    message: string,
    detail?: string | null,
  ): void {
    this.entries.push({
      id: this.nextId++,
      timestamp: new Date().toISOString(),
      level,
      message,
      detail: detail?.trim() || null,
    });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getEntries();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export const appLogger = new AppLogger();
