# /// script
# dependencies = ["websockets"]
# ///

"""Minimal Reference consumer of the JupyterGIS GUI event feed.

Subscribes to the Jupyter Server event feed and prints JupyterGIS events.
"""

import asyncio
import json
import os

import websockets

# TODO: Import this from installed (dev?) version of JupyterGIS
# (`jupytergis_core.events:EVENT_SCHEMA_PREFIX`)
EVENT_SCHEMA_PREFIX = "https://schema.jupytergis.org/"


async def stream_events(*, base_url: str, token: str) -> None:
    uri = f"ws://{base_url}/api/events/subscribe?token={token}"
    async with websockets.connect(uri) as websocket:
        print(f"Subscribed to {uri}")
        async for message in websocket:
            event = json.loads(message)
            schema_id = event.get("schema_id", "")
            if not schema_id.startswith(EVENT_SCHEMA_PREFIX):
                continue
            obj = event.get("object", {})
            print(json.dumps(event, indent=2))
            print()


if __name__ == "__main__":
    asyncio.run(
        stream_events(
            base_url=os.environ.get("JUPYTER_BASE_URL", "localhost:8888"),
            token=os.environ["JUPYTER_TOKEN"],
        )
    )
