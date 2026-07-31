#!/usr/bin/env python3
"""
Graph → API prompt 转换器
ComfyUI /prompt 接口只接受 API 格式 {node_id: {class_type, inputs}}
前端 drag-drop 时会自动转换,这里复刻相同逻辑。

算法核心:
1. 展开 SetNode/GetNode/Reroute(LiteGraph 辅助节点)为直接连接
2. 用 /object_info 查询每个节点的 INPUT_TYPES,精确对齐 widgets_values 索引
   (避免 hidden UI state 如 KSampler 的 control_after_generate 错位)
3. 对无 link 的 input,从 widgets_values 取值;对有 link 的 input,用 link 引用
"""
import json
import sys
import urllib.request


# 哪些类型是 widget inputs(不是 link 类型)
WIDGET_INPUT_TYPES = {"INT", "FLOAT", "STRING", "COMBO", "BOOLEAN"}

TYPE_MATCHERS = {
    "INT": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "FLOAT": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "STRING": lambda v: isinstance(v, str),
    "COMBO": lambda v: isinstance(v, str),
    "BOOLEAN": lambda v: isinstance(v, bool),
}


def fetch_object_info(server_url: str = "http://127.0.0.1:8000") -> dict:
    """从 ComfyUI server 查询所有节点定义"""
    with urllib.request.urlopen(f"{server_url}/object_info", timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def expand_helper_nodes(graph_wf: dict) -> dict:
    """
    展开 LiteGraph 辅助节点为直接连接:
    - SetNode(name=X, src=Y) + GetNode(name=X) → src 直接连到 GetNode 的下游
    - Reroute → 透传其输入到所有输出

    同时移除纯注释节点:Label (rgthree) / Note / MarkdownNote
    """
    NON_DATA_NODE_TYPES = {
        "SetNode", "GetNode", "Reroute",
        "Label (rgthree)", "Note", "MarkdownNote",
    }

    nodes = list(graph_wf.get("nodes", []))
    links = list(graph_wf.get("links", []))

    # 1. 收集 SetNode 命名映射
    set_sources = {}
    for n in nodes:
        if n.get("type") == "SetNode":
            wv = n.get("widgets_values") or []
            if not wv:
                continue
            name = str(wv[0])
            for inp in n.get("inputs", []) or []:
                link_id = inp.get("link")
                if link_id is not None:
                    for L in links:
                        if L[0] == link_id:
                            set_sources[name] = (L[1], L[2], L[5])
                            break
                    break

    # 2. 收集 GetNode name
    get_node_names = {}
    for n in nodes:
        if n.get("type") == "GetNode":
            wv = n.get("widgets_values") or []
            if wv:
                get_node_names[n["id"]] = str(wv[0])

    # 3. 收集 Reroute src
    reroute_src = {}
    for n in nodes:
        if n.get("type") == "Reroute":
            for inp in n.get("inputs", []) or []:
                link_id = inp.get("link")
                if link_id is not None:
                    for L in links:
                        if L[0] == link_id:
                            reroute_src[n["id"]] = (L[1], L[2], L[5])
                            break
                    break

    # 4. 递归解析 helper node 到最终源
    def resolve(node_id, slot, type_name, depth=0):
        if depth > 50:
            return (node_id, slot, type_name)
        if node_id in get_node_names:
            name = get_node_names[node_id]
            if name in set_sources:
                s_node, s_slot, s_type = set_sources[name]
                return resolve(s_node, s_slot, s_type, depth + 1)
            return (node_id, slot, type_name)
        if node_id in reroute_src:
            r_node, r_slot, r_type = reroute_src[node_id]
            return resolve(r_node, r_slot, r_type, depth + 1)
        return (node_id, slot, type_name)

    # 5. 重写所有 links
    new_links = []
    for L in links:
        link_id, src_node, src_slot, to_node, to_slot, type_name = L
        new_src, new_slot, new_type = resolve(src_node, src_slot, type_name)
        new_links.append([link_id, new_src, new_slot, to_node, to_slot, new_type])

    # 6. 移除辅助节点
    new_nodes = [n for n in nodes if n.get("type") not in NON_DATA_NODE_TYPES]

    new_wf = dict(graph_wf)
    new_wf["nodes"] = new_nodes
    new_wf["links"] = new_links
    return new_wf


def build_widget_value_indices(class_type: str, object_info: dict) -> list:
    """
    对给定的节点类型,返回每个 widget input 在 widgets_values 中的索引。
    处理 hidden UI state(如 control_after_generate)。

    返回:[(input_name, wv_idx)] 严格按 INPUT_TYPES required 顺序
    """
    if class_type not in object_info:
        return None
    node_def = object_info[class_type]
    required = node_def.get("input", {}).get("required", {})

    result = []
    wv_idx = 0
    for input_name, type_def in required.items():
        if isinstance(type_def, list) and len(type_def) >= 1:
            type_str = type_def[0]
            config = type_def[1] if len(type_def) > 1 and isinstance(type_def[1], dict) else {}
        else:
            type_str = str(type_def)
            config = {}

        is_widget = isinstance(type_str, list) or type_str in WIDGET_INPUT_TYPES

        if is_widget:
            result.append((input_name, wv_idx))
            wv_idx += 1
            # hidden control_after_generate(每个有该标志的 widget 后自动追加)
            if isinstance(config, dict) and config.get("control_after_generate"):
                wv_idx += 1

    return result


def graph_to_api(graph_wf: dict, object_info: dict = None) -> dict:
    """把 graph workflow 转换为 ComfyUI /prompt API 格式"""
    if object_info is None:
        object_info = fetch_object_info()

    # 1. 先展开辅助节点
    expanded = expand_helper_nodes(graph_wf)

    # 2. 建立 links 映射
    links_map = {}
    for link in expanded.get("links", []):
        link_id, src_node, src_slot = link[0], link[1], link[2]
        links_map[link_id] = (src_node, src_slot)

    # 3. 转换每个节点
    prompt = {}
    for node in expanded.get("nodes", []):
        node_id = str(node["id"])
        class_type = node["type"]
        inputs_dict = {}
        widgets_values = node.get("widgets_values") or []

        # 用 INPUT_TYPES 严格对齐 widget value 索引
        widget_indices = build_widget_value_indices(class_type, object_info)

        # 遍历 INPUT_TYPES 中的 widget inputs
        if widget_indices:
            # 建立 input_name → link 映射
            node_inputs = {inp["name"]: inp for inp in (node.get("inputs", []) or [])}

            for input_name, wv_idx in widget_indices:
                inp = node_inputs.get(input_name)
                if inp is None:
                    continue
                inp_link = inp.get("link")

                if inp_link is not None and inp_link in links_map:
                    src_node, src_slot = links_map[inp_link]
                    inputs_dict[input_name] = [str(src_node), src_slot]
                elif inp_link is None:
                    # 无 link,使用 widget value
                    if wv_idx < len(widgets_values):
                        inputs_dict[input_name] = widgets_values[wv_idx]

        prompt[node_id] = {
            "class_type": class_type,
            "inputs": inputs_dict,
        }

    return prompt


if __name__ == "__main__":
    wf_path = sys.argv[1]
    with open(wf_path, "r", encoding="utf-8") as f:
        wf = json.load(f)
    prompt = graph_to_api(wf)
    print(f"转换完成: {len(prompt)} 个节点")

    # 统计辅助节点残留
    remain = sum(1 for p in prompt.values() if p["class_type"] in ("SetNode", "GetNode", "Reroute", "Label (rgthree)", "Note"))
    print(f"残留辅助节点: {remain}")

    # 显示 KSampler 1525 的转换结果(确认 control_after_generate 被正确处理)
    for nid, p in prompt.items():
        if nid == "1525" and p["class_type"] == "KSampler":
            print(f"\nKSampler 1525:")
            for k, v in p["inputs"].items():
                print(f"  {k}: {v}")
            break