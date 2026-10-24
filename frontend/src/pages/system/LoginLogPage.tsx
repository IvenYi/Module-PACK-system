import ListQueryPanel, { ListQueryActions } from '@/components/ListQueryPanel';
import ConfigurableListTable, { type ConfigurableListColumn } from '@/components/ConfigurableListTable';
import ListTablePagination from '@/components/ListTablePagination';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Box,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { getLoginLogs, type LoginLogItem } from '@/api/loginLogs';
import StatusBadge from '@/components/StatusBadge';

const LOGIN_LOG_EVENT_TYPE_OPTIONS = [
  { label: '登录', value: 'LOGIN' },
  { label: '登出', value: 'LOGOUT' },
];

const PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50, 100, 200];

function formatDateTime(value?: string) {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 19);
}

function getEventTone(eventType: string): 'success' | 'info' | 'default' {
  if (eventType === 'LOGIN') return 'success';
  if (eventType === 'LOGOUT') return 'info';
  return 'default';
}

function readDisplayValue(value?: string | number | null) {
  return value === undefined || value === null || value === '' ? '-' : String(value);
}

const loginLogColumns: ConfigurableListColumn<LoginLogItem>[] = [
  { key: 'occurredAt', label: '时间', width: 170, render: (item) => formatDateTime(item.occurredAt) },
  { key: 'eventType', label: '事件类型', width: 100, render: (item) => <StatusBadge label={item.eventTypeLabel || item.actionLabel || item.eventType} color={getEventTone(item.eventType)} /> },
  { key: 'operatorName', label: '操作人', width: 140, render: (item) => readDisplayValue(item.operatorName) },
  { key: 'username', label: '账号', width: 150, render: (item) => readDisplayValue(item.username) },
  { key: 'authMethod', label: '登录/登出方式', width: 140, render: (item) => readDisplayValue(item.authMethodLabel || item.authMethod) },
  { key: 'platform', label: '平台', width: 110, render: (item) => readDisplayValue(item.platformLabel || item.platform) },
  { key: 'clientType', label: '客户端类型', width: 130, render: (item) => readDisplayValue(item.clientTypeLabel || item.clientType) },
  { key: 'browser', label: '浏览器', width: 120, render: (item) => readDisplayValue(item.browser) },
  { key: 'ipAddress', label: 'IP', width: 150, render: (item) => readDisplayValue(item.ipAddress) },
];

export default function LoginLogPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [eventType, setEventType] = useState('');
  const [keyword, setKeyword] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['login-logs', page, pageSize, eventType, keyword, startTime, endTime],
    queryFn: () => getLoginLogs({
      page,
      size: pageSize,
      eventType: eventType || undefined,
      keyword: keyword || undefined,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
    }),
  });

  const content = data?.content ?? [];

  return (
    <Box sx={{ height: '100%', minHeight: 'calc(100vh - 142px)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h5" sx={{ fontWeight: 600 }}>登录日志</Typography>
      <ListQueryPanel actions={<ListQueryActions onReset={() => { setEventType(''); setKeyword(''); setStartTime(''); setEndTime(''); setPage(1); }} onQuery={() => { setPage(1); void refetch(); }} />}>
<TextField
            select
            size="small"
            label="事件类型"
            value={eventType}
            onChange={(event) => { setEventType(event.target.value); setPage(1); }}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">全部</MenuItem>
            {LOGIN_LOG_EVENT_TYPE_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
            ))}
          </TextField>
<TextField
            size="small"
            label="操作人/账号"
            value={keyword}
            onChange={(event) => { setKeyword(event.target.value); setPage(1); }}
            sx={{ minWidth: 180 }}
          />
<TextField
            size="small"
            label="开始时间"
            type="datetime-local"
            value={startTime}
            onChange={(event) => { setStartTime(event.target.value); setPage(1); }}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 190 }}
          />
<TextField
            size="small"
            label="结束时间"
            type="datetime-local"
            value={endTime}
            onChange={(event) => { setEndTime(event.target.value); setPage(1); }}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 190 }}
          />
      </ListQueryPanel>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#fff', overflow: 'hidden' }}>
        <ConfigurableListTable
          columns={loginLogColumns}
          rows={isError ? [] : content}
          preferenceKey="system-login-logs"
          loading={isLoading}
          emptyText={isError ? '加载失败' : '暂无登录日志'}
          minHeight={240}
        />
        <ListTablePagination total={data?.totalElements ?? 0} page={page} size={pageSize} onPage={setPage} onSize={setPageSize} sizeOptions={PAGE_SIZE_OPTIONS} />
      </Box>
    </Box>
  );
}
