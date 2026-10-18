import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Saved password is encrypted with the OS keychain (DPAPI on Windows) via safeStorage.
const file = (): string => join(app.getPath('userData'), 'credentials.bin')

export function savePassword(password: string): void {
  if (!safeStorage.isEncryptionAvailable()) return
  writeFileSync(file(), safeStorage.encryptString(password))
}

export function loadPassword(): string {
  try {
    if (existsSync(file()) && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(readFileSync(file()))
    }
  } catch {
    // Unreadable (e.g. copied from another machine) – treat as no saved password.
  }
  return ''
}

export function clearPassword(): void {
  rmSync(file(), { force: true })
}
