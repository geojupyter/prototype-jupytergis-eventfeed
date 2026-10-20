import {
  IJupyterGISDocTracker,
  IJupyterGISModel,
  IJupyterGISTracker,
  IJupyterGISWidget,
} from '@jupytergis/schema';
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from '@jupyterlab/application';
import type { Event } from '@jupyterlab/services';
import type { JSONObject } from '@lumino/coreutils';

const DOCUMENT_SCHEMA = 'https://schema.jupytergis.org/events/document/v1';
const LAYER_SCHEMA = 'https://schema.jupytergis.org/events/layer/v1';

export const eventFeedPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupytergis:core:event-feed',
  autoStart: true,
  requires: [IJupyterGISDocTracker],
  activate: (app: JupyterFrontEnd, tracker: IJupyterGISTracker): void => {
    const events = app.serviceManager.events;
    const wiredModels = new WeakSet<IJupyterGISModel>();

    const emit = (request: Event.Request): void => {
      events.emit(request).catch((error: unknown) => {
        console.warn('[jupytergis event-feed] failed to emit event', error);
      });
    };

    const wireJupyterGISEvents = (widget: IJupyterGISWidget): void => {
      // Two widgets can share the same model. We only want to connect these
      // handlers once per document
      if (wiredModels.has(widget.model)) {
        return;
      }

      wiredModels.add(widget.model);

      const documentPath = widget.model.filePath || null;
      const subject = String(widget.model.getClientId());

      emit({
        schema_id: DOCUMENT_SCHEMA,
        version: '1',
        data: {
          subject,
          verb: 'opened',
          object: { document_path: documentPath },
        },
      });

      widget.disposed.connect(() => {
        emit({
          schema_id: DOCUMENT_SCHEMA,
          version: '1',
          data: {
            subject,
            verb: 'closed',
            object: { document_path: documentPath },
          },
        });
      });

      // When the document loads, all the existing layers come through as
      // 'added' events (among other events). Connecting before the document
      // loads results in a bunch of "added" spam as those signals fire. We
      // only care about the events triggered by the user intentionally, so we
      // wait until the document's initial sync is complete to wire these
      // signals.
      void widget.model.sharedModel.initialSyncReady.then(() => {
        widget.model.sharedLayersChanged.connect((_, change) => {
          for (const { id, oldValue, newValue } of change.layerChange ?? []) {
            const verb = !oldValue ? 'added' : !newValue ? 'removed' : 'updated';

            emit({
              schema_id: LAYER_SCHEMA,
              version: '1',
              data: {
                subject,
                verb,
                object: {
                  document_path: documentPath,
                  layer_id: id,
                  ...(oldValue ? { old: oldValue as unknown as JSONObject } : {}),  // TODO: Better typing
                  ...(newValue ? { new: newValue as unknown as JSONObject } : {}),  // TODO: Better typing
                },
              },
            });
          }
        });
      });


    };

    tracker.forEach(wireJupyterGISEvents);
    tracker.widgetAdded.connect((_, widget) => wireJupyterGISEvents(widget));
  },
};
