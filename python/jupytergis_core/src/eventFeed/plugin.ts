import {
  IJupyterGISDocTracker,
  IJupyterGISModel,
  IJupyterGISTracker,
  IJupyterGISWidget,
  IViewPortState,
} from '@jupytergis/schema';
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from '@jupyterlab/application';
import type { Event } from '@jupyterlab/services';
import type { JSONObject } from '@lumino/coreutils';

interface IEventWiringProps {
  widget: IJupyterGISWidget;
  clientId: string;
  emit: (request: Event.Request) => void;
}

const wireDocumentEvents = (
  {widget, clientId, emit}: IEventWiringProps,
): void => {
  const DOCUMENT_SCHEMA = 'https://schema.jupytergis.org/events/document/v1';

  emit({
    schema_id: DOCUMENT_SCHEMA,
    version: '1',
    data: {
      subject: clientId,
      verb: 'opened',
      object: { document_path: widget.model.filePath || null },
    },
  });

  widget.disposed.connect(() => {
    emit({
      schema_id: DOCUMENT_SCHEMA,
      version: '1',
      data: {
        subject: clientId,
        verb: 'closed',
        object: { document_path: widget.model.filePath || null },
      },
    });
  });
};

const wireLayerEvents = (
  {widget, clientId, emit}: IEventWiringProps,
): void => {
  const LAYER_SCHEMA = 'https://schema.jupytergis.org/events/layer/v1';

  widget.model.sharedLayersChanged.connect((_, change) => {
    for (const { id, oldValue, newValue } of change.layerChange ?? []) {
      const verb = !oldValue ? 'added' : !newValue ? 'removed' : 'updated';

      emit({
        schema_id: LAYER_SCHEMA,
        version: '1',
        data: {
          subject: clientId,
          verb,
          object: {
            document_path: widget.model.filePath || null,
            layer_id: id,
            ...(oldValue ? { old: oldValue as unknown as JSONObject } : {}),  // TODO: Better typing
            ...(newValue ? { new: newValue as unknown as JSONObject } : {}),  // TODO: Better typing
          },
        },
      });
    }
  });
};

const wireViewportEvents = (
  {widget, clientId, emit}: IEventWiringProps,
): void => {
  const VIEWPORT_SCHEMA = 'https://schema.jupytergis.org/events/viewport/v1';
  // Awareness syncs the viewport every 200ms while the map moves, which is too
  // noisy for an event feed, so we throttle harder.
  // TODO: Should throttling be the client's responsibility?
  const VIEWPORT_SETTLE_MS = 10_000;

  let pendingViewportState: IViewPortState | undefined;
  let publishTimeoutId: number | undefined;

  const publishPendingViewport = (): void => {
    if (!pendingViewportState) {
      return;
    }
    emit({
      schema_id: VIEWPORT_SCHEMA,
      version: '1',
      data: {
        subject: clientId,
        verb: 'moved',
        object: {
          document_path: widget.model.filePath || null,
          new: pendingViewportState as unknown as JSONObject,
        },
      },
    });
    pendingViewportState = undefined;
  };

  widget.model.viewportStateChanged.connect((_, change) => {
    // Collaborators' viewports arrive here too. Only our own movement counts.
    if (!change.isLocalClient || !change.currentValue?.value) {
      return;
    }

    pendingViewportState = change.currentValue.value;

    // Restart the clock on every movement, so one event is published once the
    // viewport has been still for VIEWPORT_SETTLE_MS.
    window.clearTimeout(publishTimeoutId);
    publishTimeoutId = window.setTimeout(
      publishPendingViewport,
      VIEWPORT_SETTLE_MS,
    );
  });
};


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
      // handlers once per document.
      if (wiredModels.has(widget.model)) {
        return;
      }

      wiredModels.add(widget.model);

      const eventWiringProps: IEventWiringProps = {
        widget: widget,
        clientId: String(widget.model.getClientId()),
        emit: emit,
      };

      wireDocumentEvents(eventWiringProps);

      // When the document loads, a bunch of signals come through, e.g. all the
      // existing layers come through as 'added' events (among other events).
      // Connecting before the document loads results in a bunch of "added"
      // spam as those signals fire. We only care about the events triggered by
      // the user intentionally, so we wait until the document's initial sync
      // is complete to wire these signals.
      void widget.model.sharedModel.initialSyncReady.then(() => {
        wireLayerEvents(eventWiringProps);
        wireViewportEvents(eventWiringProps);
      });
    };

    tracker.forEach(wireJupyterGISEvents);
    tracker.widgetAdded.connect((_, widget) => wireJupyterGISEvents(widget));
  },
};
