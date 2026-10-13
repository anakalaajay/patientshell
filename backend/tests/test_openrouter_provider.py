import json
from io import BytesIO

from app.services import ai_companion


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


def test_openrouter_uses_compatible_endpoint_and_configured_free_router(monkeypatch):
    captured = {}
    monkeypatch.setenv("AI_BASE_URL", "")
    monkeypatch.setenv("OPENROUTER_SITE_URL", "https://patientshell.example")
    monkeypatch.setenv("OPENROUTER_APP_NAME", "Patientshell Dr. Anya")

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["headers"] = dict(request.header_items())
        captured["body"] = json.loads(request.data.decode("utf-8"))
        captured["timeout"] = timeout
        return FakeResponse({"choices": [{"message": {"content": "{\\"ok\\": true}"}}]})

    monkeypatch.setattr(ai_companion, "urlopen", fake_urlopen)
    result = ai_companion._provider_completion(
        "openrouter", "test-secret", "openrouter/free", '{"prompt":"test"}'
    )

    assert result == '{"ok": true}'
    assert captured["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert captured["body"]["model"] == "openrouter/free"
    assert captured["body"]["response_format"] == {"type": "json_object"}
    assert captured["headers"]["Authorization"] == "Bearer test-secret"
    assert captured["headers"]["Http-referer"] == "https://patientshell.example"
    assert captured["headers"]["X-title"] == "Patientshell Dr. Anya"
    assert captured["timeout"] == 25


def test_openrouter_defaults_to_official_base_url(monkeypatch):
    captured = {}
    monkeypatch.delenv("AI_BASE_URL", raising=False)
    monkeypatch.delenv("OPENROUTER_SITE_URL", raising=False)
    monkeypatch.delenv("OPENROUTER_APP_NAME", raising=False)

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        return FakeResponse({"choices": [{"message": {"content": "hello"}}]})

    monkeypatch.setattr(ai_companion, "urlopen", fake_urlopen)
    assert ai_companion._provider_completion(
        "openrouter", "test-secret", "openrouter/free", "prompt"
    ) == "hello"
    assert captured["url"] == "https://openrouter.ai/api/v1/chat/completions"
