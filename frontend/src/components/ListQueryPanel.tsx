import type { ReactNode } from 'react';
import { Box, Button, Stack } from '@mui/material';
import { RestartAlt, Search } from '@mui/icons-material';
import { managementFieldSx } from './managementPageStyles';

export default function ListQueryPanel({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return <Box data-management-query-panel sx={{ flex: '0 0 auto', bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, p: 2, width: '100%', minWidth: 0, boxSizing: 'border-box', containerType: 'inline-size', containerName: 'management-query' }}>
    <Box data-management-query-grid sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, alignItems: 'center', '& > *': { minWidth: 0 }, '& > .MuiFormControl-root, & > .MuiAutocomplete-root': { width: '100%', minWidth: 0, ...managementFieldSx }, '@container management-query (max-width: 560px)': { gridTemplateColumns: '1fr', '& > [data-management-query-actions]': { gridColumn: '1' } } }}>
      {children}
      {actions && <Box data-management-query-actions sx={{ gridColumn: { xs: '1', md: '3' }, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.5 }}>{actions}</Box>}
    </Box>
  </Box>;
}

export function ListQueryActions({ onReset, onQuery, queryLabel = '查询', disabled = false }: { onReset(): void; onQuery(): void; queryLabel?: string; disabled?: boolean }) {
  return <Stack direction="row" spacing={1.5} justifyContent="flex-end" alignItems="center">
    <Button size="small" variant="outlined" startIcon={<RestartAlt />} onClick={onReset} disabled={disabled} sx={{ height: 40, width: 80, minWidth: 80 }}>重置</Button>
    <Button size="small" variant="contained" startIcon={<Search />} onClick={onQuery} disabled={disabled} sx={{ height: 40, width: 80, minWidth: 80 }}>{queryLabel}</Button>
  </Stack>;
}
