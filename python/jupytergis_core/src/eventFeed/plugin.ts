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

const DOCUMENT_SCHEMA = 'https://schema.jupytergis.org/events/document/v1';

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

    const wireDocumentEvents = (widget: IJupyterGISWidget): void => {
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
    };

    tracker.forEach(wireDocumentEvents);
    tracker.widgetAdded.connect((_, widget) => wireDocumentEvents(widget));
  },
};
