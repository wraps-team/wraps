/**
 * Telemetry configuration management
 * @module telemetry/config
 */

import Conf from "conf";
import { v4 as uuidv4 } from "uuid";
import type { TelemetryConfig } from "./types.js";

const CONFIG_DEFAULTS: TelemetryConfig = {
  enabled: true,
  anonymousId: uuidv4(),
  notificationShown: false,
};

/**
 * Manages telemetry configuration stored locally
 *
 * Configuration is stored in platform-specific locations:
 * - macOS: ~/Library/Preferences/wraps/telemetry.json
 * - Linux: ~/.config/wraps/telemetry.json
 * - Windows: %APPDATA%\wraps\Config\telemetry.json
 *
 * @example
 * ```typescript
 * const config = new TelemetryConfigManager();
 *
 * if (config.isEnabled()) {
 *   console.log('Telemetry is enabled');
 * }
 *
 * config.setEnabled(false);
 * ```
 */
export class TelemetryConfigManager {
  private readonly config: Conf<TelemetryConfig>;

  constructor() {
    this.config = new Conf<TelemetryConfig>({
      projectName: "wraps",
      configName: "telemetry",
      defaults: CONFIG_DEFAULTS,
    });
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return this.config.get("enabled");
  }

  /**
   * Enable or disable telemetry
   */
  setEnabled(enabled: boolean): void {
    this.config.set("enabled", enabled);
  }

  /**
   * Get the anonymous user ID
   */
  getAnonymousId(): string {
    return this.config.get("anonymousId");
  }

  /**
   * Check if the first-run notification has been shown
   */
  hasShownNotification(): boolean {
    return this.config.get("notificationShown");
  }

  /**
   * Mark the first-run notification as shown
   */
  markNotificationShown(): void {
    this.config.set("notificationShown", true);
  }

  /**
   * Get the full path to the configuration file
   */
  getConfigPath(): string {
    return this.config.path;
  }

  /**
   * Reset configuration to defaults
   */
  reset(): void {
    this.config.clear();
    // Set new defaults with fresh UUID
    this.config.set({
      ...CONFIG_DEFAULTS,
      anonymousId: uuidv4(),
    });
  }
}
