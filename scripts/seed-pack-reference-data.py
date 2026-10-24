#!/usr/bin/env python3
"""Populate only the isolated Pack copy with sourced, professionally named data.

Public product ratings are reference master data. Internal orders, serials,
routes, inspection windows and readings are local software fixtures, not OEM
manufacturing records. Existing facts are never renamed or rewritten here.
"""
import argparse
import copy
import importlib.util
import json
import os
from pathlib import Path
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://127.0.0.1:8090/api/v1'
DATASET = 'pack-public-reference-20261024-v1'
MANIFEST = ROOT / '.pack-runtime/reference-data-manifest.json'
MD = '/master-data/process-modeling'
NOTICE = '公开产品资料参考；本地业务联调样本，不对应实物制造或原厂放行。'
WINDOW_NOTE = '本地流程核验窗口，未经产品工艺确认，不是原厂出厂检验限值。'
SOURCES = {
    'catl': 'https://www.catl.com/uploads/1/file/public/202010/20201026135819_6jayg50gyj.pdf',
    'catl52s': 'https://www.catl.com/news/4103.html',
    'byd': 'https://bydbatterybox.com/uploads/downloads/BCU2.0_BBOX_HVM_Datasheet_EN_V1.0_250328-67ee3a426f6ce.pdf',
    'eve': 'https://www.battery-germany.de/wp-content/uploads/2021/11/LF280K-Product-Specification.pdf',
    'eveOfficial': 'https://www.evebattery.com/news-594',
    'pylontech': 'https://en.pylontech.com.cn/products/c23/134.html',
}
MATERIALS = [
    ('cell-catl', 'CEL-LFP-CATL-280', '宁德时代 280Ah 储能方形电芯', '原材料', '宁德时代',
     'LFP；3.2V；280Ah', 'catl'),
    ('cell-eve', 'CEL-LFP-EVE-LF280K', '亿纬 LF280K 磷酸铁锂电芯 3.2V 280Ah', '原材料', '亿纬动力',
     'LF280K；3.2V；280Ah', 'eve'),
    ('module-13s', 'MOD-LFP-13S1P-280', '储能模组 13S1P 41.6V 280Ah', '半成品', '',
     '13S1P；41.6V；280Ah；11.648kWh', 'catl'),
    ('pack-catl', 'PK-CATL-M52280-E', '宁德时代 M52280-E 液冷储能电箱 46.6kWh', '产成品', '宁德时代',
     'M52280-E；1P52S；280Ah；46.6kWh；1152×810×243.4mm；166.4V', 'catl'),
    ('module-byd', 'MOD-BYD-HVM-276', '比亚迪 HVM 储能模组 51.2V 2.76kWh', '半成品', '比亚迪',
     'Battery-Box Premium HVM；51.2V；2.76kWh；35/38kg', 'byd'),
    ('pack-byd83', 'PK-BYD-HVM-083', '比亚迪 Battery-Box HVM 8.3 储能系统', '产成品', '比亚迪',
     'HVM 8.3；3个HVM模组；153.6V；可用电量8.28kWh', 'byd'),
    ('pack-byd138', 'PK-BYD-HVM-138', '比亚迪 Battery-Box HVM 13.8 储能系统', '产成品', '比亚迪',
     'HVM 13.8；5个HVM模组；256V；可用电量13.80kWh', 'byd'),
    ('pack-pylon', 'PK-PYLON-US5000', '派能 US5000 机架式储能电池 48V 4.8kWh', '产成品', '派能科技',
     'US5000；48V；标称4.8kWh/可用4.56kWh；442×420×161mm；39.7kg；RS485/CAN', 'pylontech'),
]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise RuntimeError('Local API redirects are not allowed')


def normalize_ids(value):
    if isinstance(value, list):
        return [normalize_ids(item) for item in value]
    if isinstance(value, dict):
        return {key: str(item) if (key == 'id' or key.endswith('Id')) and type(item) is int else normalize_ids(item)
                for key, item in value.items()}
    return value


class Seeder:
    def __init__(self):
        spec = importlib.util.spec_from_file_location('pack_local', ROOT / 'scripts/pack-local.py')
        local = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(local)
        config = local.configuration()
        if (config['PACK_DATABASE_NAME'], config['PACK_DATABASE_PORT'], config['PACK_BACKEND_PORT']) != ('pack_edhr_dev', '55440', '8090'):
            raise RuntimeError('This dataset is restricted to the isolated 55440/8090 Pack copy')
        self.state = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {
            'dataset': DATASET, 'status': 'PREPARING', 'sources': SOURCES, 'created': {}, 'commands': {}, 'checks': []}
        if self.state['dataset'] != DATASET:
            raise RuntimeError('Different dataset manifest already exists')
        self.state['created'] = normalize_ids(self.state['created'])
        self.token = ''
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        self.site = '1'

    def save(self):
        MANIFEST.parent.mkdir(exist_ok=True)
        temp = MANIFEST.with_suffix('.tmp')
        temp.write_text(json.dumps(self.state, ensure_ascii=False, indent=2) + '\n')
        temp.chmod(0o600)
        temp.replace(MANIFEST)

    def call(self, method, path, body=None):
        if not path.startswith('/') or '://' in path:
            raise ValueError('API paths must be local')
        headers = {'Accept': 'application/json'}
        if self.token:
            headers['Authorization'] = 'Bearer ' + self.token
        data = None
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode()
            headers['Content-Type'] = 'application/json'
        try:
            with self.opener.open(urllib.request.Request(BASE + path, data=data, headers=headers, method=method), timeout=45) as response:
                envelope = json.loads(response.read())
        except urllib.error.HTTPError as error:
            detail = json.loads(error.read())
            raise RuntimeError(f'{method} {path}: {error.code} {detail.get("message", "request rejected")}') from error
        if envelope.get('code') != 200:
            raise RuntimeError(f'{method} {path}: {envelope.get("message")}')
        return normalize_ids(envelope.get('data'))

    def once(self, key, path, body, method='POST'):
        if key not in self.state['created']:
            self.state['created'][key] = self.call(method, path, body)
            self.save()
            print('CREATED', key, flush=True)
        return self.state['created'][key]

    def check(self, condition, message):
        if not condition:
            raise AssertionError(message)
        if message not in self.state['checks']:
            self.state['checks'].append(message)
            self.save()
        print('PASS', message, flush=True)

    def resources(self):
        workshop = self.once('workshop', '/master-data/workshops', {
            'siteId': self.site, 'code': 'WS-ESS-01', 'name': '储能制造一车间', 'status': 'ACTIVE'})
        self.stations = {}
        for line_code, line_name, stations in [
            ('LN-MOD-01', '模组装配一线', [('MOD-010', '电芯堆叠与装配'), ('MOD-020', '模组连接检查'), ('MOD-030', '模组电性能终检')]),
            ('LN-PACK-01', '液冷PACK总装一线', [('PACK-010', '箱体与模组安装'), ('PACK-020', '电气连接与BMS核对'), ('PACK-030', 'PACK电性能终检')]),
            ('LN-HOME-01', '户储系统集成一线', [('HOME-010', '户储模组安装'), ('HOME-020', '户储系统终检')]),
        ]:
            line = self.once('line-' + line_code, '/identity/production-lines', {
                'workshopId': workshop['id'], 'code': line_code, 'name': line_name, 'status': 'ACTIVE'})
            for code, name in stations:
                self.stations[code] = self.once('station-' + code, '/identity/workstations', {
                    'productionLineId': line['id'], 'code': 'ST-' + code, 'name': name, 'status': 'ACTIVE',
                    'executionMode': 'MANUAL'})['id']

    def catalog(self):
        self.materials = {}
        for key, code, name, kind, brand, specification, _source in MATERIALS:
            self.materials[key] = self.once('material-' + key, MD + '/materials', {
                'code': code, 'name': name, 'materialTypeName': kind, 'brandName': brand,
                'specification': specification, 'version': 'B' if key == 'cell-eve' else '1.0',
                'materialPurpose': '生产物料', 'unit': '只' if kind == '原材料' else '套' if kind == '产成品' else '件'})
        for key, name, members in [
            ('ESS-LC-280', '工商业液冷储能系列', ['module-13s', 'pack-catl']),
            ('RESS-HV-HVM', '户用高压堆叠储能系列', ['module-byd', 'pack-byd83', 'pack-byd138']),
            ('RESS-LV-RACK', '户用低压机架储能系列', ['pack-pylon']),
        ]:
            family = self.once('family-' + key, MD + '/product-families', {'code': key, 'name': name})
            self.once('members-' + key, MD + '/product-families/' + family['id'] + '/members/batch-add', [self.materials[m]['id'] for m in members])

    @staticmethod
    def inspect(code, checks):
        return {'code': code, 'name': '装配检查', 'type': 'MANUAL_INSPECT', 'required': True, 'source': 'HUMAN', 'retestAfterReplacement': True,
                'checks': [{'code': code, 'name': name, 'kind': 'BOOLEAN', 'required': True} for code, name in checks]}

    def route(self, key, name, steps):
        route = self.once('route-' + key, MD + '/routes', {
            'code': 'RT-' + key, 'name': name, 'version': '1.0', 'commonAsset': True})
        nodes = []
        for i, (code, name) in enumerate(steps):
            op = self.once('operation-' + code, MD + '/operations', {
                'code': 'OP-' + code, 'name': name, 'status': 'ACTIVE', 'defaultDurationMinutes': 10})
            nodes.append({'nodeKey': code, 'operationId': op['id'], 'operationCode': op['code'], 'operationName': name,
                          'nodeType': 'OPERATION', 'positionX': i * 280, 'positionY': 0, 'sortOrder': i + 1, 'configJson': '{}'})
        version = route['versions'][0]['id']
        self.once('graph-' + key, MD + '/routes/' + route['id'] + '/versions/' + version + '/graph', {
            'nodes': nodes, 'relations': [{'sourceNodeKey': a['nodeKey'], 'targetNodeKey': b['nodeKey'], 'relationType': 'SEQUENTIAL', 'priority': 0}
                                        for a, b in zip(nodes, nodes[1:])]}, 'PUT')
        return version

    def manufacturing(self, key, name, product, child, child_type, count, steps, window):
        route = self.route(key, name + '路线', steps)
        slots = [f'{"C" if child_type == "CELL" else "M"}{i:02d}' for i in range(1, count + 1)]
        operations = []
        for i, (code, op_name) in enumerate(steps):
            if i == 0:
                actions = [{'code': 'ASSEMBLY', 'name': '序列化装配', 'type': 'ASSEMBLE', 'required': True, 'source': 'HUMAN', 'slotCodes': slots}]
            elif i == len(steps) - 1:
                actions = [{'code': 'OCV', 'name': '总电压核对', 'type': 'MEASURE', 'required': True, 'source': 'HUMAN', 'retestAfterReplacement': True,
                            'checks': [{'code': 'V', 'name': '总电压', 'kind': 'NUMBER', 'unit': 'V', 'min': window[0], 'max': window[1], 'required': True}]},
                           self.inspect('FINAL_CHECK', [('appearance', '外观及标识核对')])]
            else:
                actions = [self.inspect('CONNECTION_CHECK', [('polarity', '极性与连接核对'), ('barrier', '绝缘防护目视检查'), ('harness', '采样线束连接核对')])]
            operations.append({'nodeId': code, 'name': op_name, 'mode': 'MANUAL', 'stationIds': [self.stations[code]], 'documents': [], 'actions': actions})
        config = {'siteId': self.site, 'code': 'MP-' + key, 'name': name, 'version': '1.0',
                  'productId': self.materials[product]['id'], 'outputType': 'MODULE' if child_type == 'CELL' else 'PACK',
                  'routeVersionId': route, 'bom': [{'slotCode': slot, 'materialId': self.materials[child]['id'], 'childType': child_type, 'quantity': 1} for slot in slots],
                  'documents': [], 'operations': operations}
        version = self.once('manufacturing-' + key, '/pack/manufacturing-versions', config)
        current = self.call('GET', '/pack/manufacturing-versions/' + version['id'] + '?siteId=' + self.site)
        if current['status'] == 'DRAFT':
            self.check(self.call('POST', '/pack/manufacturing-versions/' + version['id'] + '/validate', {'siteId': self.site})['valid'], name + '制造版校验通过')
            current = self.call('POST', '/pack/manufacturing-versions/' + version['id'] + '/publish', {'siteId': self.site, 'revision': current['revision']})
        self.state['created']['manufacturing-' + key] = current
        self.save()
        return current

    def execution(self, obj):
        return self.call('GET', '/pack/execution?siteId=' + self.site + '&objectId=' + obj['id'])

    def command(self, key, obj, action, payload=None, station=None):
        saved = self.state['commands'].get(key)
        if saved and saved.get('done'):
            return saved['result']
        if not saved:
            view = self.execution(obj)
            body = {'siteId': self.site, 'objectId': obj['id'], 'revision': view['revision'], 'action': action, 'payload': payload or {},
                    'requestId': str(uuid.uuid5(uuid.NAMESPACE_URL, DATASET + '/' + key))}
            if station:
                body['stationId'] = self.stations[station]
            saved = self.state['commands'][key] = {'request': body}
            self.save()
        result = self.call('POST', '/pack/commands', saved['request'])['result']
        saved.update(result=result, done=True)
        self.save()
        return result

    def order(self, code, version, quantity, accept=True):
        order = self.once('order-' + code, '/pack/work-orders', {'siteId': self.site, 'orderNo': code, 'manufacturingVersionId': version['id'], 'quantity': quantity})
        if accept:
            self.once('accept-' + code, '/pack/work-orders/' + order['id'] + '/accept', {
                'siteId': self.site, 'stationId': version['frozen']['operations'][0]['stationIds'][0], 'revision': order['revision']})
        return order

    def obj(self, key, sn, material, kind, order=None):
        body = {'siteId': self.site, 'objectNo': sn, 'materialId': self.materials[material]['id'], 'type': kind}
        if order:
            body['workOrderId'] = order['id']
        else:
            body.update(supplierBatch='RCV-20261024-001')
        return self.once('object-' + key, '/pack/objects', body)

    def inspection(self, key, obj, operation):
        for action in operation['actions']:
            if action['type'] == 'MANUAL_INSPECT':
                self.command(key + '-' + action['code'], obj, 'RECORD_TEST', {
                    'actionCode': action['code'], 'values': [{'code': check['code'], 'value': True} for check in action['checks']]}, operation['nodeId'])

    def build(self, key, obj, version, children, voltage, *, release=False, repair_cell=None, leave_ng=False, authorize_only=False):
        ops = version['frozen']['operations']
        first = ops[0]['nodeId']
        self.command(key + '-enter-assembly', obj, 'CHECK_IN', {'nodeId': first}, first)
        for slot, child in zip(version['frozen']['bom'], children):
            self.command(key + '-bind-' + slot['slotCode'], obj, 'BIND', {'slotCode': slot['slotCode'], 'childCode': child['objectNo']}, first)
        self.command(key + '-complete-assembly', obj, 'COMPLETE_VISIT', station=first)
        for op in ops[1:-1]:
            self.command(key + '-enter-' + op['nodeId'], obj, 'CHECK_IN', {'nodeId': op['nodeId']}, op['nodeId'])
            self.inspection(key, obj, op)
            self.command(key + '-complete-' + op['nodeId'], obj, 'COMPLETE_VISIT', station=op['nodeId'])
        end = ops[-1]['nodeId']
        self.command(key + '-enter-eol', obj, 'CHECK_IN', {'nodeId': end}, end)
        self.command(key + '-voltage', obj, 'RECORD_TEST', {'actionCode': 'OCV', 'values': [{'code': 'V', 'value': voltage, 'unit': 'V'}]}, end)
        if leave_ng:
            self.check(self.execution(obj)['object']['qualityState'] == 'HOLD', obj['objectNo'] + '超限后阻断')
            if authorize_only:
                self.command(key + '-authorize', obj, 'AUTHORIZE_REWORK', {'reason': '总电压复核异常，授权回装配工序检查并更换末位电芯',
                            'targetNodeId': first, 'targetStationId': self.stations[first]})
            return
        if repair_cell:
            task = self.command(key + '-authorize', obj, 'AUTHORIZE_REWORK', {'reason': '末位电芯异常，授权拆换后全项复测',
                                'targetNodeId': first, 'targetStationId': self.stations[first]})
            self.command(key + '-repair-enter', obj, 'CHECK_IN', {'nodeId': first}, first)
            self.command(key + '-replace', obj, 'REPLACE', {'reworkId': task['id'], 'slotCode': version['frozen']['bom'][-1]['slotCode'],
                         'childCode': repair_cell['objectNo'], 'removedDisposition': 'QUARANTINE', 'reason': '异常电芯拆出隔离，换件后重新检验'}, first)
            self.command(key + '-repair-complete', obj, 'COMPLETE_VISIT', station=first)
            for op in ops[1:-1]:
                self.command(key + '-retest-enter-' + op['nodeId'], obj, 'CHECK_IN', {'nodeId': op['nodeId']}, op['nodeId'])
                self.inspection(key + '-retest', obj, op)
                self.command(key + '-retest-complete-' + op['nodeId'], obj, 'COMPLETE_VISIT', station=op['nodeId'])
            self.command(key + '-retest-enter-eol', obj, 'CHECK_IN', {'nodeId': end}, end)
            self.command(key + '-retest-voltage', obj, 'RECORD_TEST', {'actionCode': 'OCV', 'values': [{'code': 'V', 'value': '41.620', 'unit': 'V'}]}, end)
            self.inspection(key + '-retest', obj, ops[-1])
            self.command(key + '-close-rework', obj, 'CLOSE_REWORK', {'reworkId': task['id']})
        else:
            self.inspection(key, obj, ops[-1])
        self.command(key + '-complete-eol', obj, 'COMPLETE_VISIT', station=end)
        if release:
            self.command(key + '-release', obj, 'RELEASE', {'reason': '装配谱系、复测及检查记录核对完成'})

    def run(self):
        self.token = self.call('POST', '/auth/login', {'username': 'admin', 'password': os.environ.get('PACK_REFERENCE_ADMIN_PASSWORD', 'admin123')})['token']
        try:
            if self.state['status'] == 'READY':
                self.verify()
                return
            self.resources()
            self.catalog()
            module = self.manufacturing('LFP-13S280', '13S280储能模组装配', 'module-13s', 'cell-catl', 'CELL', 13,
                                        [('MOD-010', '电芯堆叠与装配'), ('MOD-020', '模组连接检查'), ('MOD-030', '模组电性能终检')], ('40.5', '43.0'))
            pack = self.manufacturing('M52280-E', 'M52280-E液冷电箱总装', 'pack-catl', 'module-13s', 'MODULE', 4,
                                      [('PACK-010', '箱体与模组安装'), ('PACK-020', '电气连接与BMS核对'), ('PACK-030', 'PACK电性能终检')], ('162', '172'))
            home = self.manufacturing('BYD-HVM138', 'HVM13.8户储系统集成', 'pack-byd138', 'module-byd', 'MODULE', 5,
                                      [('HOME-010', '户储模组安装'), ('HOME-020', '户储系统终检')], ('250', '270'))
            for key, published in [('LFP-13S280', module), ('M52280-E', pack)]:
                draft = copy.deepcopy(published['config'])
                draft['version'] = '1.1'
                self.once('manufacturing-draft-' + key, '/pack/manufacturing-versions', draft)
            cells = [self.obj('cell-' + str(i), f'C280-261024-{i:05d}', 'cell-catl', 'CELL') for i in range(1, 141)]
            for i in range(1, 4):
                self.obj('eve-' + str(i), f'LF280K-261024-{i:05d}', 'cell-eve', 'CELL')
            made = []
            for group in [1, 2]:
                order = self.order(f'MO-20261024-M-{group:03d}', module, 4)
                for n in range(4):
                    index = (group - 1) * 4 + n
                    obj = self.obj('module-' + str(index + 1), f'M13280-261024-{index+1:04d}', 'module-13s', 'MODULE', order)
                    self.build('module-' + str(index + 1), obj, module, cells[index*13:(index+1)*13], '45.800' if index == 0 else f'{41.62+n*.01:.3f}',
                               release=True, repair_cell=cells[130] if index == 0 else None)
                    made.append(obj)
            order = self.order('MO-20261024-P-001', pack, 1)
            obj = self.obj('pack-1', 'P52280-261024-0001', 'pack-catl', 'PACK', order)
            self.build('pack-1', obj, pack, made[:4], '166.540', release=True)
            order = self.order('MO-20261024-P-002', pack, 1)
            obj = self.obj('pack-2', 'P52280-261024-0002', 'pack-catl', 'PACK', order)
            self.build('pack-2', obj, pack, made[4:8], '175.200', leave_ng=True)
            order = self.order('MO-20261024-M-003', module, 4)
            pending = [self.obj('module-' + str(i), f'M13280-261024-{i:04d}', 'module-13s', 'MODULE', order) for i in range(9, 13)]
            self.build('module-9', pending[0], module, cells[104:117], '44.800', leave_ng=True, authorize_only=True)
            self.command('module-10-enter', pending[1], 'CHECK_IN', {'nodeId': 'MOD-010'}, 'MOD-010')
            for n in range(6):
                self.command('module-10-bind-' + str(n), pending[1], 'BIND', {'slotCode': f'C{n+1:02d}', 'childCode': cells[117+n]['objectNo']}, 'MOD-010')
            self.order('MO-20261024-P-003', pack, 2, accept=False)
            modules = [self.obj('byd-module-' + str(i), f'HVM276-261024-{i:04d}', 'module-byd', 'MODULE') for i in range(1, 6)]
            order = self.order('MO-20261024-H-001', home, 1)
            obj = self.obj('home-1', 'HVM138-261024-0001', 'pack-byd138', 'PACK', order)
            self.build('home-1', obj, home, modules, '256.120')
            self.order('MO-20261024-H-002', home, 2, accept=False)
            self.verify()
            self.state['status'] = 'READY'
            self.state.pop('lastError', None)
            self.save()
        finally:
            self.call('POST', '/auth/logout', {})

    def verify(self):
        records = self.state['created']
        self.check(len([k for k in records if k.startswith('material-')]) == 8, '8种有来源的电芯、模组与储能产品资料已建档')
        trace = self.call('GET', '/pack/trace/' + records['object-pack-1']['id'] + '?siteId=' + self.site)
        self.check(trace['object']['qualityState'] == 'ACCEPTED', '液冷PACK完成独立质量放行')
        self.check(len(trace['currentChildren']) == 4 and all(len(x['child']['currentChildren']) == 13 for x in trace['currentChildren']), '液冷PACK完整追溯4个模组、52只电芯')
        module = trace['currentChildren'][0]['child']
        self.check(any(x['status'] == 'CLOSED' for x in module['reworks']) and any(x.get('removedDisposition') == 'QUARANTINE' for x in module['historyLinks']), '换芯、隔离、复测和返修关闭历史完整')
        old = self.call('GET', '/pack/trace/' + records['object-cell-13']['id'] + '?siteId=' + self.site)
        self.check(any(x.get('parentId') == records['object-module-1']['id'] and x.get('removedAt') for x in old['historyLinks']), '拆出电芯可反查原模组')
        ng = self.execution(records['object-pack-2'])
        self.check(ng['object']['qualityState'] == 'HOLD' and not ng['allowedActions']['COMPLETE_VISIT'] and not ng['allowedActions']['RELEASE'], '待处置PACK的NG仍阻断完工与放行')
        rework = self.execution(records['object-module-9'])
        self.check(rework['object']['qualityState'] == 'REWORK' and rework.get('activeRework') is not None, '待返修模组保留可执行的授权任务')
        active = self.execution(records['object-module-10'])
        self.check(active['object']['productionState'] == 'IN_PROCESS' and sum(bool(s.get('link')) for s in active['slots']) == 6, '在制模组实际绑定6只电芯，工作台可继续装配')
        home = self.execution(records['object-home-1'])
        self.check(home['object']['productionState'] == 'COMPLETED' and home['object']['qualityState'] == 'PENDING' and home['allowedActions']['RELEASE'], 'HVM13.8系统保留真实待质量放行状态')
        published = [v for k, v in records.items() if k.startswith('manufacturing-') and not k.startswith('manufacturing-draft-')]
        self.check(len(published) == 3 and all(v['status'] == 'PUBLISHED' and v.get('snapshotHash') for v in published), '3套制造版本均通过服务端校验并冻结发布')
        self.state['verification'] = {'status': 'PASSED', 'packObjectId': records['object-pack-1']['id'],
                                      'releaseId': trace['releases'][-1]['id'], 'releaseHash': trace['releases'][-1]['snapshotHash'],
                                      'purpose': NOTICE, 'inspectionBasis': WINDOW_NOTE}
        self.save()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Create the reference dataset through the isolated local API')
    args = parser.parse_args()
    if not args.apply:
        print(json.dumps({'dataset': DATASET, 'baseUrl': BASE, 'purpose': NOTICE, 'materials': [{'code': x[1], 'name': x[2], 'specification': x[5]} for x in MATERIALS], 'sources': SOURCES}, ensure_ascii=False, indent=2))
    else:
        seed = Seeder()
        try:
            seed.run()
            print('READY', MANIFEST)
        except Exception as error:
            seed.state['lastError'] = str(error).replace(seed.token, '[redacted]') if seed.token else str(error)
            seed.save()
            raise
