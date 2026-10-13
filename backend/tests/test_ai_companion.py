from app.services.ai_companion import UNCONFIGURED_MESSAGE, explain_document


def test_unconfigured_fallback_is_truthful_and_never_calls_provider(monkeypatch):
    monkeypatch.delenv("AI_PROVIDER_API_KEY", raising=False)
    monkeypatch.delenv("AI_MODEL_NAME", raising=False)
    result = explain_document(
        document={"id": "doc-1", "file_name": "report.pdf"},
        entities=[{"id": "entity-1", "extracted_data": {"entity_type": "lab_result", "value": "5.1"}}],
    )
    assert result["configured"] is False
    assert result["message"] == UNCONFIGURED_MESSAGE
    assert result["explanation"] is None
    assert result["extracted_document_facts"][0]["value"] == "5.1"
    assert result["source_references"][0]["document_id"] == "doc-1"
