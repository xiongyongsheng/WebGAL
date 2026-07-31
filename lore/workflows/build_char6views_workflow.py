#!/usr/bin/env python3
"""
v5 - 拆 ConfigPreparer 为两组:全身 / 脸部
v4 - 完全按 ComfyUI 真实工作流格式生成
关键修复:
1. inputs/outputs 必须同时填 localized_name + label + name + type
2. widget 类型 input 必须有 widget 子结构 {name: ...}
3. outputs[].links 数组必须包含所有从该 output 出发的 link id
4. outputs[].slot_index 必须填
5. properties 必须填 cnr_id 和 ver
"""
import json
import copy

# ==================== 路径 ====================
MAIN_WF_PATH = "/Users/xiongyongsheng/Documents/ComfyUI/user/default/workflows/⨝Qwen2511人物+背景一致性图像编辑工作流2026-05-28.json"
OUTPUT_PATH = "/Users/xiongyongsheng/WORKSPACE/OpenWebGal/WebGAL/lore/workflows/Qwen2511_角色6视图生成+主工作流.json"

# ==================== 6 视图定义 ====================
# 关键改动(v6):3 个全身视图显式要求竖图构图 + 字符填满竖向画框
# 之前 ref_longest_edge=1216 但 Qwen-Image-Edit 仍继承输入图宽高比 → 输出 1024x608 横图,角色只占中间 1/3
# 现在 prompt 强制 "vertical portrait orientation, 9:16 aspect ratio",让模型自行按竖图生成
VERTICAL_FULLBODY_HINT = (
    "vertical portrait orientation, 9:16 aspect ratio composition, "
    "character fills the entire vertical frame from head (top) to toe (bottom) with minimal top and bottom margin, "
    "centered horizontally, full-length vertical framing"
)
VIEWS = [
    {"id_suffix": "01_front_fullbody", "name": "正面全身",
     "instruction": f"重新生成这个角色的正面全身站立视图,白底/纯色背景,完整可见头顶到脚底,双臂自然下垂,正对镜头,保持角色所有特征完全一致(面部、服装、身材比例、配件、伤疤等)。{VERTICAL_FULLBODY_HINT}。character reference sheet style, full body front view, standing, arms relaxed at sides, white background, identical character features, high detail, anime illustration style, 8k"},
    {"id_suffix": "02_side_fullbody", "name": "侧面全身",
     "instruction": f"重新生成这个角色的左侧 90 度侧面全身站立视图,白底/纯色背景,完整可见头顶到脚底,双臂自然下垂,镜头方向为角色左侧,保持角色所有特征完全一致(面部轮廓、发型侧面、服装侧面、配件、伤疤等)。{VERTICAL_FULLBODY_HINT}。character reference sheet style, full body left side view 90 degrees, standing, arms relaxed at sides, white background, identical character features, high detail, anime illustration style, 8k"},
    {"id_suffix": "03_back_fullbody", "name": "背面全身",
     "instruction": f"重新生成这个角色的背面全身站立视图,白底/纯色背景,完整可见头顶到脚底,双臂自然下垂,正对镜头,展示背部、服装背面、发型背面,保持角色所有特征完全一致(身材比例、服装背面、配件、伤疤等)。{VERTICAL_FULLBODY_HINT}。character reference sheet style, full body back view, standing, arms relaxed at sides, white background, identical character features, high detail, anime illustration style, 8k"},
    {"id_suffix": "04_face_front", "name": "脸部正面",
     "instruction": "裁剪并重新生成这个角色的脸部正面特写,白底/纯色背景,展示完整面部表情、双眼、鼻、嘴、皮肤细节、伤疤,正对镜头,保持角色所有特征完全一致(瞳色、发型、刘海、面部标记等)。character reference sheet style, face front close-up portrait, white background, identical character features, high detail, anime illustration style, 8k"},
    {"id_suffix": "05_face_45", "name": "脸部45度",
     "instruction": "裁剪并重新生成这个角色的脸部 45 度侧面特写(向左侧 45 度),白底/纯色背景,展示完整面部表情、鼻梁轮廓、脸颊线条,保持角色所有特征完全一致(瞳色、发型、刘海、面部标记等)。character reference sheet style, face 45 degree side view close-up portrait, looking 45 degrees to the left, white background, identical character features, high detail, anime illustration style, 8k"},
    {"id_suffix": "06_face_side", "name": "脸部侧面",
     "instruction": "裁剪并重新生成这个角色的脸部 90 度侧面特写(向左侧 90 度),白底/纯色背景,展示侧面轮廓、鼻梁、嘴唇侧面、下颌线、耳朵,保持角色所有特征完全一致(发型侧面、面部标记等)。character reference sheet style, face 90 degree side view close-up portrait, profile view, white background, identical character features, high detail, anime illustration style, 8k"}
]

GLOBAL_INSTRUCTION = (
    "Describe the key features of the input image (color, shape, size, texture, objects, background), "
    "then explain how the user's text instruction should alter or modify the image. "
    "Generate a new image that closely follows the user's instruction while preserving the core identity of the subject."
)

# ==================== 加载主工作流,取真实节点作为模板 ====================
with open(MAIN_WF_PATH, "r", encoding="utf-8") as f:
    main_wf = json.load(f)

# 用多视图模板作为节点模板源(它有完整的 QwenEdit 节点结构,包括 AdaptiveLongestEdge 等)
# 主工作流做补充(它有完整的中文 localized_name 等)
MULTI_GEN_PATH = "/Users/xiongyongsheng/Documents/ComfyUI/user/default/workflows/Qwen_2511_MultiGen_v1.json"
with open(MULTI_GEN_PATH, "r", encoding="utf-8") as f:
    multi_gen = json.load(f)

real_templates = {}
# 优先从多视图模板拿(有 AdaptiveLongestEdge / ConfigPreparer / QwenImageEditPlusCustom 等)
for n in multi_gen['nodes']:
    t = n['type']
    if t not in real_templates:
        real_templates[t] = n
# 主工作流补充(KJNodes / ComfyUI 标准节点: KSampler / VAEDecode / ImageConcanate 等)
for n in main_wf['nodes']:
    t = n['type']
    if t not in real_templates:
        real_templates[t] = n

NEXT_NODE_ID = max(int(n['id']) for n in main_wf['nodes']) + 1
NEXT_LINK_ID = max(link[0] for link in main_wf['links']) + 1

new_nodes = []
new_links = []

MODULE_X = -5500
Y_BASE = 0
Y_STEP = 380

def alloc_id():
    global NEXT_NODE_ID
    nid = NEXT_NODE_ID
    NEXT_NODE_ID += 1
    return nid

def alloc_link():
    global NEXT_LINK_ID
    lid = NEXT_LINK_ID
    NEXT_LINK_ID += 1
    return lid

def clone_node(real_template, new_id, title, pos, widgets_values=None, extra_outputs=None):
    """从主工作流真实节点克隆一个新节点,新 id 和新 title,可覆盖 widgets_values"""
    node = copy.deepcopy(real_template)
    node['id'] = new_id
    node['title'] = title
    node['pos'] = pos
    # 清空 inputs 的 link 引用
    for inp in node.get('inputs', []):
        inp['link'] = None
    # 清空 outputs 的 links 数组
    for out in node.get('outputs', []):
        out['links'] = []
        if 'slot_index' in out:
            pass  # 保留 slot_index
    # 重置 order
    node['order'] = 0
    # 重置 flags
    node['flags'] = {}
    if widgets_values is not None:
        node['widgets_values'] = widgets_values
    # 加 extra outputs(如果节点需要更多输出)
    if extra_outputs:
        node['outputs'].extend(extra_outputs)
    return node

def add_node(node):
    new_nodes.append(node)
    return node

def connect(src_node, src_slot, dst_node, dst_slot, type_name):
    """
    创建连线 + 同步回填:
    1. wf['links'] 加一条
    2. dst_node.inputs[dst_slot].link = link_id
    3. src_node.outputs[src_slot].links.append(link_id)
    """
    lid = alloc_link()
    new_links.append([lid, src_node['id'], dst_node['id'], src_slot, dst_slot, type_name])
    # 回填 dst.input.link
    if dst_slot < len(dst_node['inputs']):
        dst_node['inputs'][dst_slot]['link'] = lid
    # 回填 src.output.links
    if src_slot < len(src_node['outputs']):
        if 'links' not in src_node['outputs'][src_slot] or src_node['outputs'][src_slot]['links'] is None:
            src_node['outputs'][src_slot]['links'] = []
        if lid not in src_node['outputs'][src_slot]['links']:
            src_node['outputs'][src_slot]['links'].append(lid)
    return lid

# ==================== 1. 模型加载节点(从主工作流克隆真实节点) ====================
# 从主工作流找 LoaderGGUF / CLIPLoader / VAELoader 模板
template_unet = real_templates.get('LoaderGGUF')
template_clip = real_templates.get('CLIPLoader')
template_vae = real_templates.get('VAELoader')

assert template_unet and template_clip and template_vae, "找不到模型加载节点模板"

unet_node = add_node(clone_node(
    template_unet, alloc_id(), "LoaderGGUF_char",
    [MODULE_X, Y_BASE],
    widgets_values=["QWEN/Qwen-Image-Edit-2509-Q5_0.gguf"]
))
clip_node = add_node(clone_node(
    template_clip, alloc_id(), "CLIPLoader_char",
    [MODULE_X, Y_BASE + 120],
    widgets_values=["qwen_2.5_vl_7b_fp8_scaled.safetensors", "qwen_image", "default"]
))
vae_node = add_node(clone_node(
    template_vae, alloc_id(), "VAELoader_char",
    [MODULE_X, Y_BASE + 250],
    widgets_values=["qwen_image_vae.safetensors"]
))

# ==================== 2. LoadImage + Adaptive + ConfigPreparer ====================
template_load = real_templates['LoadImage']
template_adaptive = real_templates.get('QwenEditAdaptiveLongestEdge')
template_config = real_templates.get('QwenEditConfigPreparer')

# ==================== 2. LoadImage + Adaptive + ConfigPreparer ====================
# 关键改动(v5):分两组配置
#   - 全身组(fullbody):ref_longest_edge=1216,vl_target_size=1216 → 出竖图 832×1216 类
#   - 脸部组(face):ref_longest_edge=1024,vl_target_size=1024 → 出方形/横图 1024×1024 类
# 之前共用一个 ConfigPreparer 时,6 张图全被 1024 锁成横图,角色全身站姿只剩中间 1/3。
template_load = real_templates['LoadImage']

load_img_node = add_node(clone_node(
    template_load, alloc_id(), "LoadImage_角色参考",
    [MODULE_X + 350, Y_BASE],
    widgets_values=["角色三视图.png", "image"]
))

# ----------------- 全身组(3 张:正面全身、侧面全身、背面全身) -----------------
adaptive_fullbody = add_node(clone_node(
    template_adaptive, alloc_id(), "AdaptiveLongestEdge_char_fullbody",
    [MODULE_X + 600, Y_BASE + 50],
    widgets_values=[1216]   # 全身图最大边长 1216,匹配竖图输出
))
connect(load_img_node, 0, adaptive_fullbody, 0, "IMAGE")

# widgets_values 顺序(from 节点定义):[to_ref, ref_main_image, ref_longest_edge,
#                                       ref_crop, ref_upscale, to_vl, vl_resize,
#                                       vl_target_size, vl_crop, vl_upscale]
config_prep_fullbody = add_node(clone_node(
    template_config, alloc_id(), "ConfigPreparer_char_fullbody",
    [MODULE_X + 600, Y_BASE + 150],
    widgets_values=[True, True, 1216, "pad", "lanczos", True, True, 1216, "center", "lanczos"]
))
connect(load_img_node, 0, config_prep_fullbody, 0, "IMAGE")
connect(adaptive_fullbody, 0, config_prep_fullbody, 5, "INT")

# ----------------- 脸部组(3 张:正面、45 度、侧面) -----------------
adaptive_face = add_node(clone_node(
    template_adaptive, alloc_id(), "AdaptiveLongestEdge_char_face",
    [MODULE_X + 600, Y_BASE + 260],
    widgets_values=[1024]   # 脸部特写用方形,1024 足矣
))
connect(load_img_node, 0, adaptive_face, 0, "IMAGE")

config_prep_face = add_node(clone_node(
    template_config, alloc_id(), "ConfigPreparer_char_face",
    [MODULE_X + 600, Y_BASE + 360],
    widgets_values=[True, True, 1024, "pad", "lanczos", True, True, 1024, "center", "lanczos"]
))
connect(load_img_node, 0, config_prep_face, 0, "IMAGE")
connect(adaptive_face, 0, config_prep_face, 5, "INT")

# ==================== 3. Global Instruction ====================
template_str = real_templates['PrimitiveStringMultiline']
global_instr_node = add_node(clone_node(
    template_str, alloc_id(), "Global_Instruction",
    [MODULE_X + 350, Y_BASE + 380],
    widgets_values=[GLOBAL_INSTRUCTION]
))

# ==================== 4. 6 条视图流水线 ====================
template_textenc = real_templates.get('TextEncodeQwenImageEditPlusCustom_lrzjason') or real_templates['TextEncodeQwenImageEditPlus']
template_zero = real_templates['ConditioningZeroOut']
template_sampler = real_templates['KSampler']
template_vaedec = real_templates['VAEDecode']
template_save = real_templates['SaveImage']

view_vae_nodes = []

for i, view in enumerate(VIEWS):
    y = Y_BASE + 700 + i * Y_STEP

    # 按视图类型选 ConfigPreparer:前 3 个全身用 fullbody 组,后 3 个脸部用 face 组
    config_for_view = config_prep_fullbody if i < 3 else config_prep_face

    # TextEncode
    encode_node = add_node(clone_node(
        template_textenc, alloc_id(), f"TextEncode_{view['id_suffix']}",
        [MODULE_X + 1050, y],
        widgets_values=[view["instruction"], True, GLOBAL_INSTRUCTION]
    ))
    # 按名字找 input slot
    def find_input_slot(node, name):
        for idx, inp in enumerate(node['inputs']):
            if inp['name'] == name:
                return idx
        return None
    def find_output_slot(node, name):
        for idx, out in enumerate(node['outputs']):
            if out['name'] == name:
                return idx
        return None

    connect(clip_node, find_output_slot(clip_node, "CLIP"),
            encode_node, find_input_slot(encode_node, "clip"), "CLIP")
    connect(vae_node, find_output_slot(vae_node, "VAE"),
            encode_node, find_input_slot(encode_node, "vae"), "VAE")
    connect(config_for_view, find_output_slot(config_for_view, "configs"),
            encode_node, find_input_slot(encode_node, "configs"), "CONFIG")
    connect(global_instr_node, find_output_slot(global_instr_node, "STRING"),
            encode_node, find_input_slot(encode_node, "prompt"), "STRING")

    # ConditioningZeroOut
    zero_node = add_node(clone_node(
        template_zero, alloc_id(), f"ZeroOut_{view['id_suffix']}",
        [MODULE_X + 1300, y + 220], widgets_values=[]
    ))
    encode_cond_slot = find_output_slot(encode_node, "conditioning") or 0
    encode_cond_name = "conditioning"
    connect(encode_node, encode_cond_slot,
            zero_node, find_input_slot(zero_node, "conditioning"), "CONDITIONING")

    # KSampler
    # 真实 widget input 顺序: [seed, steps, cfg, sampler_name, scheduler, denoise] (6 个)
    # 注意:widgets_values 数组长度必须等于 widget input 数量,不能加 control_after_generate(那是 UI 隐式)
    sampler_node = add_node(clone_node(
        template_sampler, alloc_id(), f"KSampler_{view['id_suffix']}",
        [MODULE_X + 1330, y],
        widgets_values=[20252047 + i, 8, 2.5, "euler", "simple", 1.0]
    ))
    connect(unet_node, find_output_slot(unet_node, "MODEL"),
            sampler_node, find_input_slot(sampler_node, "model"), "MODEL")
    connect(encode_node, encode_cond_slot,
            sampler_node, find_input_slot(sampler_node, "positive"), "CONDITIONING")
    connect(zero_node, find_output_slot(zero_node, "CONDITIONING"),
            sampler_node, find_input_slot(sampler_node, "negative"), "CONDITIONING")
    encode_latent_slot = find_output_slot(encode_node, "latent") or 1
    connect(encode_node, encode_latent_slot,
            sampler_node, find_input_slot(sampler_node, "latent_image"), "LATENT")

    # VAEDecode
    vae_decode_node = add_node(clone_node(
        template_vaedec, alloc_id(), f"VAEDecode_{view['id_suffix']}",
        [MODULE_X + 1580, y + 220], widgets_values=[]
    ))
    connect(sampler_node, find_output_slot(sampler_node, "LATENT"),
            vae_decode_node, find_input_slot(vae_decode_node, "samples"), "LATENT")
    connect(vae_node, find_output_slot(vae_node, "VAE"),
            vae_decode_node, find_input_slot(vae_decode_node, "vae"), "VAE")

    # SaveImage
    save_node = add_node(clone_node(
        template_save, alloc_id(), f"Save_{view['id_suffix']}",
        [MODULE_X + 1850, y + 220],
        widgets_values=[f"角色视图_{view['name']}"]
    ))
    connect(vae_decode_node, find_output_slot(vae_decode_node, "IMAGE"),
            save_node, find_input_slot(save_node, "images"), "IMAGE")

    view_vae_nodes.append(vae_decode_node)

# ==================== 5. 拼图:6 张图 → 2 行 × 3 列 → 1 张 ====================
template_concat = real_templates['ImageConcanate']
template_preview = real_templates['PreviewImage']

def make_concat(title, pos, direction):
    """创建 ImageConcanate 节点"""
    node = clone_node(
        template_concat, alloc_id(), title, pos,
        widgets_values=[direction, True]
    )
    return add_node(node)

# Row 1 拼图
r1_step1 = make_concat("Concat_R1_正面+侧面", [MODULE_X + 2150, Y_BASE + 200], "right")
connect(view_vae_nodes[0], find_output_slot(view_vae_nodes[0], "IMAGE"),
        r1_step1, find_input_slot(r1_step1, "image1"), "IMAGE")
connect(view_vae_nodes[1], find_output_slot(view_vae_nodes[1], "IMAGE"),
        r1_step1, find_input_slot(r1_step1, "image2"), "IMAGE")

r1_final = make_concat("Concat_R1_完整_前侧背", [MODULE_X + 2450, Y_BASE + 200], "right")
connect(r1_step1, find_output_slot(r1_step1, "output"),
        r1_final, find_input_slot(r1_final, "image1"), "IMAGE")
connect(view_vae_nodes[2], find_output_slot(view_vae_nodes[2], "IMAGE"),
        r1_final, find_input_slot(r1_final, "image2"), "IMAGE")

# Row 2 拼图
r2_step1 = make_concat("Concat_R2_正面+45度", [MODULE_X + 2150, Y_BASE + 450], "right")
connect(view_vae_nodes[3], find_output_slot(view_vae_nodes[3], "IMAGE"),
        r2_step1, find_input_slot(r2_step1, "image1"), "IMAGE")
connect(view_vae_nodes[4], find_output_slot(view_vae_nodes[4], "IMAGE"),
        r2_step1, find_input_slot(r2_step1, "image2"), "IMAGE")

r2_final = make_concat("Concat_R2_完整_正45侧", [MODULE_X + 2450, Y_BASE + 450], "right")
connect(r2_step1, find_output_slot(r2_step1, "output"),
        r2_final, find_input_slot(r2_final, "image1"), "IMAGE")
connect(view_vae_nodes[5], find_output_slot(view_vae_nodes[5], "IMAGE"),
        r2_final, find_input_slot(r2_final, "image2"), "IMAGE")

# Final 垂直拼
final_node = make_concat("Concat_最终合成", [MODULE_X + 2750, Y_BASE + 350], "down")
connect(r1_final, find_output_slot(r1_final, "output"),
        final_node, find_input_slot(final_node, "image1"), "IMAGE")
connect(r2_final, find_output_slot(r2_final, "output"),
        final_node, find_input_slot(final_node, "image2"), "IMAGE")

# Save + Preview
save_final = add_node(clone_node(
    template_save, alloc_id(), "Save_最终合成图",
    [MODULE_X + 3050, Y_BASE + 350],
    widgets_values=["角色参考图_最终合成"]
))
connect(final_node, find_output_slot(final_node, "output"),
        save_final, find_input_slot(save_final, "images"), "IMAGE")

preview_final = add_node(clone_node(
    template_preview, alloc_id(), "Preview_最终合成图",
    [MODULE_X + 3350, Y_BASE + 350],
    widgets_values=[]
))
connect(final_node, find_output_slot(final_node, "output"),
        preview_final, find_input_slot(preview_final, "images"), "IMAGE")

# ==================== 合并 ====================
all_nodes = main_wf['nodes'] + new_nodes
all_links = main_wf['links'] + new_links

new_wf = dict(main_wf)
new_wf['nodes'] = all_nodes
new_wf['links'] = all_links
new_wf['last_node_id'] = NEXT_NODE_ID - 1
new_wf['last_link_id'] = NEXT_LINK_ID - 1

with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(new_wf, f, ensure_ascii=False, indent=1)

print(f"\n✅ 完成!输出: {OUTPUT_PATH}")
print(f"   节点总数: {len(all_nodes)} (主 {len(main_wf['nodes'])} + 新 {len(new_nodes)})")
print(f"   连线总数: {len(all_links)} (主 {len(main_wf['links'])} + 新 {len(new_links)})")
