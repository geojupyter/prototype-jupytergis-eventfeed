# JupyterGIS event feed reference consumer

Subscribes to the Jupyter Server event websocket feed, filters for and prints only
JupyterGIS GUI events.

## Run

```bash
export JUPYTER_BASE_URL=localhost:8888     # host:port
export JUPYTER_TOKEN=<your server token>   # from `jupyter server list`
uv run consumer.py
```

Then open a `.jGIS` document in JupyterLab.
An event with schema ID `https://schema.jupytergis.org/events/document/v1` and `verb:
"opened"` should print.
Close the document and a `verb: "closed"` event should print.
