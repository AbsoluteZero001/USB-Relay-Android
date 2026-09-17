import { Capacitor } from "@capacitor/core";

import type { SerialAdapter } from "./SerialAdapter";
import { AndroidSerialAdapter } from "./AndroidSerialAdapter";
import { ElectronSerialAdapter } from "./ElectronSerialAdapter";
import { WebSerialAdapter } from "./WebSerialAdapter";

export type SerialRuntime = "android" | "electron" | "web";

export function getSerialRuntime(): SerialRuntime {
  if (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "android"
  ) {
    return "android";
  }
  if (typeof window !== "undefined" && window.desktopAPI?.serial) {
    return "electron";
  }
  return "web";
}

/**
 * Returns the appropriate serial adapter for the current runtime.
 *
 * - Android: AndroidSerialAdapter (Capacitor USB Host plugin)
 * - Inside Electron: ElectronSerialAdapter (IPC → Node SerialPort)
 * - In a browser:    WebSerialAdapter (Web Serial API)
 */
export function createSerialAdapter(): SerialAdapter {
  const runtime = getSerialRuntime();
  if (runtime === "android") {
    return new AndroidSerialAdapter();
  }
  if (runtime === "electron") {
    return new ElectronSerialAdapter();
  }
  return new WebSerialAdapter();
}

export type { SerialAdapter, RequestableSerialAdapter } from "./SerialAdapter";
export { isRequestable } from "./SerialAdapter";
export type {
  SerialConnectionState,
  SerialOpenOptions,
  SerialPortInfo,
  SerialStatus,
  Parity,
  FlowControl,
} from "./types";
export { WebSerialAdapter } from "./WebSerialAdapter";
export { ElectronSerialAdapter } from "./ElectronSerialAdapter";
export { AndroidSerialAdapter } from "./AndroidSerialAdapter";
