import { forwardRef } from 'react';
import { Box, IconButton, Tooltip, type IconButtonProps } from '@mui/material';
import { TuneRounded, ViewColumnRounded } from '@mui/icons-material';

export interface ListToolbarIconButtonProps extends IconButtonProps {
  label: string;
}

const ListToolbarIconButton = forwardRef<HTMLButtonElement, ListToolbarIconButtonProps>(function ListToolbarIconButton({ label, children, sx, ...props }, ref) {
  return <Tooltip title={label} arrow>
    <IconButton ref={ref} size="small" aria-label={label} {...props} sx={[{ width: 36, height: 36, flexShrink: 0, border: '1px solid #e4e7ed', borderRadius: 1, color: '#606266', bgcolor: '#fff', '&:hover': { color: '#1890ff', bgcolor: '#e8f4ff' }, '& > .MuiSvgIcon-root': { fontSize: 20 } }, ...(Array.isArray(sx) ? sx : [sx])]}>{children}</IconButton>
  </Tooltip>;
});

export const ListColumnSettingsButton = forwardRef<HTMLButtonElement, IconButtonProps>(function ListColumnSettingsButton(props, ref) {
  return <ListToolbarIconButton ref={ref} label="字段设置" {...props}>
    <Box aria-hidden="true" sx={{ position: 'relative', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <ViewColumnRounded sx={{ fontSize: 21 }} />
      <TuneRounded sx={{ position: 'absolute', right: -3, bottom: -2, fontSize: 13, p: '1px', borderRadius: '50%', bgcolor: '#fff', boxShadow: '0 0 0 1px #fff' }} />
    </Box>
  </ListToolbarIconButton>;
});

export default ListToolbarIconButton;
