// src/concepts/UserAccount/UserAccountErrors.ts
// These would typically extend a base error class or Deno's native Error.

export class UserAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserAccountError";
  }
}

export class AuthenticationFailedError extends UserAccountError {
  constructor(message: string = "Authentication failed.") {
    super(message);
    this.name = "AuthenticationFailedError";
  }
}

export class SessionNotFoundError extends UserAccountError {
  constructor(message: string = "Session not found or invalid.") {
    super(message);
    this.name = "SessionNotFoundError";
  }
}

export class InvalidSessionError extends UserAccountError {
  constructor(message: string = "Session is invalid or expired.") {
    super(message);
    this.name = "InvalidSessionError";
  }
}

export class UsernameTakenError extends UserAccountError {
  constructor(message: string = "Username is already taken.") {
    super(message);
    this.name = "UsernameTakenError";
  }
}

export class UserNotFoundError extends UserAccountError {
  constructor(message: string = "User not found.") {
    super(message);
    this.name = "UserNotFoundError";
  }
}

export class InvalidCredentialsError extends UserAccountError {
  constructor(message: string = "Invalid credentials.") {
    super(message);
    this.name = "InvalidCredentialsError";
  }
}

export class BioTooLongError extends UserAccountError {
  constructor(message: string = "Bio exceeds maximum allowed length.") {
    super(message);
    this.name = "BioTooLongError";
  }
}

export class PasswordTooShortError extends UserAccountError {
  constructor(message: string = "Password is too short.") {
    super(message);
    this.name = "PasswordTooShortError";
  }
}
