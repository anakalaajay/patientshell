import pytest

from app.services.review_token_limiter import InMemorySlidingWindowRateLimiter, RateLimitExceeded


def test_sliding_window_allows_limit_then_returns_clean_error():
    limiter = InMemorySlidingWindowRateLimiter(limit=2, window_seconds=60)
    limiter.check("doctor:client")
    limiter.check("doctor:client")
    with pytest.raises(RateLimitExceeded, match="Try again"):
        limiter.check("doctor:client")


def test_rate_limits_are_scoped_by_key():
    limiter = InMemorySlidingWindowRateLimiter(limit=1, window_seconds=60)
    limiter.check("doctor-a:client")
    limiter.check("doctor-b:client")
    with pytest.raises(RateLimitExceeded):
        limiter.check("doctor-a:client")
