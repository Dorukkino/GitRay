/** Errors the engine raises on purpose. Anything else is a bug. */

export class GitRayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidTarget extends GitRayError {}

export type GitHubErrorCode = "not_found" | "private" | "rate_limited" | "upstream";

export class GitHubError extends GitRayError {
  constructor(
    message: string,
    readonly code: GitHubErrorCode = "upstream",
  ) {
    super(message);
  }
}

export class ArchiveError extends GitRayError {}

/** A safety limit stopped the scan. Never an error for the user: the scan is partial. */
export class LimitExceeded extends GitRayError {
  constructor(
    readonly limit: string,
    readonly value: number,
    message: string,
  ) {
    super(message);
  }
}
