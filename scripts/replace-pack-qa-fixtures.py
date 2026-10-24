#!/usr/bin/env python3
"""Replace only a reviewed local QA graph; the default mode is database READ ONLY.

Usage:
  python3 scripts/replace-pack-qa-fixtures.py --manifest .pack-runtime/old-qa-replacement-manifest.json
  python3 scripts/replace-pack-qa-fixtures.py --manifest PATH --apply

Manifest formatVersion=1 has target {host,port,database,tenantId,tenantKey,siteIds}
and records {table:[{id:"decimal ID",expected:{exact_old_column:value}}]}.
The supported root tables and required old identity columns are ROOT_IDENTITIES.
No name/prefix query selects deletion candidates. Prefixes only validate the
explicit manifest and help detect retained references to the exact old names.

Apply revalidates a locked snapshot, exports exact row JSON, SHA-256 digests,
retained audit history and a guarded restore.sql under ignored .pack-runtime,
then deletes only the collected graph in one transaction. audit_event is never
inserted, updated or deleted. The export records the maintenance action instead.
"""
import argparse
from dataclasses import dataclass
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import uuid


ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env.pack.local"
RUNTIME = ROOT / ".pack-runtime"
PSQL = Path("/opt/homebrew/opt/postgresql@18/bin/psql")
HOST, PORT, DATABASE, USER = "127.0.0.1", 55440, "pack_edhr_dev", "pack_edhr"
ROOT_IDENTITIES = {
    "pack_object": ("object_no",), "pack_work_order": ("order_no",),
    "pack_manufacturing_version": ("code", "name", "version"),
    "material": ("code", "name", "version"), "route": ("name",),
    "route_version": ("code", "version"), "operation": ("code", "name"),
    "pack_workstation": ("code", "name"), "production_line": ("code", "name"),
    "workshop": ("code", "name"),
}
OWNED = {
    "pack_bom_line": (("version_id", "pack_manufacturing_version"),),
    "pack_operation_action": (("version_id", "pack_manufacturing_version"),),
    "pack_manufacturing_station": (("version_id", "pack_manufacturing_version"),),
    "route_node": (("route_version_id", "route_version"),),
    "route_relation": (("route_version_id", "route_version"),),
    "route_operation": (("route_id", "route"),),
    "pack_visit": (("object_id", "pack_object"),),
    "pack_action_run": (("visit_id", "pack_visit"),),
    "pack_test_run": (("object_id", "pack_object"),),
    "pack_quality_hold": (("object_id", "pack_object"),),
    "pack_rework_order": (("object_id", "pack_object"),),
    "pack_release_record": (("object_id", "pack_object"),),
    "pack_assembly_link": (("parent_id", "pack_object"), ("child_id", "pack_object")),
    "pack_material_transaction": (("object_id", "pack_object"), ("child_id", "pack_object"), ("link_id", "pack_assembly_link")),
    "pack_inbox_conflict": (("inbox_id", "pack_inbox_message"),),
}
DELETE_ORDER = (
    "pack_inbox_conflict", "pack_inbox_message", "pack_command_receipt",
    "pack_material_transaction", "pack_quality_hold", "pack_release_record",
    "pack_assembly_link", "pack_test_run", "pack_action_run", "pack_visit",
    "pack_rework_order", "pack_object", "pack_work_order", "pack_bom_line",
    "pack_operation_action", "pack_manufacturing_station", "pack_manufacturing_version",
    "route_relation", "route_node", "route_operation", "route_version", "route",
    "operation", "material", "pack_workstation", "production_line", "workshop",
)
TABLES = set(DELETE_ORDER)
PREFIXES = ("QA-PACK-", "QA-UI-")


class Refused(RuntimeError):
    pass


def dumps(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def numeric(value):
    text = str(value)
    if not re.fullmatch(r"[1-9][0-9]{0,18}", text) or int(text) > 9223372036854775807:
        raise Refused("Manifest IDs must be positive bigint decimal strings")
    return text


def key(table, row):
    fields = ("version_id", "station_id") if table == "pack_manufacturing_station" else ("id",)
    return tuple(str(row[field]) for field in fields)


def load_manifest(path):
    original = path.read_text(encoding="utf-8")
    value = json.loads(original)
    target = value.get("target", {})
    if value.get("formatVersion") != 1 or any(target.get(k) != v for k, v in {
        "host": HOST, "port": PORT, "database": DATABASE,
    }.items()):
        raise Refused("Only the isolated 127.0.0.1:55440/pack_edhr_dev target is accepted")
    numeric(target.get("tenantId"))
    if not target.get("tenantKey") or not target.get("siteIds"):
        raise Refused("Explicit tenantId, tenantKey and retained siteIds are required")
    target["siteIds"] = [numeric(item) for item in target["siteIds"]]
    records = value.get("records", {})
    if not records or set(records) - set(ROOT_IDENTITIES):
        raise Refused("Manifest contains no roots or an unsupported root table")
    seen = set()
    for table, entries in records.items():
        if not isinstance(entries, list):
            raise Refused("Manifest records must be explicit lists")
        for entry in entries:
            row_id = numeric(entry.get("id")); expected = entry.get("expected", {})
            if (table, row_id) in seen or not set(ROOT_IDENTITIES[table]).issubset(expected):
                raise Refused("Duplicate root or missing old identity columns: " + table)
            if any(not isinstance(k, str) or not re.fullmatch(r"[a-z_][a-z0-9_]*", k) for k in expected):
                raise Refused("Invalid manifest expected column")
            if not any(isinstance(v, str) and v.startswith(PREFIXES) for v in expected.values()):
                raise Refused("Every manifest root must identify a confirmed old QA fixture")
            seen.add((table, row_id))
    if not seen or len(seen) > 10000:
        raise Refused("Unexpected root manifest size")
    return value, sha(original)


def configuration():
    if not ENV_FILE.is_file() or not PSQL.is_file():
        raise Refused("Existing .env.pack.local and bundled local PostgreSQL 18 psql are required")
    values = dict(line.split("=", 1) for line in ENV_FILE.read_text().splitlines()
                  if line.strip() and not line.startswith("#") and "=" in line)
    expected = {"PACK_DATABASE_PORT": str(PORT), "PACK_DATABASE_NAME": DATABASE, "PACK_DATABASE_USER": USER}
    if any(values.get(k) != v for k, v in expected.items()) or not values.get("PACK_DATABASE_PASSWORD"):
        raise Refused("Current isolated database configuration differs from the fixed target")
    if any(k in os.environ and os.environ[k] != v for k, v in expected.items()):
        raise Refused("Environment overrides differ from the current isolated database configuration")
    return values


class Database:
    def __init__(self, config):
        env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
        env.update(PGPASSWORD=config["PACK_DATABASE_PASSWORD"], PGCONNECT_TIMEOUT="5")
        self.process = subprocess.Popen([str(PSQL), "-X", "-qAt", "-h", HOST, "-p", str(PORT),
            "-U", USER, "-d", DATABASE, "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=terse"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)

    def execute(self, sql):
        marker = "END_QA_" + uuid.uuid4().hex
        self.process.stdin.write(sql.rstrip(";\n") + ";\n\\echo " + marker + "\n")
        self.process.stdin.flush(); output = []
        while True:
            line = self.process.stdout.readline()
            if not line:
                raise Refused("PostgreSQL refused the operation: " + self.process.stderr.read().strip())
            if line.rstrip("\n") == marker:
                return "".join(output).strip()
            output.append(line)

    def query(self, sql):
        result = self.execute("SELECT COALESCE(json_agg(q),'[]'::json)::text FROM (" + sql + ") q")
        return json.loads(result)

    def close(self):
        if self.process.poll() is None:
            try:
                self.process.communicate("ROLLBACK;\n\\q\n", timeout=5)
            except (subprocess.TimeoutExpired, BrokenPipeError):
                self.process.kill(); self.process.communicate()


@dataclass
class Row:
    data: dict
    raw: str


def table_rows(db, table, where="TRUE"):
    return {key(table, row): Row(row, item["row_json"])
            for item in db.query("SELECT row_to_json(t)::text AS row_json FROM public." + ident(table) + " t WHERE " + where)
            for row in [json.loads(item["row_json"]) ]}


def scope_check(table, row, target):
    if row.get("tenant_id") is not None and str(row["tenant_id"]) not in {str(target["tenantId"]), target["tenantKey"]}:
        raise Refused("Root or owned row is outside the manifest tenant: " + table)
    if row.get("site_id") is not None and str(row["site_id"]) not in target["siteIds"]:
        raise Refused("Root or owned row is outside the retained site scope: " + table)


def collect(manifest, data):
    plan = {table: {} for table in TABLES}
    for table, entries in manifest["records"].items():
        for entry in entries:
            row_key = (numeric(entry["id"]),); row = data[table].get(row_key)
            if row is None or any(row.data.get(k) != v for k, v in entry["expected"].items()):
                raise Refused("Root ID/old identity changed or disappeared: " + table + ":" + entry["id"])
            plan[table][row_key] = row
    changed = True
    while changed:
        before = sum(map(len, plan.values()))
        for table, relations in OWNED.items():
            for row_key, row in data[table].items():
                if any(row.data.get(field) is not None and (str(row.data[field]),) in plan[parent]
                       for field, parent in relations):
                    plan[table][row_key] = row
        object_ids = {item[0] for item in plan["pack_object"]}
        for row_key, row in data["pack_command_receipt"].items():
            payload = json.loads(row.data["result_json"])
            if str(payload.get("execution", {}).get("object", {}).get("id", "")) in object_ids:
                plan["pack_command_receipt"][row_key] = row
        for row_key, row in data["pack_inbox_message"].items():
            payload = json.loads(row.data["payload_json"])
            if str(payload.get("objectId", "")) in object_ids:
                plan["pack_inbox_message"][row_key] = row
        changed = before != sum(map(len, plan.values()))
    for table, rows in plan.items():
        for row in rows.values():
            scope_check(table, row.data, manifest["target"])
    return plan


def reference_pattern(manifest, plan):
    values = {str(row.data["id"]) for rows in plan.values() for row in rows.values() if "id" in row.data}
    for entries in manifest["records"].values():
        for entry in entries:
            values.update(v for k, v in entry["expected"].items() if k != "version" and isinstance(v, str) and v.startswith(PREFIXES))
    return "(^|[^[:alnum:]_-])(" + "|".join(re.escape(v) for v in sorted(values, key=lambda x: (-len(x), x))) + ")([^[:alnum:]_-]|$)"


def check_references(db, manifest, plan, data, public_tables):
    blockers = []
    foreign_keys = db.query("""SELECT c.conname,child.relname child_table,parent.relname parent_table,
        ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(n,i) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.i) child_columns,
        ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(n,i) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n ORDER BY k.i) parent_columns
        FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_namespace cn ON cn.oid=child.relnamespace
        JOIN pg_class parent ON parent.oid=c.confrelid JOIN pg_namespace pn ON pn.oid=parent.relnamespace
        WHERE c.contype='f' AND cn.nspname='public' AND pn.nspname='public'""")
    for relation in foreign_keys:
        child, parent = relation["child_table"], relation["parent_table"]
        if child not in plan or parent not in TABLES:
            continue
        parent_columns, child_columns = relation["parent_columns"], relation["child_columns"]
        allowed = {tuple(str(row.data.get(c)) for c in parent_columns) for row in plan[parent].values()}
        for row_key, row in plan[child].items():
            values = tuple(row.data.get(c) for c in child_columns)
            if all(v is not None for v in values) and tuple(map(str, values)) not in allowed:
                blockers.append({"table": child, "key": row_key, "constraint": relation["conname"], "reason": "points to a non-manifest business parent", "parentTable": parent})
    pattern = reference_pattern(manifest, plan)
    for table in public_tables:
        if table == "audit_event":
            continue
        for item in db.query("SELECT row_to_json(t)::text AS row_json FROM public." + ident(table) + " t WHERE to_jsonb(t)::text ~ " + literal(pattern)):
            row = json.loads(item["row_json"])
            if table not in plan or key(table, row) not in plan[table]:
                blockers.append({"table": table, "key": row.get("id", row.get("object_id")), "reason": "retained row refers to an exact selected ID or old fixture identity"})
    # Machine envelopes can mention child serial numbers without a foreign key.
    by_code = {row.data["object_no"]: row_key for row_key, row in data["pack_object"].items()}
    def check_codes(node, table, row_key):
        if isinstance(node, dict):
            for field, value in node.items():
                if field in {"childCode", "objectNo"} and isinstance(value, str) and value in by_code and by_code[value] not in plan["pack_object"]:
                    blockers.append({"table": table, "key": row_key, "reason": "message/receipt also refers to a retained object serial", "serial": value})
                check_codes(value, table, row_key)
        elif isinstance(node, list):
            for value in node:
                check_codes(value, table, row_key)
        elif isinstance(node, str) and node[:1] in {"{", "["}:
            try:
                check_codes(json.loads(node), table, row_key)
            except ValueError:
                pass
    for table in ("pack_inbox_message", "pack_inbox_conflict", "pack_command_receipt"):
        for row_key, row in plan[table].items():
            check_codes(row.data, table, row_key)
    return blockers, pattern


def fingerprint(rows):
    return sha("\n".join(dumps(row_key) + ":" + sha(row.raw) for row_key, row in sorted(rows.items())))


def predicate(table, rows):
    if table == "pack_manufacturing_station":
        return "(version_id,station_id) IN (" + ",".join("(" + ",".join(numeric(v) for v in row_key) + ")" for row_key in rows) + ")"
    return "id IN (" + ",".join(numeric(row_key[0]) for row_key in rows) + ")"


def sql_json(raw):
    tag = "$qa_" + uuid.uuid4().hex + "$"
    while tag in raw:
        tag = "$qa_" + uuid.uuid4().hex + "$"
    return tag + raw + tag + "::json"


def restore_sql(plan):
    output = ["\\set ON_ERROR_STOP on", "BEGIN;", "DO $$ BEGIN IF current_database()<>'pack_edhr_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440 OR current_user<>'pack_edhr' THEN RAISE EXCEPTION 'Wrong restore target'; END IF; END $$;"]
    order = list(reversed(DELETE_ORDER)); order.remove("pack_rework_order"); order.insert(order.index("pack_visit"), "pack_rework_order")
    for table in order:
        for _, row in sorted(plan[table].items()):
            value = sql_json(row.raw)
            if table == "pack_rework_order":
                value = "(" + value + "::jsonb || '{\"origin_visit_id\":null}'::jsonb)::json"
            output.append("INSERT INTO public." + ident(table) + " SELECT * FROM json_populate_record(NULL::public." + ident(table) + "," + value + ");")
    for row in plan["pack_rework_order"].values():
        if row.data.get("origin_visit_id") is not None:
            output.append("UPDATE public.pack_rework_order SET origin_visit_id=" + numeric(row.data["origin_visit_id"]) + " WHERE id=" + numeric(row.data["id"]) + ";")
    output.extend(["COMMIT;", "-- audit_event was retained and must not be restored or overwritten."])
    return "\n".join(output) + "\n"


def write_private(path, content):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as out:
        out.write(content); out.flush(); os.fsync(out.fileno())


def run(args):
    manifest, manifest_hash = load_manifest(args.manifest)
    config = configuration(); db = Database(config)
    try:
        db.execute("BEGIN ISOLATION LEVEL " + ("READ COMMITTED" if args.apply else "REPEATABLE READ READ ONLY"))
        db.execute("SET LOCAL statement_timeout='120s'; SET LOCAL lock_timeout='5s'; SET LOCAL standard_conforming_strings=on")
        identity = db.query("SELECT current_database() database,current_user AS username,host(inet_server_addr()) host,inet_server_port() port")[0]
        if identity != {"database": DATABASE, "username": USER, "host": HOST, "port": PORT}:
            raise Refused("Connected PostgreSQL identity does not match the current isolated configuration")
        public_tables = [row["tablename"] for row in db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")]
        if TABLES - set(public_tables):
            raise Refused("Required Pack baseline tables are missing")
        if args.apply:
            # Pack writes use a site lock; legacy master-data JSON writes do not.
            # Table locks prevent either kind of new reference during recheck/export/delete.
            db.execute("LOCK TABLE " + ",".join("public." + ident(table) for table in public_tables) + " IN SHARE ROW EXCLUSIVE MODE")
        sites = db.query("SELECT id,tenant_id FROM site WHERE id IN (" + ",".join(manifest["target"]["siteIds"]) + ")")
        if len(sites) != len(manifest["target"]["siteIds"]) or any(str(row["tenant_id"]) != manifest["target"]["tenantId"] for row in sites):
            raise Refused("Retained sites do not belong to the explicit tenant")
        data = {table: table_rows(db, table) for table in sorted(TABLES)}
        plan = collect(manifest, data)
        blockers, pattern = check_references(db, manifest, plan, data, public_tables)
        untouched = {table: fingerprint({k: row for k, row in data[table].items() if k not in plan[table]}) for table in TABLES}
        audit = db.query("SELECT row_to_json(t)::text AS row_json FROM public.audit_event t WHERE to_jsonb(t)::text ~ " + literal(pattern))
        report = {"mode": "apply" if args.apply else "dry-run", "target": identity, "manifestSha256": manifest_hash,
            "roots": {table: len(entries) for table, entries in manifest["records"].items()},
            "selectedRows": {table: len(plan[table]) for table in DELETE_ORDER if plan[table]},
            "retainedAuditRows": len(audit), "blockers": blockers, "allowed": not blockers}
        if blockers or not args.apply:
            db.execute("ROLLBACK"); print(json.dumps(report, ensure_ascii=False, indent=2)); return 2 if blockers else 0
        stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        directory = RUNTIME / ("qa-replacement-" + stamp + "-" + uuid.uuid4().hex[:8])
        directory.mkdir(parents=True, mode=0o700)
        exported = {**report, "action": "REMOVE_EXACT_LOCAL_QA_FIXTURE_GRAPH", "createdAt": stamp,
            "configurationSha256": sha(ENV_FILE.read_text()), "manifest": manifest,
            "records": {table: [{"key": row_key, "rowJson": row.raw, "sha256": sha(row.raw)} for row_key, row in sorted(rows.items())] for table, rows in plan.items() if rows},
            "retainedAudit": [{"rowJson": item["row_json"], "sha256": sha(item["row_json"])} for item in audit],
            "untouchedTableFingerprints": untouched}
        archive = json.dumps(exported, ensure_ascii=False, indent=2) + "\n"
        write_private(directory / "export.json", archive)
        write_private(directory / "export.sha256", sha(archive) + "  export.json\n")
        write_private(directory / "restore.sql", restore_sql(plan))
        # Only rows exported above are temporarily detached to break the real FK cycle.
        for table, column in (("pack_visit", "rework_order_id"), ("pack_rework_order", "origin_visit_id")):
            if plan[table]:
                db.execute("UPDATE public." + ident(table) + " SET " + ident(column) + "=NULL WHERE " + predicate(table, plan[table]))
        deleted = {}
        for table in DELETE_ORDER:
            if plan[table]:
                result = int(db.execute("WITH removed AS (DELETE FROM public." + ident(table) + " WHERE " + predicate(table, plan[table]) + " RETURNING 1) SELECT count(*) FROM removed"))
                if result != len(plan[table]):
                    raise Refused("Deleted row count changed; transaction will roll back: " + table)
                deleted[table] = result
        for table in TABLES:
            if fingerprint(table_rows(db, table)) != untouched[table]:
                raise Refused("A retained row changed; transaction will roll back: " + table)
        current_audit = db.query("SELECT row_to_json(t)::text AS row_json FROM public.audit_event t WHERE to_jsonb(t)::text ~ " + literal(pattern))
        if sorted(row["row_json"] for row in current_audit) != sorted(row["row_json"] for row in audit):
            raise Refused("Retained audit history changed; transaction will roll back")
        db.execute("COMMIT")
        receipt = {"status": "COMMITTED", "manifestSha256": manifest_hash, "exportSha256": sha(archive), "deletedRows": deleted, "auditRowsUnchanged": len(audit), "target": identity}
        write_private(directory / "cleanup-receipt.json", json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps({**receipt, "exportDirectory": str(directory)}, ensure_ascii=False, indent=2)); return 0
    finally:
        db.close()


def self_test():
    assert numeric("389109867016585216") == "389109867016585216"
    for bad in ("1);DELETE FROM site;--", "-1", "0", "9223372036854775808"):
        try:
            numeric(bad)
        except Refused:
            continue
        raise AssertionError("Unsafe ID accepted")
    rows = {("1",): Row({"id": 1}, '{"id":1}')}
    assert predicate("pack_object", rows) == "id IN (1)"
    assert predicate("pack_manufacturing_station", {("1", "2"): None}) == "(version_id,station_id) IN ((1,2))"
    plan = {table: {} for table in TABLES}; plan["pack_rework_order"] = {("2",): Row({"id": 2, "origin_visit_id": 3}, '{"id":2,"origin_visit_id":3}')}; plan["pack_visit"] = {("3",): Row({"id": 3, "rework_order_id": 2}, '{"id":3,"rework_order_id":2}')}
    restored = restore_sql(plan)
    assert restored.index('INSERT INTO public."pack_rework_order"') < restored.index('INSERT INTO public."pack_visit"')
    assert '"origin_visit_id":null' in restored and "SET origin_visit_id=3 WHERE id=2" in restored
    print("Self-test PASS: strict IDs, exact predicates and cyclic restore order; no database connection")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--apply", action="store_true", help="Export and transactionally remove only the revalidated graph")
    parser.add_argument("--self-test", action="store_true", help="Run pure safety checks without connecting to PostgreSQL")
    args = parser.parse_args()
    try:
        if args.self_test:
            if args.apply or args.manifest:
                raise Refused("Self-test cannot be combined with database options")
            self_test(); sys.exit(0)
        if not args.manifest:
            parser.error("--manifest is required; default mode is dry-run")
        sys.exit(run(args))
    except (Refused, ValueError, OSError, KeyError) as error:
        print("REFUSED:", str(error), file=sys.stderr); sys.exit(2)
