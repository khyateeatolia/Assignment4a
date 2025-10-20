// src/concepts/UserAccount/mock-services.ts

import { SSOValidationService, EventBus, UserAccountConfig } from "./UserAccountConcept.ts";

// Type for SSO token mappings used by MockSSOValidationService
export type SsoMapping = Record<string, string | null>;

/**
 * Mock implementation of SSOValidationService.
 * Uses a predefined mapping of SSO provider + token combinations to email addresses.
 */
export class MockSSOValidationService implements SSOValidationService {
  private mappings: SsoMapping;

  constructor(mappings: SsoMapping) {
    this.mappings = mappings;
  }

  async validateToken(
    ssoProvider: string,
    ssoToken: string,
  ): Promise<{
    ssoId: string;
    email: string;
    username: string;
    avatarUrl?: string;
  }> {
    const key = `${ssoProvider}_${ssoToken}`;
    const ssoId = this.mappings[key];
    if (!ssoId) {
      throw new Error("Invalid SSO token");
    }
    return Promise.resolve({
      ssoId,
      email: ssoId,
      username: ssoId.split('@')[0],
      avatarUrl: `https://example.com/avatars/${ssoId.split('@')[0]}.jpg`
    });
  }
}

/**
 * Mock implementation of EventBus.
 * Records all emitted events for verification in tests.
 */
export class MockEventBus implements EventBus {
  public emittedEvents: Array<{ eventName: string; payload: any }> = [];

  emit(event: "UserRegistered", data: any): void;
  emit(event: "UserLoggedIn", data: any): void;
  emit(event: "UserLoggedOut", data: any): void;
  emit(event: "UserDeleted", data: any): void;
  emit(event: "ProfileUpdated", data: any): void;
  emit(event: string, data: any): void {
    this.emittedEvents.push({ eventName: event, payload: data });
    // console.log(`[MockEventBus] Emitted: ${event}`, data); // Uncomment for debugging
  }
}

/**
 * Mock implementation of UserAccountConfig.
 * Provides fixed configuration values for testing.
 */
export const mockUserAccountConfig: UserAccountConfig = {
  SESSION_DURATION_HOURS: 24,
  MAX_SESSIONS_PER_USER: 5,
  PASSWORD_MIN_LENGTH: 8,
  BIO_MAX_LENGTH: 200,
};
