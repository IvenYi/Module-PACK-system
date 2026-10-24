import { ListColumnSettingsButton } from './ListToolbarIconButton';
import { useEffect, useMemo, useState, Fragment, type ReactNode } from 'react';
import { Box, CircularProgress, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import ListColumnSettingsPopover, { getCurrentUserPreferenceStorageKey, loadListColumnSettings, reorderListColumns } from './ListColumnSettingsPopover';
import { ListTableShell, resolveListColumnWidths } from './ListTableShell';
import { usePersistedListColumnWidths } from './usePersistedListColumnWidths';
import { listColumnResizeHandleSx, listTableBodyCellSx, listTableHeaderCellSx, listTableStickyActionSx } from './listTableStyles';
import TableStateCell from './TableStateCell';

export type ConfigurableListColumn<T> = {
  key: string;
  label: string;
  render?(row: T): ReactNode;
  width?: number;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
  action?: boolean;
};

export type ConfigurableListTableProps<T> = {
  columns: ConfigurableListColumn<T>[];
  rows: T[];
  preferenceKey: string;
  loading?: boolean;
  emptyText?: ReactNode;
  onRow?(row: T): void;
  getRowKey?(row: T, index: number): string | number;
  renderExpanded?(row: T): ReactNode;
  toolbar?: ReactNode;
  title?: ReactNode;
  minHeight?: number;
  maxHeight?: number | string;
  columnPreferences?: ListTableColumnPreferences;
  embedded?: boolean;
  tableWidth?: number;
};

function defineColumns<T>(columns: ConfigurableListColumn<T>[]) {
  return columns.map((column) => ({ ...column, id: column.key, action: column.action || column.key === 'actions', width: column.width ?? (column.action || column.key === 'actions' ? 160 : 180), minWidth: column.minWidth ?? 80 }));
}

export function useListTableColumns<T>(columns: ConfigurableListColumn<T>[], preferenceKey: string) {
  const definitions = useMemo(() => defineColumns(columns), [columns]);
  const configurable = useMemo(() => definitions.filter((column) => !column.action), [definitions]);
  const storageKey = getCurrentUserPreferenceStorageKey(`list-table-fields:${preferenceKey}:`);
  const [settings, setSettings] = useState(() => loadListColumnSettings(storageKey, configurable, 1));
  const widths = usePersistedListColumnWidths(definitions, `list-table-widths:${preferenceKey}:`);
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(settings)); }, [settings, storageKey]);
  const getColumnWidth: typeof widths.getColumnWidth = (column) => {
    const actionColumn = definitions.find((definition) => definition.id === column.id && definition.action);
    return actionColumn ? actionColumn.width : widths.getColumnWidth(column);
  };
  const minTableWidth = definitions.filter((column) => column.action || !settings.hidden.includes(column.id)).reduce((sum, column) => sum + getColumnWidth(column), 0);
  return { settings, setSettings, minTableWidth, ...widths, getColumnWidth };
}

export type ListTableColumnPreferences = ReturnType<typeof useListTableColumns>;

export default function ConfigurableListTable<T>(props: ConfigurableListTableProps<T>) {
  return props.columnPreferences
    ? <ConfiguredTable {...props} columnPreferences={props.columnPreferences} />
    : <LocalConfiguredTable key={props.preferenceKey} {...props} />;
}

function LocalConfiguredTable<T>(props: ConfigurableListTableProps<T>) {
  const columnPreferences = useListTableColumns(props.columns, props.preferenceKey);
  return <ConfiguredTable {...props} columnPreferences={columnPreferences} />;
}

function ConfiguredTable<T>({ columns, rows, preferenceKey, loading, emptyText = '暂无数据', onRow, getRowKey, renderExpanded, toolbar, title, minHeight = 0, maxHeight, columnPreferences, embedded = false, tableWidth: embeddedTableWidth }: ConfigurableListTableProps<T> & { columnPreferences: ListTableColumnPreferences }) {
  const definitions = useMemo(() => defineColumns(columns), [columns]);
  const configurable = useMemo(() => definitions.filter((column) => !column.action), [definitions]);
  const { settings, setSettings, getColumnWidth, getResizeHandleProps, minTableWidth } = columnPreferences;
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const visibleColumns = [
    ...settings.order.map((id) => configurable.find((column) => column.id === id)).filter((column): column is typeof configurable[number] => Boolean(column) && !settings.hidden.includes(column!.id)),
    ...definitions.filter((column) => column.action),
  ];
  const declaredWidths = visibleColumns.map((column) => ({ id: column.id, width: getColumnWidth(column) }));
  const actionIds = visibleColumns.filter((column) => column.action).map((column) => column.id);
  const renderTable = (tableWidth: number) => {
        const widths = resolveListColumnWidths(declaredWidths, tableWidth, visibleColumns[0]?.id ?? '', actionIds);
        const width = Object.values(widths).reduce((sum, value) => sum + value, 0);
        const cellSx = (column: typeof definitions[number], layer: 'head' | 'body') => ({
          ...(layer === 'head' ? listTableHeaderCellSx : listTableBodyCellSx),
          width: widths[column.id], minWidth: widths[column.id], maxWidth: widths[column.id],
          ...(layer === 'head' ? { position: 'sticky', top: 0, userSelect: 'none' } : { px: 2, ...(embedded ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : { overflowWrap: 'anywhere' }) }),
          ...(column.action ? {
            ...listTableStickyActionSx(widths[column.id], layer),
            right: visibleColumns.slice(visibleColumns.indexOf(column) + 1).filter((item) => item.action).reduce((sum, item) => sum + widths[item.id], 0),
          } : {}),
        });
        return <Table stickyHeader size="small" aria-label={typeof title === 'string' ? title : preferenceKey} sx={{ tableLayout: 'fixed', width, minWidth: width, borderCollapse: 'separate', borderSpacing: 0, height: loading || !rows.length ? '100%' : 'auto' }}>
          <colgroup>{visibleColumns.map((column) => <col key={column.id} style={{ width: widths[column.id] }} />)}</colgroup>
          <TableHead><TableRow>{visibleColumns.map((column) => <TableCell key={column.id} align={column.align ?? (column.action ? 'center' : 'left')} sx={cellSx(column, 'head')}>
            {column.label}
            {!column.action && <Box aria-label={`调整${column.label}列宽`} data-list-column-resizer={column.id} {...getResizeHandleProps(column, widths, visibleColumns.find((other) => !other.action && other.id !== column.id)?.id)} onClick={(event) => event.stopPropagation()} sx={listColumnResizeHandleSx} />}
          </TableCell>)}</TableRow></TableHead>
          <TableBody sx={{ height: loading || !rows.length ? '100%' : 'auto' }}>{loading || !rows.length ? <TableRow sx={{ height: '100%' }}><TableStateCell colSpan={visibleColumns.length} sx={{ height: embedded ? 40 : Math.max(minHeight - 48, 80), color: '#909399' }}>{loading ? <CircularProgress size={24} /> : emptyText}</TableStateCell></TableRow> : rows.map((row, index) => <Fragment key={getRowKey?.(row, index) ?? String((row as { id?: unknown })?.id ?? index)}><TableRow data-record-id={getRowKey?.(row, index) ?? String((row as { id?: unknown })?.id ?? index)} hover onClick={() => onRow?.(row)} sx={{ cursor: onRow ? 'pointer' : undefined }}>
            {visibleColumns.map((column) => <TableCell key={column.id} align={column.align ?? (column.action ? 'center' : 'left')} onClick={column.action ? (event) => event.stopPropagation() : undefined} sx={cellSx(column, 'body')}>
              {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? '—')}
            </TableCell>)}
          </TableRow>{renderExpanded && (() => {
            const expanded = renderExpanded(row);
            return expanded ? <TableRow><TableCell colSpan={visibleColumns.length} sx={{ p: 0 }}>{expanded}</TableCell></TableRow> : null;
          })()}</Fragment>)}</TableBody>
        </Table>;
      };
  if (embedded) return <TableContainer sx={{ width: '100%', bgcolor: '#fff', overflow: 'visible' }}>{renderTable(embeddedTableWidth ?? minTableWidth)}</TableContainer>;
  return <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ minHeight: 48, px: 2, gap: 1, borderBottom: '1px solid #e4e7ed', flexShrink: 0, overflowX: 'auto', overflowY: 'hidden', '& > *': { flexShrink: 0 } }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <ListColumnSettingsButton onClick={(event) => setAnchorEl(event.currentTarget)} />
        {title && <Typography fontWeight={600}>{title}</Typography>}
      </Stack>
      {toolbar}
    </Stack>
    <ListColumnSettingsPopover anchorEl={anchorEl} columns={configurable} settings={settings} onClose={() => setAnchorEl(null)} onToggle={(id) => setSettings((current) => ({ ...current, hidden: current.hidden.includes(id) ? current.hidden.filter((value) => value !== id) : configurable.length - current.hidden.length > 1 ? [...current.hidden, id] : current.hidden }))} onReorder={(source, target) => setSettings((current) => reorderListColumns(configurable, current, source, target))} />
    <ListTableShell minTableWidth={minTableWidth} sx={{ flex: 1, minHeight, maxHeight, overflow: 'auto', containerType: 'inline-size' }}>{renderTable}</ListTableShell>
  </Box>;
}
