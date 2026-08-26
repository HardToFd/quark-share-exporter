import type { DesktopBridge } from './shared/types/desktop'

declare global {
  interface Window {
    quarkApp: DesktopBridge
  }
}

export {}
