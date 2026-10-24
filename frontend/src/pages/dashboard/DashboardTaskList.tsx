import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Skeleton, Stack } from '@mui/material';
import { ArrowForwardRounded, CheckCircleOutlineRounded, InboxOutlined, RefreshRounded } from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { packGet, type PackRow } from '@/api/pack';
import { PackScopeFilter, PackStatus, packLabel, usePackSite } from '@/pages/pack/packUi';
import { useAuthStore } from '@/stores/authStore';

export default function DashboardTaskList({ kind }: { kind: 'todo' | 'done'; assigneeId?: string | number }) {
  const { siteId, setSiteId, sites } = usePackSite();
  const permissions = useAuthStore(state => state.user?.permissions ?? []);
  const canView = permissions.includes('pack.quality.view');
  const isTodo = kind === 'todo';
  const query = useQuery({ queryKey: ['pack-dashboard-quality', siteId, kind], enabled: !!siteId && canView,
    queryFn: () => packGet<{ content: PackRow[]; total: number }>('/quality', { siteId, queue: isTodo ? 'todo' : 'released', page: 1, size: 8 }), refetchInterval: 30000 });
  const all = query.data?.content ?? [];
  const tasks = all;
  const EmptyIcon = isTodo ? InboxOutlined : CheckCircleOutlineRounded;
  return <div className="dashboard-task-list">
    <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1 }}><PackScopeFilter siteId={siteId} onChange={setSiteId} sites={sites} /><Button size="small" startIcon={<RefreshRounded />} disabled={!siteId || !canView || query.isFetching} onClick={() => void query.refetch()}>刷新</Button></Stack>
    <div className="dashboard-task-toolbar"><span>{isTodo ? '当前工厂的质量锁定、返修及待放行单件 · 每30秒更新' : '当前工厂已放行的单件'}</span></div>
    {!canView ? <Alert severity="info">当前角色没有质量查看权限，请从生产入口办理已授权的作业。</Alert>
      : query.isLoading ? <Skeleton variant="rounded" height={140} />
      : query.isError ? <Alert severity="error">质量事项加载失败，请刷新重试。</Alert>
      : !tasks.length ? <div className="dashboard-task-empty"><EmptyIcon /><strong>{isTodo ? '暂无待处理质量事项' : '暂无放行记录'}</strong><span>统计来自当前工厂的单件与质量记录</span></div>
      : <Stack spacing={1}>{tasks.map(row => <Stack key={row.id} direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 1.25, borderBottom: '1px solid #ebeef5' }}><span><strong>{row.objectNo}</strong> · {packLabel(row.objectType)} · {packLabel(row.productionState)}</span><Stack direction="row" alignItems="center" spacing={1}><PackStatus value={row.qualityState} kind="quality" /><Button size="small" component={Link} to={`/pack/quality?objectId=${row.id}&siteId=${siteId}`} endIcon={<ArrowForwardRounded />}>查看</Button></Stack></Stack>)}</Stack>}
    <Button component={Link} to="/pack/quality" sx={{ mt: 1 }}>查看全部质量事项</Button>
  </div>;
}
