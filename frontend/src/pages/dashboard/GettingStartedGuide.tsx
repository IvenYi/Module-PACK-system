import { useState } from 'react';
import { Button, Tab, Tabs } from '@mui/material';
import { ArrowBackRounded, ArrowForwardRounded, CheckCircleOutlineRounded, LightbulbOutlined } from '@mui/icons-material';
import { Link } from 'react-router-dom';

interface GuideStep {
  title: string;
  subtitle: string;
  role: string;
  before: string;
  actions: string[];
  outcome: string;
  links: { label: string; path: string }[];
}

const initialization: GuideStep[] = [
  {
    title: '组织与人员', subtitle: '先让协作有基础', role: '系统管理员',
    before: '准备部门结构、使用人员和岗位分工。',
    actions: ['在组织管理中维护部门结构，在用户管理中建立人员账号。', '在角色管理中检查岗位对应的权限，并为用户分配合适的角色。'],
    outcome: '参与人员拥有对应账号与角色，能够进入各自负责的功能。',
    links: [{ label: '组织管理', path: '/system/organization' }, { label: '用户管理', path: '/system/users' }, { label: '角色管理', path: '/system/roles' }],
  },
  {
    title: '基础资料', subtitle: '准备生产所需资源', role: '基础数据维护人员',
    before: '准备物料编码、名称、规格、单位，以及车间和设备资料。',
    actions: ['在物料管理中维护或导入物料，核对编码、版本与单位。', '根据实际生产需要维护车间、设备类型和设备；设备类型先于设备建立。'],
    outcome: '后续建模需要引用的物料与现场资源可以在对应列表中找到。',
    links: [{ label: '物料管理', path: '/master-data/materials' }, { label: '车间管理', path: '/master-data/workshops' }, { label: '设备类型', path: '/master-data/equipment-types' }, { label: '设备列表', path: '/master-data/equipment' }],
  },
  {
    title: '工序与路线', subtitle: '定义生产怎么走', role: '工艺维护人员',
    before: '准备工序清单、工艺顺序和需要引用的作业文档。',
    actions: ['在工序管理中维护或导入工序，在文档管理中准备需要引用的文档版本。', '在工艺路线中组织工序节点与连接关系，检查路线版本的内容。'],
    outcome: '形成供产品制造配置引用的工艺路线版本。',
    links: [{ label: '工序管理', path: '/master-data/operations' }, { label: '工艺路线', path: '/master-data/routes' }, { label: '文档管理', path: '/master-data/documents' }],
  },
  {
    title: '制造版本', subtitle: '冻结可执行的制造配置', role: '工艺维护人员',
    before: '产品由物料中的半成品、产成品派生，准备工艺路线版本、SOP与工位。',
    actions: ['打开产品建模或制造版本，维护装配位置、物料用量、工序动作与检验规范。', '校验配置，处理所有问题后发布。发布版本冻结引用，后续修改另建版本。'],
    outcome: '工单可以选择已发布的制造版本，历史在制品仍使用原快照。',
    links: [{ label: '产品管理', path: '/master-data/products' }, { label: '制造版本', path: '/pack/manufacturing' }],
  },
];

const production: GuideStep[] = [
  { title: '创建与接单', subtitle: '明确产品与制造版本', role: '计划与生产人员', before: '确认工厂、工位和已发布制造版本。',
    actions: ['创建工单并绑定制造版本、计划数量和主责工位。', '接单后创建模组或PACK单件；电芯按物料、批次和序列号接收。'], outcome: '生产对象与工单、物料及冻结制造版本建立关联。',
    links: [{ label: '工单管理', path: '/pack/orders' }, { label: '单件管理', path: '/pack/objects' }] },
  { title: '扫码装配', subtitle: '按工位和位置作业', role: '生产操作人员', before: '选择实际工位，扫描父件身份码。',
    actions: ['按路线进站，打开工序抽屉和SOP，按位置扫描电芯或模组。', '系统校验物料、状态、用量和占用关系。完成规定动作与检验后提交工序。'], outcome: '装配关系和作业记录持久保存，前置条件不满足时阻断。',
    links: [{ label: '生产工作台', path: '/pack/execution' }] },
  { title: 'NG与返修', subtitle: '保留失败证据并受控复测', role: '质量与返修人员', before: '检验NG后，单件被质量锁定。',
    actions: ['在质量管理中查明原因，授权返修并明确拆换位置。', '在工作台执行换件与复测，旧装配、失败结果和失效证据保留。复测合格后关闭返修。'], outcome: '失败结果不会被覆盖，未关闭异常或未完成复测不能放行。',
    links: [{ label: '质量管理', path: '/pack/quality' }, { label: '生产工作台', path: '/pack/execution' }] },
  { title: '质量放行', subtitle: '独立核对并冻结交付证据', role: '质量人员', before: '工序完工、有效检验合格且无未处理异常。',
    actions: ['在质量管理中查看履历、装配和检验事实，填写放行理由。', '系统检查放行职责及所有前置条件，通过后冻结放行快照。'], outcome: '放行记录可以回查，后续异常不会改写已冻结的放行证据。',
    links: [{ label: '质量管理', path: '/pack/quality' }] },
  { title: '双向追溯', subtitle: '从PACK查电芯，从电芯查影响', role: '生产与质量人员', before: '准备电芯、模组或PACK身份码。',
    actions: ['查看当前与历史装配关系，沿层级查询上下游单件。', '回看检验、NG、返修、旧件、新件和放行快照，确认影响范围。'], outcome: '当前结构与历史结构均有依据，拆下旧件仍能反查历史父件。',
    links: [{ label: '制造追溯', path: '/pack/trace' }] },
];

export default function GettingStartedGuide({ tab, onTabChange }: { tab: number; onTabChange: (tab: number) => void }) {
  const [selectedSteps, setSelectedSteps] = useState([0, 0]);
  const steps = tab === 0 ? initialization : production;
  const selected = selectedSteps[tab];
  const step = steps[selected];
  const kind = tab === 0 ? 'initialization' : 'production';
  const selectStep = (index: number) => setSelectedSteps((previous) => previous.map((value, key) => key === tab ? index : value));

  return <>
    <Tabs value={tab} onChange={(_, value: number) => onTabChange(value)} aria-label="使用指南类型">
      <Tab id="guide-initialization-tab" aria-controls="guide-initialization-panel" label="初始化指南" />
      <Tab id="guide-production-tab" aria-controls="guide-production-panel" label="跑通生产流程" />
    </Tabs>
    <div role="tabpanel" id={'guide-' + kind + '-panel'} aria-labelledby={'guide-' + kind + '-tab'}>
      <div className="dashboard-guide-note"><LightbulbOutlined /><span>{tab === 0 ? '推荐准备顺序，可按职责选择阶段；此处为操作指南，不代表系统配置完成状态。' : '以生产场景为例；具体执行顺序和可用操作，以所选制造版本与页面提示为准。'}</span></div>
      <div className="dashboard-guide-layout">
        <nav className="dashboard-steps" aria-label="指南步骤">
          {steps.map((item, index) => <button key={item.title} aria-current={selected === index ? 'step' : undefined} className={'dashboard-step' + (selected === index ? ' is-selected' : '')} onClick={() => selectStep(index)}>
            <span className="dashboard-step-number">{String(index + 1).padStart(2, '0')}</span><span><strong>{item.title}</strong><small>{item.subtitle}</small></span><ArrowForwardRounded />
          </button>)}
        </nav>
        <article className="dashboard-step-detail" aria-label="当前步骤说明">
          <div className="dashboard-step-heading"><span className="dashboard-eyebrow">步骤 {String(selected + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}</span><span className="dashboard-section-tag">{step.role}</span></div>
          <h3>{step.title}</h3><p className="dashboard-step-before"><strong>开始前</strong>{step.before}</p>
          <ol className="dashboard-step-actions">{step.actions.map((action) => <li key={action}>{action}</li>)}</ol>
          <div className="dashboard-step-outcome"><CheckCircleOutlineRounded /><div><strong>完成后检查</strong><p>{step.outcome}</p></div></div>
          <div className="dashboard-step-links">{step.links.map((link, index) => <Button component={Link} to={link.path} key={link.path} variant={index === 0 ? 'contained' : 'outlined'} endIcon={index === 0 ? <ArrowForwardRounded /> : undefined}>{link.label}</Button>)}</div>
          <div className="dashboard-step-pagination"><Button size="small" startIcon={<ArrowBackRounded />} disabled={selected === 0} onClick={() => selectStep(selected - 1)}>上一步</Button>{selected < steps.length - 1 ? <Button size="small" endIcon={<ArrowForwardRounded />} onClick={() => selectStep(selected + 1)}>下一步：{steps[selected + 1].title}</Button> : tab === 0 ? <Button size="small" endIcon={<ArrowForwardRounded />} onClick={() => onTabChange(1)}>查看生产流程</Button> : <span>需要时，随时回到这里查阅</span>}</div>
        </article>
      </div>
    </div>
  </>;
}
