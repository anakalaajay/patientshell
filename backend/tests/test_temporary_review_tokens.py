from types import SimpleNamespace

import pytest
from fastapi import HTTPException, Request

from app.api.routes.doctor import _validate_temporary_token


class RpcResult:
    def __init__(self, data):
        self.data = data


class Rpc:
    def __init__(self, data):
        self.data = data
    def execute(self):
        return RpcResult(self.data)


class Client:
    def __init__(self, data):
        self.data = data
        self.args = None
    def rpc(self, name, args):
        self.args = (name, args)
        return Rpc(self.data)


def make_request():
    return Request({"type": "http", "method": "GET", "path": "/api/doctor/reviews/pkg",
                    "headers": [], "client": ("testclient", 123)})


@pytest.mark.parametrize("rpc_data", [None, [], False])
def test_expired_or_revoked_token_rejected_when_database_validator_returns_no_grant(monkeypatch, rpc_data):
    monkeypatch.setattr("app.api.routes.doctor.review_token_limiter.check", lambda _key: None)
    client = Client(rpc_data)
    with pytest.raises(HTTPException) as error:
        _validate_temporary_token("t" * 40, make_request(), {"id": "doctor-1"}, client, "package-1")
    assert error.value.status_code == 403
    assert "expired, revoked" in error.value.detail
    assert client.args[0] == "validate_doctor_review_token"
    assert client.args[1]["p_token_hash"] != "t" * 40


def test_token_validation_service_failure_is_reported_cleanly(monkeypatch):
    monkeypatch.setattr("app.api.routes.doctor.review_token_limiter.check", lambda _key: None)
    class BrokenClient:
        def rpc(self, *_args, **_kwargs):
            raise RuntimeError("database details should not leak")
    with pytest.raises(HTTPException) as error:
        _validate_temporary_token("t" * 40, make_request(), {"id": "doctor-1"}, BrokenClient(), "package-1")
    assert error.value.status_code == 503
    assert "unavailable" in error.value.detail
