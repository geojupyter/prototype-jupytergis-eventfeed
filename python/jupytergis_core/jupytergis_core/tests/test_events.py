from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any, cast

import jsonschema
import pytest
import yaml
from jupyter_events.logger import EventLogger

from jupytergis_core.events import EVENT_SCHEMAS, register_event_schemas

if TYPE_CHECKING:
    from jupyter_server.serverapp import ServerApp

EVENTS_SCHEMA_NAMESPACE = "https://schema.jupytergis.org/events"
DOCUMENT_SCHEMA_ID = f"{EVENTS_SCHEMA_NAMESPACE}/document/v1"
LAYER_SCHEMA_ID = f"{EVENTS_SCHEMA_NAMESPACE}/layer/v1"
VIEWPORT_SCHEMA_ID = f"{EVENTS_SCHEMA_NAMESPACE}/viewport/v1"


def _fake_server_app(*, event_logger: EventLogger) -> ServerApp:
    return cast("ServerApp", SimpleNamespace(event_logger=event_logger))


def _make_logger() -> tuple[EventLogger, io.StringIO]:
    sink = io.StringIO()
    logger = EventLogger(handlers=[logging.StreamHandler(sink)])
    register_event_schemas(server_app=_fake_server_app(event_logger=logger))
    return logger, sink


@dataclass(frozen=True)
class EventSchemaCase:
    """A JupyterGIS event schema paired with one event that must validate against it."""

    id: str
    event: dict[str, Any]


EVENT_SCHEMA_CASES: tuple[EventSchemaCase, ...] = (
    EventSchemaCase(
        id=DOCUMENT_SCHEMA_ID,
        event={
            "subject": "42",
            "verb": "opened",
            "object": {
                "document_path": "example.jgis",
            },
        },
    ),
    EventSchemaCase(
        id=LAYER_SCHEMA_ID,
        event={
            "subject": "42",
            "verb": "added",
            "object": {
                "document_path": "earthquakes.jgis",
                "layer_id": "layer-1",
                "new": {
                    "type": "VectorLayer",
                    "name": "earthquakes",
                    "visible": True,
                    "parameters": {
                        "source": "source-1",
                        "opacity": 1,
                    },
                },
            },
        },
    ),
    EventSchemaCase(
        id=VIEWPORT_SCHEMA_ID,
        event={
            "subject": "42",
            "verb": "moved",
            "object": {
                "document_path": "example.jgis",
                "new": {
                    "coordinates": {"x": 260_000.0, "y": 6_250_000.0},
                    "zoom": 12,
                    "extent": [250_000.0, 6_240_000.0, 270_000.0, 6_260_000.0],
                },
            },
        },
    ),
)


def test_every_schema_file_has_a_case() -> None:
    schema_ids = {
        yaml.safe_load(schema_path.read_text())["$id"] for schema_path in EVENT_SCHEMAS
    }

    assert schema_ids == {case.id for case in EVENT_SCHEMA_CASES}


@pytest.mark.parametrize(
    ["event_schema_case"],
    [
        pytest.param(case, id=case.id.removeprefix(EVENTS_SCHEMA_NAMESPACE + "/"))
        for case in EVENT_SCHEMA_CASES
    ],
)
def test_valid_events_emit(event_schema_case: EventSchemaCase) -> None:
    logger, sink = _make_logger()
    logger.emit(schema_id=event_schema_case.id, data=event_schema_case.event)
    assert event_schema_case.id in sink.getvalue()


def test_invalid_document_event_is_rejected() -> None:
    logger, _ = _make_logger()
    with pytest.raises(jsonschema.ValidationError, match="is a required property"):
        logger.emit(schema_id=DOCUMENT_SCHEMA_ID, data={"verb": "banana"})
