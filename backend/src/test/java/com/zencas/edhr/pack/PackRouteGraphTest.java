package com.zencas.edhr.pack;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class PackRouteGraphTest {
    private final ObjectMapper mapper = new ObjectMapper();

    private ObjectNode node(String key, String type) {
        return mapper.createObjectNode().put("nodeKey", key).put("nodeType", type);
    }

    private ObjectNode edge(String source, String target) {
        return mapper.createObjectNode().put("sourceNodeKey", source).put("targetNodeKey", target)
                .put("relationType", "SEQUENTIAL");
    }

    private ArrayNode array(JsonNode... values) {
        ArrayNode result = mapper.createArrayNode();
        for (JsonNode value : values) result.add(value);
        return result;
    }

    @Test void acceptsSingleOperationWithoutEdges() {
        assertThat(PackRouteGraph.validate(array(node("assemble", "OPERATION")), array())).isEmpty();
    }

    @Test void acceptsLinearOperationsRegardlessOfNodeArrayOrder() {
        assertThat(PackRouteGraph.validate(array(node("test", "OPERATION"), node("assemble", "OPERATION")),
                array(edge("assemble", "test")))).isEmpty();
    }

    @Test void acceptsOptionalStartAndEndAndLegacySequentialEdges() {
        ObjectNode first = edge("start", "assemble");
        first.remove("relationType");
        assertThat(PackRouteGraph.validate(array(node("start", "START"), node("assemble", "OPERATION"),
                        node("end", "END")), array(first, edge("assemble", "end")))).isEmpty();
        assertThat(PackRouteGraph.validate(array(node("start", "START"), node("assemble", "OPERATION")),
                array(edge("start", "assemble")))).isEmpty();
        assertThat(PackRouteGraph.validate(array(node("assemble", "OPERATION"), node("end", "END")),
                array(edge("assemble", "end")))).isEmpty();
    }

    @Test void rejectsRoutesWithoutExecutableOperations() {
        assertThat(PackRouteGraph.validate(array(), array())).isNotEmpty();
        assertThat(PackRouteGraph.validate(array(node("start", "START"), node("end", "END")),
                array(edge("start", "end")))).anyMatch(issue -> issue.contains("可执行工序"));
    }

    @Test void rejectsBlankOrDuplicateNodeKeysAndUnsupportedNodes() {
        assertThat(PackRouteGraph.validate(array(node(" ", "OPERATION")), array()))
                .anyMatch(issue -> issue.contains("节点标识"));
        assertThat(PackRouteGraph.validate(array(node("a", "OPERATION"), node("a", "OPERATION")), array()))
                .anyMatch(issue -> issue.contains("重复"));
        assertThat(PackRouteGraph.validate(array(node("decision", "DECISION")), array()))
                .anyMatch(issue -> issue.contains("节点类型"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"PARALLEL", "OPTIONAL", "REWORK", "JUMP", "ALTERNATIVE"})
    void rejectsUnsupportedRelationSemantics(String type) {
        assertThat(PackRouteGraph.validate(array(node("a", "OPERATION"), node("b", "OPERATION")),
                array(edge("a", "b").put("relationType", type))))
                .anyMatch(issue -> issue.contains("顺序"));
    }

    @Test void rejectsConditionalExpressions() {
        assertThat(PackRouteGraph.validate(array(node("a", "OPERATION"), node("b", "OPERATION")),
                array(edge("a", "b").put("ruleExpression", "result == 'PASS'"))))
                .anyMatch(issue -> issue.contains("条件"));
    }

    @Test void rejectsMissingEndpointsSelfLoopsAndDuplicateEdges() {
        assertThat(PackRouteGraph.validate(array(node("a", "OPERATION")), array(edge("missing", "a"))))
                .anyMatch(issue -> issue.contains("端点"));
        assertThat(PackRouteGraph.validate(array(node("a", "OPERATION")), array(edge("a", "missing"))))
                .anyMatch(issue -> issue.contains("端点"));
        assertThat(PackRouteGraph.validate(array(node("a", "OPERATION")), array(edge("a", "a"))))
                .anyMatch(issue -> issue.contains("自环"));
        assertThat(PackRouteGraph.validate(array(node("a", "OPERATION"), node("b", "OPERATION")),
                array(edge("a", "b"), edge("a", "b"))))
                .anyMatch(issue -> issue.contains("重复"));
    }

    @Test void rejectsBranchesAndMerges() {
        ArrayNode nodes = array(node("a", "OPERATION"), node("b", "OPERATION"), node("c", "OPERATION"));
        assertThat(PackRouteGraph.validate(nodes, array(edge("a", "b"), edge("a", "c"))))
                .anyMatch(issue -> issue.contains("分支"));
        assertThat(PackRouteGraph.validate(nodes, array(edge("a", "c"), edge("b", "c"))))
                .anyMatch(issue -> issue.contains("汇合"));
    }

    @Test void rejectsDisconnectedOperationsAndMissingEdges() {
        assertThat(PackRouteGraph.validate(array(node("a", "OPERATION"), node("b", "OPERATION")), array()))
                .anyMatch(issue -> issue.contains("入口"));
        assertThat(PackRouteGraph.validate(array(node("a", "OPERATION"), node("b", "OPERATION"),
                        node("c", "OPERATION")), array(edge("a", "b"))))
                .anyMatch(issue -> issue.contains("同一条"));
    }

    @Test void rejectsCyclesEvenWhenAnotherComponentHasUniqueEntryAndExit() {
        assertThat(PackRouteGraph.validate(array(node("a", "OPERATION"), node("b", "OPERATION")),
                array(edge("a", "b"), edge("b", "a"))))
                .anyMatch(issue -> issue.contains("循环"));
        assertThat(PackRouteGraph.validate(array(node("a", "OPERATION"), node("b", "OPERATION"),
                        node("c", "OPERATION"), node("d", "OPERATION")),
                array(edge("a", "b"), edge("c", "d"), edge("d", "c"))))
                .anyMatch(issue -> issue.contains("循环"));
    }

    @Test void startMustBeTheOnlyEntryAndEndMustBeTheOnlyExit() {
        assertThat(PackRouteGraph.validate(array(node("a", "OPERATION"), node("start", "START")),
                array(edge("a", "start"))))
                .anyMatch(issue -> issue.contains("START"));
        assertThat(PackRouteGraph.validate(array(node("a", "OPERATION"), node("end", "END")),
                array(edge("end", "a"))))
                .anyMatch(issue -> issue.contains("END"));
        assertThat(PackRouteGraph.validate(array(node("start1", "START"), node("a", "OPERATION"),
                        node("start2", "START")), array(edge("start1", "a"), edge("a", "start2"))))
                .anyMatch(issue -> issue.contains("START") && issue.contains("一个"));
        assertThat(PackRouteGraph.validate(array(node("end1", "END"), node("a", "OPERATION"),
                        node("end2", "END")), array(edge("end1", "a"), edge("a", "end2"))))
                .anyMatch(issue -> issue.contains("END") && issue.contains("一个"));
    }
}
