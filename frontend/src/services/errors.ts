// Service errors shared by Web and Electron versions.

export class ServiceError extends Error {
  code = "SERVICE_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "ServiceError";
  }
}

export const ANDROID_USB_ERROR_CODES = [
  "USB_NOT_SUPPORTED",
  "USB_DEVICE_NOT_FOUND",
  "USB_PERMISSION_DENIED",
  "USB_PERMISSION_REQUIRED",
  "USB_OPEN_FAILED",
  "SERIAL_DRIVER_NOT_FOUND",
  "SERIAL_OPEN_FAILED",
  "SERIAL_WRITE_FAILED",
  "SERIAL_DEVICE_DISCONNECTED",
  "INVALID_SERIAL_CONFIG",
  "UNKNOWN_USB_ERROR",
] as const;

export type AndroidUsbErrorCode = (typeof ANDROID_USB_ERROR_CODES)[number];

const ANDROID_USB_ERROR_MESSAGES: Record<AndroidUsbErrorCode, string> = {
  USB_NOT_SUPPORTED: "当前设备不支持 Android USB Host",
  USB_DEVICE_NOT_FOUND: "未发现 USB 串口设备",
  USB_PERMISSION_DENIED: "USB 设备权限被拒绝",
  USB_PERMISSION_REQUIRED: "需要 USB 设备权限，请重新授权",
  USB_OPEN_FAILED: "USB 设备打开失败",
  SERIAL_DRIVER_NOT_FOUND: "当前 USB 设备没有可用的串口驱动",
  SERIAL_OPEN_FAILED: "串口打开失败",
  SERIAL_WRITE_FAILED: "继电器指令发送失败",
  SERIAL_DEVICE_DISCONNECTED: "USB 串口设备已拔出",
  INVALID_SERIAL_CONFIG: "串口参数不受当前 USB 设备支持",
  UNKNOWN_USB_ERROR: "Android USB 操作失败",
};

export function isAndroidUsbErrorCode(
  value: unknown,
): value is AndroidUsbErrorCode {
  return (
    typeof value === "string" &&
    (ANDROID_USB_ERROR_CODES as readonly string[]).includes(value)
  );
}

export function getAndroidUsbErrorMessage(
  code: AndroidUsbErrorCode,
): string {
  return ANDROID_USB_ERROR_MESSAGES[code];
}

export class AndroidUsbError extends ServiceError {
  readonly detail: string | null;

  constructor(
    code: AndroidUsbErrorCode,
    detail?: string | null,
  ) {
    super(ANDROID_USB_ERROR_MESSAGES[code]);
    this.name = "AndroidUsbError";
    this.code = code;
    this.detail = detail?.trim() || null;
  }
}

export class WebSerialUnsupportedError extends ServiceError {
  code = "WEB_SERIAL_UNSUPPORTED";
  constructor() {
    super(
      "当前浏览器不支持 Web Serial API，请使用 Chrome 或 Edge (89+) 并通过 https 或 localhost 访问",
    );
    this.name = "WebSerialUnsupportedError";
  }
}

export class SerialPortNotFoundError extends ServiceError {
  code = "SERIAL_PORT_NOT_FOUND";
  constructor(message: string) {
    super(message);
    this.name = "SerialPortNotFoundError";
  }
}

export class PortBusyError extends ServiceError {
  code = "SERIAL_PORT_BUSY";
  constructor(message: string) {
    super(message);
    this.name = "PortBusyError";
  }
}

export class SerialConnectionError extends ServiceError {
  code = "SERIAL_CONNECTION_FAILED";
  constructor(message: string) {
    super(message);
    this.name = "SerialConnectionError";
  }
}

export class SerialNotConnectedError extends ServiceError {
  code = "SERIAL_NOT_CONNECTED";
  constructor(message: string) {
    super(message);
    this.name = "SerialNotConnectedError";
  }
}

export class SerialWriteError extends ServiceError {
  code = "SERIAL_WRITE_FAILED";
  constructor(message: string) {
    super(message);
    this.name = "SerialWriteError";
  }
}

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof ServiceError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "发生未知错误";
}

export function getApiErrorCode(error: unknown): string | null {
  if (error instanceof ServiceError) {
    return error.code;
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}
