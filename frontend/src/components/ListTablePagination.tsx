import { Box, FormControl, MenuItem, Pagination, Select, Stack, Typography } from '@mui/material';

export default function ListTablePagination({ total, page, size, onPage, onSize, sizeOptions = [20, 50, 100] }: {
  total: number;
  page: number;
  size: number;
  onPage(page: number): void;
  onSize(size: number): void;
  sizeOptions?: number[];
}) {
  return <Box sx={{ minHeight: 56, px: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexShrink: 0, flexWrap: 'wrap' }}>
    <Typography sx={{ color: '#909399' }}>共 {total} 条数据</Typography>
    <Stack direction="row" spacing={2} alignItems="center">
      <Pagination page={page} count={Math.max(1, Math.ceil(total / size))} color="primary" size="small" onChange={(_, value) => onPage(value)} />
      <FormControl size="small" sx={{ minWidth: 116 }}>
        <Select value={size} onChange={(event) => { onSize(Number(event.target.value)); onPage(1); }} inputProps={{ 'aria-label': '每页条数' }} sx={{ height: 32, fontSize: 14 }}>
          {Array.from(new Set([...sizeOptions, size])).sort((a, b) => a - b).map((option) => <MenuItem key={option} value={option}>{option} 条/页</MenuItem>)}
        </Select>
      </FormControl>
    </Stack>
  </Box>;
}
