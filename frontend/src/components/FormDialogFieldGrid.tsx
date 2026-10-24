import type { ReactNode } from 'react';
import { Box } from '@mui/material';
import { managementFieldSx } from './managementPageStyles';

export default function FormDialogFieldGrid({ children, hasTrailingFullRow = false }: { children: ReactNode; hasTrailingFullRow?: boolean }) {
  return <Box sx={{
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
    gap: 1.5,
    ...managementFieldSx,
    '& > *': { minWidth: 0 },
    '& > .MuiFormControl-root, & > .MuiAutocomplete-root': { width: '100%' },
    '& > .MuiFormControl-root:has(.MuiInputBase-multiline)': { gridColumn: '1 / -1' },
    '& > :last-child:nth-child(odd)': { gridColumn: { sm: '1 / -1' } },
    ...(hasTrailingFullRow ? { '& > :nth-last-child(2):nth-child(odd)': { gridColumn: { sm: '1 / -1' } } } : {}),
  }}>{children}</Box>;
}
