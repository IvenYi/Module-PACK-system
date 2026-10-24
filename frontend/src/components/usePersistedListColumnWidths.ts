import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { getCurrentUserPreferenceStorageKey } from './ListColumnSettingsPopover';

export type ResizableListColumn<ColumnId extends string> = {
  id: ColumnId;
  width: number;
  minWidth?: number;
};

type ResizeSession<ColumnId extends string> = {
  columnId: ColumnId;
  pointerId: number;
  startX: number;
  startWidth: number;
  minWidth: number;
  companionColumnId?: ColumnId;
  companionStartWidth: number;
  viewportWidth: number;
  totalWidth: number;
};

type ResizeDocumentHandlers = {
  move: (event: PointerEvent) => void;
  up: (event: PointerEvent) => void;
  cancel: (event: PointerEvent) => void;
};

export function usePersistedListColumnWidths<ColumnId extends string>(
  columns: readonly ResizableListColumn<ColumnId>[],
  storagePrefix: string,
) {
  const storageKey = useMemo(() => getCurrentUserPreferenceStorageKey(storagePrefix), [storagePrefix]);
  const [widths, setWidths] = useState<Partial<Record<ColumnId, number>>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) || '{}') as Record<string, unknown>;
      return Object.fromEntries(columns.flatMap((column) => {
        const value = raw[column.id];
        return typeof value === 'number' && Number.isFinite(value)
          ? [[column.id, Math.max(column.minWidth ?? 80, value)]]
          : [];
      })) as Partial<Record<ColumnId, number>>;
    } catch {
      return {};
    }
  });
  const resizeSessionRef = useRef<ResizeSession<ColumnId> | null>(null);
  const resizeDocumentHandlersRef = useRef<ResizeDocumentHandlers | null>(null);

  const updateResize = useCallback((pointerId: number, clientX: number) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== pointerId) return;
    const width = Math.max(session.minWidth, session.startWidth + clientX - session.startX);
    const fillWidth = Math.max(0, session.viewportWidth - session.totalWidth - width + session.startWidth);
    setWidths((current) => ({
      ...current,
      [session.columnId]: width,
      ...(session.companionColumnId ? { [session.companionColumnId]: session.companionStartWidth + fillWidth } : {}),
    }));
  }, []);

  const removeDocumentListeners = useCallback(() => {
    const handlers = resizeDocumentHandlersRef.current;
    if (!handlers) return;
    document.removeEventListener('pointermove', handlers.move);
    document.removeEventListener('pointerup', handlers.up);
    document.removeEventListener('pointercancel', handlers.cancel);
    resizeDocumentHandlersRef.current = null;
  }, []);

  const finishResize = useCallback((pointerId: number) => {
    if (resizeSessionRef.current?.pointerId !== pointerId) return;
    resizeSessionRef.current = null;
    removeDocumentListeners();
  }, [removeDocumentListeners]);

  const handleDocumentPointerMove = useCallback((event: PointerEvent) => {
    updateResize(event.pointerId, event.clientX);
  }, [updateResize]);

  const handleDocumentPointerUp = useCallback((event: PointerEvent) => {
    finishResize(event.pointerId);
  }, [finishResize]);

  const handleDocumentPointerCancel = useCallback((event: PointerEvent) => {
    finishResize(event.pointerId);
  }, [finishResize]);

  useEffect(() => () => {
    resizeSessionRef.current = null;
    removeDocumentListeners();
  }, [removeDocumentListeners]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(widths));
  }, [storageKey, widths]);

  const getColumnWidth = useCallback(
    (column: ResizableListColumn<ColumnId>) => Math.max(column.minWidth ?? 80, widths[column.id] ?? column.width),
    [widths],
  );

  const getResizeHandleProps = useCallback((column: ResizableListColumn<ColumnId>, renderedWidths?: Partial<Record<ColumnId, number>>, companionColumnId?: ColumnId) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (renderedWidths) setWidths((current) => ({ ...current, ...renderedWidths }));
      resizeSessionRef.current = {
        columnId: column.id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: renderedWidths?.[column.id] ?? getColumnWidth(column),
        minWidth: column.minWidth ?? 80,
        companionColumnId,
        companionStartWidth: companionColumnId ? renderedWidths?.[companionColumnId] ?? 0 : 0,
        viewportWidth: companionColumnId ? event.currentTarget.closest('table')?.parentElement?.clientWidth ?? 0 : 0,
        totalWidth: Object.values(renderedWidths ?? {}).reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 0), 0),
      };
      const handlers = {
        move: handleDocumentPointerMove,
        up: handleDocumentPointerUp,
        cancel: handleDocumentPointerCancel,
      };
      resizeDocumentHandlersRef.current = handlers;
      document.addEventListener('pointermove', handleDocumentPointerMove);
      document.addEventListener('pointerup', handleDocumentPointerUp);
      document.addEventListener('pointercancel', handleDocumentPointerCancel);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      updateResize(event.pointerId, event.clientX);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => {
      finishResize(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => { finishResize(event.pointerId); },
  }), [finishResize, getColumnWidth, handleDocumentPointerCancel, handleDocumentPointerMove, handleDocumentPointerUp, updateResize]);

  return { getColumnWidth, getResizeHandleProps };
}
