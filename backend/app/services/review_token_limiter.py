"""Rate-limit abstraction for temporary review-token validation.

The in-memory implementation is suitable for one process and tests. Deployments
with multiple workers should inject a shared Redis/database implementation.
"""
from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque
from typing import Protocol


class RateLimitExceeded(Exception):
    """Raised when a caller exceeds the configured sliding-window limit."""


class RateLimiter(Protocol):
    def check(self, key: str) -> None: ...


class InMemorySlidingWindowRateLimiter:
    def __init__(self, limit: int = 8, window_seconds: int = 60) -> None:
        if limit < 1 or window_seconds < 1:
            raise ValueError("Rate limit and window must be positive.")
        self.limit = limit
        self.window_seconds = window_seconds
        self._attempts: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            attempts = self._attempts[key]
            while attempts and now - attempts[0] >= self.window_seconds:
                attempts.popleft()
            if len(attempts) >= self.limit:
                raise RateLimitExceeded("Too many review-token attempts. Try again in one minute.")
            attempts.append(now)


review_token_limiter: RateLimiter = InMemorySlidingWindowRateLimiter(
    limit=max(1, int(os.getenv("REVIEW_TOKEN_ATTEMPTS_PER_MINUTE", "8"))),
)
