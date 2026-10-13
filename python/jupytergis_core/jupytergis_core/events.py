from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from jupyter_server.serverapp import ServerApp

EVENT_SCHEMAS_DIR = Path(__file__).parent / "event_schemas"
EVENT_SCHEMAS = tuple(EVENT_SCHEMAS_DIR.glob("*.yaml"))


def register_event_schemas(*, server_app: ServerApp) -> None:
    """Register all JupyterGIS event schemas with the server's EventLogger."""
    event_logger = server_app.event_logger
    if event_logger is None:
        server_app.log.warning(
            "Server app has no event logger; JupyterGIS event schemas were not registered.",
        )
        return

    for schema_path in sorted(EVENT_SCHEMAS):
        event_logger.register_event_schema(schema_path)
