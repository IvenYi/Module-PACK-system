#!/usr/bin/env python3
"""Real HTTP acceptance for this isolated Pack backend; retains uniquely named QA data.

The limits, two-cell BOM and separate assembly/inspection operations below are
acceptance fixtures, not a real product specification. No form, DHR, workflow
template, or device OK is created.
"""
import concurrent.futures
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = os.environ.get("PACK_VERIFY_BASE_URL", "http://127.0.0.1:8090").rstrip("/")
base_match = re.fullmatch(r"http://127\.0\.0\.1:([0-9]{1,5})", BASE)
if base_match is None or not 1 <= int(base_match.group(1)) <= 65535:
    raise ValueError("PACK_VERIFY_BASE_URL must be an http://127.0.0.1:<port> origin")
RUN = "QA-PACK-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ-") + uuid.uuid4().hex[:5]
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / ".pack-runtime" / ("pack-verification-" + RUN + ".json")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise RuntimeError("Refusing redirect from isolated backend")


class ApiError(RuntimeError):
    def __init__(self, status, envelope):
        super().__init__(str(envelope.get("message", envelope)))
        self.status = status


class Acceptance:
    def __init__(self):
        self.token = ""
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        self.log = {"prefix": RUN, "baseUrl": BASE, "status": "RUNNING", "created": {}, "checks": [], "requests": []}

    def save(self):
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(self.log, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def check(self, condition, message):
        if not condition:
            raise AssertionError(message)
        self.log["checks"].append(message)
        self.save()
        print("PASS", message, flush=True)

    def call(self, method, path, body=None):
        if not path.startswith("/api/v1/") or urllib.parse.urlsplit(path).netloc:
            raise ValueError("Only local /api/v1 paths are allowed")
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        item = {"method": method, "path": path}
        self.log["requests"].append(item)
        try:
            with self.opener.open(urllib.request.Request(BASE + path, data=data, headers=headers, method=method), timeout=30) as response:
                item["status"] = response.status
                result = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            item["status"] = error.code
            result = json.loads(error.read().decode("utf-8"))
            raise ApiError(error.code, result) from error
        if result.get("code") != 200:
            raise ApiError(item["status"], result)
        return result.get("data")

    def create(self, name, path, body):
        row = self.call("POST", path, body)
        self.log["created"][name] = {key: row.get(key) for key in ("id", "code", "name", "objectNo", "orderNo", "version") if row.get(key) is not None}
        self.save()
        return row

    def reject(self, method, path, body, description):
        try:
            self.call(method, path, body)
        except ApiError as error:
            self.check(error.status in (400, 403, 409), description + ": " + str(error))
            return error
        raise AssertionError("Expected rejection: " + description)

    def execution(self, object_id, station):
        return self.call("GET", "/api/v1/pack/execution?" + urllib.parse.urlencode({"siteId": self.site, "objectId": object_id, "stationId": station}))

    @staticmethod
    def operation_state(view, node):
        return next((row for row in view.get("operationStates", []) if row["nodeId"] == node), {})

    def execute(self, object_id, action, payload=None, request_id=None, station=None):
        view = self.call("GET", "/api/v1/pack/execution?" + urllib.parse.urlencode({"siteId": self.site, "objectId": object_id}))
        station = station or (view.get("visit") or {}).get("stationId") or self.station
        body = {"siteId": self.site, "stationId": station, "objectId": object_id, "revision": view["revision"], "requestId": request_id or str(uuid.uuid4()), "action": action, "payload": payload or {}}
        return self.call("POST", "/api/v1/pack/commands", body)

    def test(self, object_id, voltage):
        return self.execute(object_id, "RECORD_TEST", {"actionCode": "voltage", "values": [{"code": "V", "value": voltage, "unit": "V"}]})

    def inspect(self, object_id):
        return self.execute(object_id, "RECORD_TEST", {"actionCode": "visual", "values": [{"code": "appearance", "value": True}]})

    def version(self, name, product, child_material, child_type, slots):
        config = {"siteId": self.site, "code": RUN + "-" + name, "name": RUN + " " + name, "version": "1", "productId": product, "outputType": name, "routeVersionId": self.route_version,
                  "bom": [{"slotCode": slot, "materialId": child_material, "childType": child_type, "quantity": 1} for slot in slots], "documents": [],
                  "operations": [{"nodeId": "assembly-test", "name": "装配", "stationIds": [self.station], "mode": "MANUAL", "documents": [], "actions": [
                      {"code": "assemble", "type": "ASSEMBLE", "required": True, "source": "HUMAN", "slotCodes": slots}]},
                      {"nodeId": "inspection", "name": "检测", "stationIds": [self.test_station], "mode": "MANUAL", "documents": [], "actions": [
                      {"code": "voltage", "type": "MEASURE", "required": True, "source": "HUMAN", "retestAfterReplacement": True, "checks": [{"code": "V", "name": "QA电压", "kind": "NUMBER", "unit": "V", "min": "3", "max": "4.2", "required": True}]},
                      {"code": "visual", "type": "MANUAL_INSPECT", "required": True, "source": "HUMAN", "retestAfterReplacement": True, "checks": [{"code": "appearance", "name": "QA外观", "kind": "BOOLEAN", "required": True}]}]}]}
        row = self.create(name + "Version", "/api/v1/pack/manufacturing-versions", config)
        validation = self.call("POST", "/api/v1/pack/manufacturing-versions/" + row["id"] + "/validate", {"siteId": self.site})
        self.check(validation["valid"], name + " version passes real publication validation")
        published = self.call("POST", "/api/v1/pack/manufacturing-versions/" + row["id"] + "/publish", {"siteId": self.site, "revision": row["revision"]})
        self.check(published["status"] == "PUBLISHED" and bool(published["snapshotHash"]), name + " frozen manufacturing version published without medical templates")
        self.reject("PUT", "/api/v1/pack/manufacturing-versions/" + row["id"], {**config, "revision": published["revision"]}, "Published version cannot be rewritten")
        return published

    def order(self, name, version, material):
        row = self.create(name + "Order", "/api/v1/pack/work-orders", {"siteId": self.site, "orderNo": RUN + "-" + name + "-WO", "manufacturingVersionId": version["id"], "quantity": 1})
        self.call("POST", "/api/v1/pack/work-orders/" + row["id"] + "/accept", {"siteId": self.site, "stationId": self.station, "revision": row["revision"]})
        return self.create(name, "/api/v1/pack/objects", {"siteId": self.site, "objectNo": RUN + "-" + name, "type": name, "materialId": material, "workOrderId": row["id"]})

    def run(self):
        self.token = self.call("POST", "/api/v1/auth/login", {"username": "admin", "password": "admin123"})["token"]
        sites = self.call("GET", "/api/v1/identity/sites?page=1&size=200")["content"]
        self.site = next(row["id"] for row in sites if row["status"] == "ACTIVE")
        before = self.call("GET", "/api/v1/pack/statistics?siteId=" + self.site)
        workshop = self.create("workshop", "/api/v1/master-data/workshops", {"siteId": self.site, "code": RUN + "-WS", "name": RUN + " 验收车间", "status": "ACTIVE"})
        line = self.create("line", "/api/v1/identity/production-lines", {"workshopId": workshop["id"], "code": RUN + "-LINE", "name": RUN + " 验收产线", "status": "ACTIVE"})
        station = self.create("station", "/api/v1/identity/workstations", {"productionLineId": line["id"], "code": RUN + "-ST", "name": RUN + " 人工装配站", "executionMode": "MANUAL", "status": "ACTIVE"})
        self.station = station["id"]
        self.test_station = self.create("inspectionStation", "/api/v1/identity/workstations", {"productionLineId": line["id"], "code": RUN + "-TEST", "name": RUN + " 人工检测站", "executionMode": "MANUAL", "status": "ACTIVE"})["id"]
        materials = {}
        for name, kind in (("CELL", "原材料"), ("MODULE", "半成品"), ("PACK", "产成品"), ("WRONG", "原材料")):
            materials[name] = self.create(name + "Material", "/api/v1/master-data/process-modeling/materials", {"code": RUN + "-" + name, "name": RUN + " " + name, "version": "1", "materialTypeName": kind, "materialPurpose": "生产物料", "unit": "件"})["id"]
        op = self.create("operation", "/api/v1/master-data/process-modeling/operations", {"code": RUN + "-OP", "name": RUN + " 装配", "status": "ACTIVE"})
        inspection = self.create("inspectionOperation", "/api/v1/master-data/process-modeling/operations", {"code": RUN + "-INSP", "name": RUN + " 检测", "status": "ACTIVE"})
        route = self.create("route", "/api/v1/master-data/process-modeling/routes", {"code": RUN + "-R", "name": RUN + " 验收路线", "version": "1", "commonAsset": True})
        self.route_version = route["versions"][0]["id"]
        graph = {"nodes": [{"nodeKey": "assembly-test", "operationId": op["id"], "operationCode": op["code"], "operationName": op["name"], "nodeType": "OPERATION", "positionX": 0, "positionY": 0, "sortOrder": 1, "configJson": "{}"}, {"nodeKey": "inspection", "operationId": inspection["id"], "operationCode": inspection["code"], "operationName": inspection["name"], "nodeType": "OPERATION", "positionX": 300, "positionY": 0, "sortOrder": 2, "configJson": "{}"}], "relations": [{"sourceNodeKey": "assembly-test", "targetNodeKey": "inspection", "relationType": "SEQUENTIAL", "priority": 0}]}
        self.call("PUT", "/api/v1/master-data/process-modeling/routes/" + route["id"] + "/versions/" + self.route_version + "/graph", graph)
        module_version = self.version("MODULE", materials["MODULE"], materials["CELL"], "CELL", ["C1", "C2"])
        pack_version = self.version("PACK", materials["PACK"], materials["MODULE"], "MODULE", ["M1"])
        disconnected_route = self.create("disconnectedRoute", "/api/v1/master-data/process-modeling/routes", {"code": RUN + "-DISCONNECTED-R", "name": RUN + " 断图验收路线", "version": "1", "commonAsset": True})
        disconnected_route_version = disconnected_route["versions"][0]["id"]
        self.call("PUT", "/api/v1/master-data/process-modeling/routes/" + disconnected_route["id"] + "/versions/" + disconnected_route_version + "/graph", {"nodes": graph["nodes"], "relations": []})
        disconnected_config = {**module_version["config"], "code": RUN + "-DISCONNECTED", "name": RUN + " 断图验收制造草稿", "routeVersionId": disconnected_route_version}
        disconnected = self.create("disconnectedVersion", "/api/v1/pack/manufacturing-versions", disconnected_config)
        disconnected_path = "/api/v1/pack/manufacturing-versions/" + disconnected["id"]
        disconnected_validation = self.call("POST", disconnected_path + "/validate", {"siteId": self.site})
        self.check(not disconnected_validation["valid"] and any("入口" in issue or "同一条" in issue for issue in disconnected_validation["issues"]), "Disconnected operations fail real manufacturing publication validation")
        self.reject("POST", disconnected_path + "/publish", {"siteId": self.site, "revision": disconnected["revision"]}, "Disconnected manufacturing version cannot publish")
        disconnected_after = self.call("GET", disconnected_path + "?siteId=" + self.site)
        self.check(disconnected_after["status"] == "DRAFT" and disconnected_after["revision"] == disconnected["revision"] and not disconnected_after.get("frozen") and not disconnected_after.get("snapshotHash"), "Rejected disconnected publication leaves its dedicated draft unchanged and unfrozen")
        cells = {}
        for name, material in (("CELL-A", "CELL"), ("CELL-B", "CELL"), ("CELL-SPARE", "CELL"), ("WRONG-CELL", "WRONG")):
            cells[name] = self.create(name, "/api/v1/pack/objects", {"siteId": self.site, "objectNo": RUN + "-" + name, "type": "CELL", "materialId": materials[material], "supplierBatch": RUN + "-LOT", "evidenceNote": "QA fixture manual receipt; no physical device evidence"})
        module = self.order("MODULE", module_version, materials["MODULE"])
        mid = module["id"]
        initial = self.execution(mid, self.test_station)
        inspection_state = self.operation_state(initial, "inspection")
        self.check(inspection_state.get("status") == "BLOCKED" and inspection_state.get("canCheckIn") is False and any("前序" in reason for reason in inspection_state.get("blockers", [])) and initial["allowedActions"]["CHECK_IN"] is False, "Initial inspection is blocked by its unfinished predecessor at the inspection station")
        self.reject("POST", "/api/v1/pack/commands", {"siteId": self.site, "stationId": self.test_station, "objectId": mid, "revision": initial["revision"], "requestId": str(uuid.uuid4()), "action": "CHECK_IN", "payload": {"nodeId": "inspection"}}, "Direct inspection check-in cannot skip assembly")
        after_skip = self.execution(mid, self.test_station)
        self.check(after_skip["revision"] == initial["revision"] and after_skip["visits"] == initial["visits"] and after_skip["visit"] == initial["visit"], "Rejected station skip leaves object revision and visits unchanged")
        self.execute(mid, "CHECK_IN", {"nodeId": "assembly-test"})
        view = self.call("GET", "/api/v1/pack/execution?siteId=" + self.site + "&objectId=" + mid)
        wrong = {"siteId": self.site, "stationId": self.station, "objectId": mid, "revision": view["revision"], "requestId": str(uuid.uuid4()), "action": "BIND", "payload": {"slotCode": "C1", "childCode": cells["WRONG-CELL"]["objectNo"]}}
        self.reject("POST", "/api/v1/pack/commands", wrong, "Wrong material is blocked by frozen BOM")
        bind = {**wrong, "requestId": str(uuid.uuid4()), "payload": {"slotCode": "C1", "childCode": cells["CELL-A"]["objectNo"]}}
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.call("POST", "/api/v1/pack/commands", bind), range(2)))
        self.check(results[0] == results[1], "Concurrent retry of one request returns the same committed result")
        self.check(self.call("GET", "/api/v1/pack/commands/" + bind["requestId"] + "?siteId=" + self.site)["found"], "Committed request is recoverable after an uncertain response")
        self.reject("POST", "/api/v1/pack/commands", {**bind, "payload": {"slotCode": "C2", "childCode": cells["CELL-A"]["objectNo"]}}, "Same request ID cannot change payload")
        self.execute(mid, "BIND", {"slotCode": "C2", "childCode": cells["CELL-B"]["objectNo"]})
        assembled = self.execute(mid, "COMPLETE_VISIT")
        self.check(assembled["execution"]["object"]["productionState"] == "IN_PROCESS", "Assembly completion cannot skip the downstream inspection operation")
        completed_assembly = self.execution(mid, self.station)
        assembly_state = self.operation_state(completed_assembly, "assembly-test")
        self.check(assembly_state.get("status") == "COMPLETED" and assembly_state.get("canCheckIn") is False and any("返修授权" in reason for reason in assembly_state.get("blockers", [])), "Completed assembly explicitly requires rework authorization before returning")
        return_error = self.reject("POST", "/api/v1/pack/commands", {"siteId": self.site, "stationId": self.station, "objectId": mid, "revision": completed_assembly["revision"], "requestId": str(uuid.uuid4()), "action": "CHECK_IN", "payload": {"nodeId": "assembly-test"}}, "Normal check-in cannot revisit completed assembly")
        self.check("返修授权" in str(return_error), "Rejected normal return provides an explicit rework-authorization reason")
        after_return = self.execution(mid, self.station)
        self.check(after_return["revision"] == completed_assembly["revision"] and after_return["visits"] == completed_assembly["visits"] and after_return["visit"] == completed_assembly["visit"], "Rejected normal return leaves object revision and visits unchanged")
        ready_inspection = self.execution(mid, self.test_station)
        inspection_state = self.operation_state(ready_inspection, "inspection")
        self.check(inspection_state.get("status") == "EXECUTABLE" and inspection_state.get("canCheckIn") is True and not inspection_state.get("blockers") and ready_inspection["allowedActions"]["CHECK_IN"] is True, "Inspection becomes executable at its configured station after assembly completes")
        wrong_inspection_state = self.operation_state(after_return, "inspection")
        self.check(wrong_inspection_state.get("canCheckIn") is False and any("工位" in reason for reason in wrong_inspection_state.get("blockers", [])), "Inspection remains blocked when the assembly station is selected")
        self.execute(mid, "CHECK_IN", {"nodeId": "inspection"}, station=self.test_station)
        self.inspect(mid)
        failed = self.test(mid, "2.900")
        self.check(failed["result"]["mesResult"] == "FAIL" and failed["execution"]["object"]["qualityState"] == "HOLD", "Out-of-limit raw value persists and creates quality HOLD")
        view = failed["execution"]
        self.reject("POST", "/api/v1/pack/commands", {"siteId": self.site, "stationId": self.test_station, "objectId": mid, "revision": view["revision"], "requestId": str(uuid.uuid4()), "action": "COMPLETE_VISIT", "payload": {}}, "NG prevents normal operation completion")
        origin_visit = view["visit"]["id"]
        authorized = self.execute(mid, "AUTHORIZE_REWORK", {"reason": "QA downstream NG return to assembly for replacement", "targetNodeId": "assembly-test", "targetStationId": self.station})
        rework_id = authorized["result"]["id"]
        self.check(authorized["result"]["originVisitId"] == origin_visit and authorized["execution"]["visit"] is None and any(row["id"] == origin_visit and row["status"] == "SUSPENDED" for row in authorized["execution"]["visits"]), "Quality authorization suspends and preserves the original downstream NG visit")
        repair_state = self.operation_state(self.execution(mid, self.station), "assembly-test")
        self.check(repair_state.get("status") == "EXECUTABLE" and repair_state.get("canCheckIn") is True and not repair_state.get("blockers"), "Authorized upstream repair target becomes executable at its configured station")
        self.reject("POST", "/api/v1/pack/commands", {"siteId": self.site, "objectId": mid, "revision": authorized["execution"]["revision"], "requestId": str(uuid.uuid4()), "action": "HOLD", "payload": {"reason": "QA repeated HOLD must not strand an open rework task"}}, "Repeated manual HOLD cannot strand an open controlled rework task")
        wrong_return = {"siteId": self.site, "stationId": self.test_station, "objectId": mid, "revision": authorized["execution"]["revision"], "requestId": str(uuid.uuid4()), "action": "CHECK_IN", "payload": {"nodeId": "inspection"}}
        self.reject("POST", "/api/v1/pack/commands", wrong_return, "Rework cannot skip its authorized upstream repair target")
        self.execute(mid, "CHECK_IN", {"nodeId": "assembly-test"}, station=self.station)
        replaced = self.execute(mid, "REPLACE", {"reworkId": rework_id, "slotCode": "C2", "childCode": cells["CELL-SPARE"]["objectNo"], "removedDisposition": "QUARANTINE", "reason": "QA replace failed cell; removed cell quarantined"})
        self.check(sum(row["validEvidence"] is False for row in replaced["execution"]["tests"]) == 2, "Replacement invalidates both old inspection evidences without deleting them")
        self.reject("POST", "/api/v1/pack/commands", {"siteId": self.site, "stationId": self.station, "objectId": mid, "revision": replaced["execution"]["revision"], "requestId": str(uuid.uuid4()), "action": "CLOSE_REWORK", "payload": {"reworkId": rework_id}}, "Rework cannot close before required retests")
        repaired = self.execute(mid, "COMPLETE_VISIT")
        self.check(any(row["nodeId"] == "inspection" and row["phase"] == "RETEST" for row in repaired["execution"]["activeRework"]["allowedTargets"]), "Completing the authorized repair target enables only required retest operations")
        self.execute(mid, "CHECK_IN", {"nodeId": "inspection"}, station=self.test_station)
        self.test(mid, "3.700")
        self.inspect(mid)
        self.execute(mid, "CLOSE_REWORK", {"reworkId": rework_id})
        completed = self.execute(mid, "COMPLETE_VISIT")
        self.check(completed["execution"]["object"]["productionState"] == "COMPLETED" and completed["execution"]["object"]["qualityState"] == "PENDING", "Manufacturing completion is separate from quality release")
        module_release = self.execute(mid, "RELEASE", {"reason": "QA all retests and assembly verified"})
        self.check(module_release["execution"]["object"]["qualityState"] == "ACCEPTED", "Module independently released after quality verification")
        self.check(len(module_release["execution"]["visits"]) == 4 and any(row["id"] == origin_visit and row["status"] == "SUSPENDED" for row in module_release["execution"]["visits"]), "Cross-operation rework preserves all original and controlled repair/retest visits")
        pack = self.order("PACK", pack_version, materials["PACK"])
        pid = pack["id"]
        self.execute(pid, "CHECK_IN", {"nodeId": "assembly-test"})
        self.execute(pid, "BIND", {"slotCode": "M1", "childCode": module["objectNo"]})
        self.execute(pid, "COMPLETE_VISIT")
        self.execute(pid, "CHECK_IN", {"nodeId": "inspection"}, station=self.test_station)
        self.test(pid, "3.800")
        self.inspect(pid)
        self.execute(pid, "COMPLETE_VISIT")
        released = self.execute(pid, "RELEASE", {"reason": "QA PACK genealogy and inspection verified"})
        self.check(released["execution"]["object"]["qualityState"] == "ACCEPTED", "PACK independently released")
        trace = self.call("GET", "/api/v1/pack/trace/" + pid + "?siteId=" + self.site)
        module_trace = trace["currentChildren"][0]["child"]
        self.check({link["childCode"] for link in module_trace["currentChildren"]} == {cells["CELL-A"]["objectNo"], cells["CELL-SPARE"]["objectNo"]}, "PACK trace resolves the actual current two-level genealogy")
        old_trace = self.call("GET", "/api/v1/pack/trace/" + cells["CELL-B"]["id"] + "?siteId=" + self.site)
        self.check(any(row["parentId"] == mid and row["removedAt"] for row in old_trace["historyLinks"]), "Removed cell still resolves its historical module relation")
        self.check(any(row["childId"] == cells["CELL-B"]["id"] and row["removedDisposition"] == "QUARANTINE" for row in module_trace["historyLinks"]), "Removed-cell disposition remains queryable")
        release_id = released["result"]["id"]
        frozen = self.call("GET", "/api/v1/pack/releases/" + release_id + "?siteId=" + self.site)
        self.check(frozen["snapshot"]["currentChildren"][0]["child"]["object"]["id"] == mid and bool(frozen["snapshotHash"]), "Delivery record freezes genealogy and evidence with a digest")
        after = self.call("GET", "/api/v1/pack/statistics?siteId=" + self.site)
        self.check(after["MODULE"]["completed"] == before["MODULE"]["completed"] + 1 and after["PACK"]["completed"] == before["PACK"]["completed"] + 1, "Retests and request retries do not duplicate finished-product quantities")
        self.log["status"] = "PASSED"
        self.log["siteId"] = self.site
        self.log["stationId"] = self.station
        self.log["inspectionStationId"] = self.test_station
        self.log["releaseId"] = release_id
        self.log["releaseSnapshotHash"] = frozen["snapshotHash"]
        self.log["packTrace"] = trace
        self.log["browserPaths"] = {"execution": "/pack/execution?" + urllib.parse.urlencode({"siteId": self.site, "objectId": pid, "stationId": self.station}), "trace": "/pack/trace?" + urllib.parse.urlencode({"siteId": self.site, "objectId": pid}), "quality": "/pack/quality?" + urllib.parse.urlencode({"siteId": self.site, "objectId": pid})}
        self.save()
        print("PASS", RUN, len(self.log["checks"]), "checks; evidence:", OUTPUT)


if __name__ == "__main__":
    acceptance = Acceptance()
    try:
        acceptance.run()
    except Exception as error:
        acceptance.log["status"] = "FAILED"
        acceptance.log["error"] = str(error).replace("admin123", "[redacted]").replace(acceptance.token, "[redacted]") if acceptance.token else str(error).replace("admin123", "[redacted]")
        acceptance.save()
        print("FAIL", acceptance.log["error"], "Partial evidence:", OUTPUT, file=sys.stderr)
        sys.exit(1)
