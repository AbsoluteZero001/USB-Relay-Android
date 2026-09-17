import { Capacitor } from "@capacitor/core";

import {
  AndroidUsbError,
  isAndroidUsbErrorCode,
  type AndroidUsbErrorCode,
} from "../errors";
import { appLogger } from "../logger";
import type {
  RequestableSerialAdapter,
} from "./SerialAdapter";
import type {
  SerialConnectionState,
  SerialOpenOptions,
  SerialPortInfo,
  SerialStatus,
} from "./types";
import {
  UsbRelay,
  type NativeSerialStatus,
  type NativeUsbDevice,
} from "./UsbRelayPlugin";

const CH340_VENDOR_ID = "1A86";
const CH340_PRODUCT_ID = "7523";

function toHex4(value: number): string {
  return value.toString(16).toUpperCase().padStart(4, "0");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function describeDevice(device: NativeUsbDevice): string {
  if (device.vendorId === CH340_VENDOR_ID) {
    return device.productId === CH340_PRODUCT_ID
      ? "USB-SERIAL CH340"
      : `CH340 ${device.productName ?? "USB Serial"}`;
  }
  if (device.driverName) {
    return device.productName
      ? `${device.productName} (${device.driverName})`
      : `${device.driverName} USB Serial`;
  }
  return "不支持的 USB 串口设备";
}

function toPortInfo(device: NativeUsbDevice): SerialPortInfo {
  const description = describeDevice(device);
  return {
    port: device.deviceId,
    device: `${device.deviceId} · ${description}`,
    description,
    manufacturer: device.manufacturer,
    hwid: `USB\\VID_${device.vendorId}&PID_${device.productId}`,
    vendorId: device.vendorId,
    productId: device.productId,
    serialNumber: device.serialNumber,
    is_current: false,
  };
}

function normalizePluginError(
  error: unknown,
  fallbackCode: AndroidUsbErrorCode,
): AndroidUsbError {
  if (error instanceof AndroidUsbError) {
    return error;
  }

  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;
  const nestedData =
    record?.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : null;
  const candidateCode =
    record?.code ?? nestedData?.code ?? record?.errorCode;
  const code = isAndroidUsbErrorCode(candidateCode)
    ? candidateCode
    : fallbackCode;
  const detail =
    typeof record?.message === "string"
      ? record.message
      : typeof nestedData?.detail === "string"
        ? nestedData.detail
        : typeof error === "string"
          ? error
          : null;

  return new AndroidUsbError(code, detail);
}

function nativeStateToSerialState(
  state: NativeSerialStatus["state"],
): SerialConnectionState {
  return state;
}

export class AndroidSerialAdapter implements RequestableSerialAdapter {
  readonly name = "AndroidUsbSerial";

  private state: SerialConnectionState = "disconnected";
  private currentDevice: NativeUsbDevice | null = null;
  private baudRate = 9600;
  private errorCode: string | null = null;
  private errorDetail: string | null = null;
  private dataListeners = new Set<(data: Uint8Array) => void>();
  private statusListeners = new Set<(status: SerialStatus) => void>();
  private listenerRegistration: Promise<void> | null = null;
  private lastDeviceSignature: string | null = null;

  isSupported(): boolean {
    return (
      Capacitor.isNativePlatform() &&
      Capacitor.getPlatform() === "android"
    );
  }

  async listPorts(): Promise<SerialPortInfo[]> {
    this.ensureSupported();
    try {
      const { devices } = await UsbRelay.getDevices();
      const ch340Count = devices.filter(
        (device) =>
          device.vendorId === CH340_VENDOR_ID &&
          device.productId === CH340_PRODUCT_ID,
      ).length;
      const signature = devices
        .map((device) => `${device.deviceId}:${device.vendorId}:${device.productId}`)
        .sort()
        .join("|");
      if (signature !== this.lastDeviceSignature) {
        this.lastDeviceSignature = signature;
        appLogger.info(
          `扫描 USB 完成，发现 ${devices.length} 个设备`,
          ch340Count > 0 ? `检测到 ${ch340Count} 个 CH340 串口` : null,
        );
      }
      return devices.map((device) => ({
        ...toPortInfo(device),
        is_current: device.deviceId === this.currentDevice?.deviceId,
      }));
    } catch (error) {
      const normalized = normalizePluginError(error, "USB_DEVICE_NOT_FOUND");
      this.fail(normalized);
      throw normalized;
    }
  }

  async requestPort(): Promise<SerialPortInfo> {
    const ports = await this.listPorts();
    if (ports.length === 0) {
      const error = new AndroidUsbError(
        "USB_DEVICE_NOT_FOUND",
        "UsbManager.deviceList 为空",
      );
      this.fail(error);
      throw error;
    }
    const preferred =
      ports.find(
        (port) =>
          port.vendorId === CH340_VENDOR_ID &&
          port.productId === CH340_PRODUCT_ID,
      ) ?? ports[0];
    await this.requestPermission(preferred.port);
    return preferred;
  }

  async requestPermission(deviceId?: string): Promise<boolean> {
    this.ensureSupported();
    this.state = "waiting_permission";
    this.errorCode = null;
    this.errorDetail = null;
    this.emitStatus();
    appLogger.info("请求 Android USB 权限", deviceId ?? null);

    try {
      const result = await UsbRelay.requestPermission({ deviceId });
      if (!result.granted) {
        const error = new AndroidUsbError(
          "USB_PERMISSION_DENIED",
          `deviceId=${result.deviceId}`,
        );
        this.fail(error);
        appLogger.warning(error.message, error.detail);
        throw error;
      }
      this.state = "disconnected";
      this.emitStatus();
      appLogger.success("USB 权限已通过", result.deviceId);
      return true;
    } catch (error) {
      const normalized = normalizePluginError(
        error,
        "USB_PERMISSION_DENIED",
      );
      this.fail(normalized);
      appLogger.error(normalized.message, normalized.detail);
      throw normalized;
    }
  }

  async connect(
    portId: string,
    options: SerialOpenOptions,
  ): Promise<void> {
    this.ensureSupported();
    this.state = "connecting";
    this.errorCode = null;
    this.errorDetail = null;
    this.emitStatus();

    try {
      await this.requestPermission(portId);

      const ports = await this.listPorts();
      const device = ports.find((port) => port.port === portId);
      if (!device) {
        throw new AndroidUsbError(
          "USB_DEVICE_NOT_FOUND",
          `deviceId=${portId}`,
        );
      }

      await UsbRelay.open({
        deviceId: portId,
        baudRate: options.baudRate,
        dataBits: options.dataBits,
        stopBits: options.stopBits,
        parity: options.parity,
        flowControl: options.flowControl ?? "none",
      });

      this.currentDevice = {
        deviceId: device.port,
        vendorId: device.vendorId ?? "0000",
        productId: device.productId ?? "0000",
        manufacturer: device.manufacturer,
        productName: device.description,
        serialNumber: device.serialNumber,
        driverName: null,
        portCount: 1,
        supported: true,
      };
      this.baudRate = options.baudRate;
      this.state = "connected";
      this.emitStatus();
      appLogger.success(
        `串口已连接，波特率 ${options.baudRate}`,
        `${device.description} · ${device.port}`,
      );
    } catch (error) {
      const normalized = normalizePluginError(error, "SERIAL_OPEN_FAILED");
      this.fail(normalized);
      appLogger.error("串口打开失败", normalized.detail ?? normalized.message);
      throw normalized;
    }
  }

  async disconnect(): Promise<void> {
    const wasConnected = this.state === "connected";
    try {
      await UsbRelay.close();
    } catch (error) {
      const normalized = normalizePluginError(error, "USB_OPEN_FAILED");
      appLogger.warning("关闭串口时发生错误", normalized.detail);
    } finally {
      this.currentDevice = null;
      this.state = "disconnected";
      this.errorCode = null;
      this.errorDetail = null;
      this.emitStatus();
      if (wasConnected) {
        appLogger.info("USB 串口已关闭");
      }
    }
  }

  async send(data: Uint8Array): Promise<void> {
    if (this.state !== "connected" || !this.currentDevice) {
      throw new AndroidUsbError(
        "SERIAL_DEVICE_DISCONNECTED",
        "串口尚未连接",
      );
    }

    try {
      await UsbRelay.write({ dataBase64: bytesToBase64(data) });
    } catch (error) {
      const normalized = normalizePluginError(error, "SERIAL_WRITE_FAILED");
      this.fail(normalized);
      appLogger.error(normalized.message, normalized.detail);
      throw normalized;
    }
  }

  onData(callback: (data: Uint8Array) => void): () => void {
    this.dataListeners.add(callback);
    void this.ensureNativeListeners();
    return () => this.dataListeners.delete(callback);
  }

  onStatusChange(callback: (status: SerialStatus) => void): () => void {
    this.statusListeners.add(callback);
    void this.ensureNativeListeners();
    return () => this.statusListeners.delete(callback);
  }

  getStatus(): SerialStatus {
    const connected = this.state === "connected" && !!this.currentDevice;
    return {
      state: this.state,
      port: connected ? this.currentDevice?.deviceId ?? null : null,
      device: connected ? this.currentDevice?.deviceId ?? null : null,
      baudrate: this.baudRate,
      connected,
      error_code: this.errorCode,
      detail: this.errorDetail,
    };
  }

  private ensureSupported(): void {
    if (!this.isSupported()) {
      throw new AndroidUsbError(
        "USB_NOT_SUPPORTED",
        `${Capacitor.getPlatform()} is not Android`,
      );
    }
  }

  private ensureNativeListeners(): Promise<void> {
    if (this.listenerRegistration) {
      return this.listenerRegistration;
    }

    this.listenerRegistration = Promise.all([
      UsbRelay.addListener("data", ({ dataBase64 }) => {
        try {
          const bytes = base64ToBytes(dataBase64);
          for (const listener of this.dataListeners) {
            listener(bytes);
          }
        } catch (error) {
          appLogger.warning(
            "串口返回数据解析失败",
            error instanceof Error ? error.message : String(error),
          );
        }
      }),
      UsbRelay.addListener("statusChange", (status) => {
        this.applyNativeStatus(status);
      }),
      UsbRelay.addListener("deviceAttached", ({ device }) => {
        appLogger.info(
          "检测到 USB 设备插入",
          `${device.vendorId}:${device.productId}`,
        );
      }),
      UsbRelay.addListener("deviceDetached", ({ device }) => {
        appLogger.warning(
          device.vendorId === CH340_VENDOR_ID
            ? "CH340 已拔出"
            : "USB 串口设备已拔出",
          `${device.vendorId}:${device.productId}`,
        );
        if (this.currentDevice?.deviceId === device.deviceId) {
          this.currentDevice = null;
          this.state = "error";
          this.errorCode = "SERIAL_DEVICE_DISCONNECTED";
          this.errorDetail = "USB 串口设备已拔出";
          this.emitStatus();
        }
      }),
    ]).then(() => undefined);

    return this.listenerRegistration;
  }

  private applyNativeStatus(status: NativeSerialStatus): void {
    this.state = nativeStateToSerialState(status.state);
    this.baudRate = status.baudRate || this.baudRate;
    this.errorCode = status.errorCode;
    this.errorDetail = status.detail;
    if (status.state === "disconnected" || status.state === "error") {
      this.currentDevice = null;
    }
    this.emitStatus();
  }

  private fail(error: AndroidUsbError): void {
    this.state = "error";
    this.errorCode = error.code;
    this.errorDetail = error.detail ?? error.message;
    if (
      error.code === "SERIAL_DEVICE_DISCONNECTED" ||
      error.code === "USB_DEVICE_NOT_FOUND"
    ) {
      this.currentDevice = null;
    }
    this.emitStatus();
  }

  private emitStatus(): void {
    const status = this.getStatus();
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}
