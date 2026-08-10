import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { safeStorage } from "electron";

export function loadDeviceId(userDataPath: string): string {
  const path = join(userDataPath, "device-id.txt");
  try {
    const existing = readFileSync(path, "utf8").trim();
    if (/^[0-9a-f-]{36}$/i.test(existing)) return existing;
  } catch {
    // A missing or invalid identity is replaced atomically.
  }
  mkdirSync(dirname(path), { recursive: true });
  const value = randomUUID();
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, value, "utf8");
  renameSync(temporary, path);
  return value;
}

export class EncryptedSessionStorage {
  private readonly path: string;

  constructor(userDataPath: string) {
    this.path = join(userDataPath, "auth-session.bin");
  }

  async getItem(key: string): Promise<string | null> {
    const values = this.readValues();
    return values[key] ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    const values = this.readValues();
    values[key] = value;
    this.writeValues(values);
  }

  async removeItem(key: string): Promise<void> {
    const values = this.readValues();
    delete values[key];
    this.writeValues(values);
  }

  clear(): void {
    if (!safeStorage.isEncryptionAvailable()) return;
    this.writeValues({});
  }

  private readValues(): Record<string, string> {
    if (!existsSync(this.path)) return {};
    if (!safeStorage.isEncryptionAvailable())
      throw new Error("Windows 安全存储不可用，无法读取登录会话");
    try {
      const decrypted = safeStorage.decryptString(readFileSync(this.path));
      const parsed = JSON.parse(decrypted) as unknown;
      if (!parsed || typeof parsed !== "object") return {};
      return parsed as Record<string, string>;
    } catch {
      throw new Error("登录会话无法解密，请重新登录");
    }
  }

  private writeValues(values: Record<string, string>): void {
    if (!safeStorage.isEncryptionAvailable())
      throw new Error("Windows 安全存储不可用，无法保存登录会话");
    mkdirSync(dirname(this.path), { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(values));
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, encrypted);
    renameSync(temporary, this.path);
  }
}
