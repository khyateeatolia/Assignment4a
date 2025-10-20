// mock-services.ts

import { EventBus } from "./ItemListingConcept.ts";

/**
 * Mock implementation of an EventBus for testing purposes.
 * It stores all emitted events in an array for later inspection.
 */
export class MockEventBus implements EventBus {
  public emittedEvents: Array<{ eventName: string; payload: any }> = [];

  emit<T>(eventName: string, payload: T): void {
    this.emittedEvents.push({ eventName, payload });
  }

  /**
   * Clears all recorded events.
   */
  clearEvents(): void {
    this.emittedEvents = [];
  }

  /**
   * Retrieves all events emitted with a specific name.
   * @param eventName The name of the event to filter by.
   * @returns An array of events matching the given name.
   */
  getEventsByName<T>(eventName: string): Array<{ eventName: string; payload: T }> {
    return this.emittedEvents.filter((event) => event.eventName === eventName) as Array<{ eventName: string; payload: T }>;
  }
}

// Below are example mock services. While ItemListingConcept performs its own validation internally,
// these demonstrate how other external services could be mocked if needed.

/**
 * Mock Configuration Service.
 * Can be used to inject test-specific configuration values (e.g., database names, API keys).
 */
export class MockConfigService {
  private config: Map<string, any>;

  constructor(initialConfig: { [key: string]: any } = {}) {
    this.config = new Map(Object.entries(initialConfig));
  }

  get<T>(key: string, defaultValue?: T): T {
    if (this.config.has(key)) {
      return this.config.get(key);
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Configuration key "${key}" not found and no default value provided.`);
  }

  set(key: string, value: any): void {
    this.config.set(key, value);
  }
}

/**
 * Mock External Validation Service.
 * Could simulate external APIs for advanced content moderation, image validation, etc.
 * Currently not directly integrated into ItemListingConcept but shown for context.
 */
export class MockValidationService {
  /**
   * Simulates validation of a URL.
   * @param url The URL string to validate.
   * @returns True if the URL is considered valid by the mock, false otherwise.
   */
  isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return url.startsWith("http"); // Simple check for http(s) protocol
    } catch {
      return false;
    }
  }

  /**
   * Simulates validation of a tag.
   * @param tag The tag string to validate.
   * @returns True if the tag is considered valid, false otherwise.
   */
  isValidTag(tag: string): boolean {
    return tag.trim().length > 0 && tag.trim().length <= 50; // Example validation
  }
}
