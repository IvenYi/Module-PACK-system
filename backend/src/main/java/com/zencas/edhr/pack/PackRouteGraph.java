package com.zencas.edhr.pack;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class PackRouteGraph {
    private PackRouteGraph() {}

    static List<String> validate(JsonNode nodes, JsonNode relations) {
        Set<String> issues = new LinkedHashSet<>();
        Map<String, String> types = new LinkedHashMap<>();
        for (JsonNode node : nodes) {
            String key = text(node, "nodeKey"), type = text(node, "nodeType");
            if (key.isBlank()) issues.add("工艺路线节点标识不能为空");
            else if (types.putIfAbsent(key, type) != null) issues.add("工艺路线节点标识重复: " + key);
            if (!Set.of("START", "END", "OPERATION").contains(type)) issues.add("路线节点类型尚未实现: " + type);
        }
        if (!types.containsValue("OPERATION")) issues.add("工艺路线至少需要一个可执行工序");
        if (types.values().stream().filter("START"::equals).count() > 1) issues.add("工艺路线至多允许一个 START 节点");
        if (types.values().stream().filter("END"::equals).count() > 1) issues.add("工艺路线至多允许一个 END 节点");

        Map<String, Set<String>> next = new LinkedHashMap<>(), previous = new LinkedHashMap<>();
        for (String key : types.keySet()) {
            next.put(key, new LinkedHashSet<>());
            previous.put(key, new LinkedHashSet<>());
        }
        for (JsonNode relation : relations) {
            String type = text(relation, "relationType");
            if (!type.isBlank() && !"SEQUENTIAL".equals(type)) issues.add("当前仅支持 SEQUENTIAL 顺序路线，不支持连线类型: " + type);
            if (!text(relation, "ruleExpression").isBlank()) issues.add("条件路线表达式尚未实现，不允许发布");
            String source = text(relation, "sourceNodeKey"), target = text(relation, "targetNodeKey");
            if (!types.containsKey(source) || !types.containsKey(target)) {
                issues.add("工艺路线连线端点不存在: " + source + " → " + target);
                continue;
            }
            if (source.equals(target)) issues.add("工艺路线不允许节点自环: " + source);
            if (!next.get(source).add(target)) issues.add("工艺路线连线重复: " + source + " → " + target);
            previous.get(target).add(source);
        }

        for (String key : types.keySet()) {
            if (next.get(key).size() > 1) issues.add("当前顺序路线不支持分支: " + key);
            if (previous.get(key).size() > 1) issues.add("当前顺序路线不支持汇合: " + key);
            if ("START".equals(types.get(key)) && !previous.get(key).isEmpty()) issues.add("START 节点必须是路线入口");
            if ("END".equals(types.get(key)) && !next.get(key).isEmpty()) issues.add("END 节点必须是路线出口");
        }
        List<String> entries = types.keySet().stream().filter(key -> previous.get(key).isEmpty()).toList();
        List<String> exits = types.keySet().stream().filter(key -> next.get(key).isEmpty()).toList();
        if (entries.size() != 1) issues.add("工艺路线必须有且仅有一个入口");
        if (exits.size() != 1) issues.add("工艺路线必须有且仅有一个出口");
        if (entries.size() != 1 || exits.size() != 1
                || reachable(entries.getFirst(), next).size() != types.size()
                || reachable(exits.getFirst(), previous).size() != types.size()) {
            issues.add("工艺路线所有节点必须连成同一条从入口到出口的顺序链");
        }

        Map<String, Integer> remaining = new HashMap<>();
        previous.forEach((key, incoming) -> remaining.put(key, incoming.size()));
        ArrayDeque<String> ready = new ArrayDeque<>(entries);
        int visited = 0;
        while (!ready.isEmpty()) {
            String current = ready.removeFirst();
            visited++;
            for (String target : next.get(current)) if (remaining.merge(target, -1, Integer::sum) == 0) ready.add(target);
        }
        if (visited != types.size()) issues.add("工艺路线存在循环");
        return List.copyOf(issues);
    }

    private static Set<String> reachable(String entry, Map<String, Set<String>> links) {
        Set<String> visited = new HashSet<>();
        ArrayDeque<String> pending = new ArrayDeque<>();
        pending.add(entry);
        while (!pending.isEmpty()) {
            String current = pending.removeFirst();
            if (visited.add(current)) pending.addAll(links.get(current));
        }
        return visited;
    }

    private static String text(JsonNode node, String key) {
        return node.path(key).asText("").strip();
    }
}
