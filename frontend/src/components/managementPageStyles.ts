export const managementFieldSx = {
  '& .MuiInputBase-root:not(.MuiInputBase-multiline)': { minHeight: 40 },
  '& .MuiInputBase-input': { boxSizing: 'border-box' },
};

export const managementDetailGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
  gap: 1,
  '& > *': { minWidth: 0 },
};

export const managementDetailSectionSx = {
  bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, p: 1.5,
};
