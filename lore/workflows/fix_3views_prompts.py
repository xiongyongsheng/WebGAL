#!/usr/bin/env python3
"""
重跑 3 张不满意的:脸部正面 / 正面全身 / 脸部45度
- 删掉 anime illustration / character reference sheet / 8k 这些会拉成 2D 风的词
- 强调 photorealistic / 写实摄影
- 45° 角度用更明确的描述:head turned 45 degrees, three-quarter view
"""
import json, copy

# 加载主工作流作为节点模板
with open("/Users/xiongyongsheng/Documents/ComfyUI/user/default/workflows/⨝Qwen2511人物+背景一致性图像编辑工作流2026-05-28.json", "r", encoding="utf-8") as f:
    main_wf = json.load(f)
with open("/Users/xiongyongsheng/Documents/ComfyUI/user/default/workflows/Qwen_2511_MultiGen_v1.json", "r", encoding="utf-8") as f:
    multi_gen = json.load(f)

# 构建节点模板索引
real_templates = {}
for n in multi_gen['nodes']:
    if n['type'] not in real_templates:
        real_templates[n['type']] = n
for n in main_wf['nodes']:
    if n['type'] not in real_templates:
        real_templates[n['type']] = n

# 找到现有工作流
WF_PATH = "/Users/xiongyongsheng/WORKSPACE/OpenWebGal/WebGAL/lore/workflows/Qwen2511_角色6视图生成+主工作流.json"
with open(WF_PATH, "r", encoding="utf-8") as f:
    wf = json.load(f)

# ===== 新 prompt(关键修复)=====
NEW_VIEWS = [
    {
        "title_match": "TextEncode_01_front_fullbody",
        "new_instruction": "Recreate this same character as a photorealistic full body portrait, standing facing the camera, arms relaxed at sides, white background, real photo, studio lighting, 8k uhd, preserve the exact same face, hairstyle, outfit, and body proportions. Do not stylize, keep photographic realism."
    },
    {
        "title_match": "TextEncode_04_face_front",
        "new_instruction": "Recreate this same character's face in a tight close-up portrait, head-on view, photorealistic, real photo, studio lighting with soft key light, natural skin texture with pores and subtle imperfections, sharp eyes, preserve the exact same face features (eye shape, nose, lips, eyebrows, hairstyle framing the face). Do not stylize, keep photographic realism, no illustration, no anime."
    },
    {
        "title_match": "TextEncode_05_face_45",
        "new_instruction": "Recreate this same character's face as a photorealistic three-quarter view portrait, the head turned 45 degrees to the left from the camera, eyes looking slightly toward the camera, natural skin texture, real photo, studio lighting, soft shadows on one side of the face, preserve the exact same face features, eye color, hairstyle, no illustration, no anime, no stylized art, keep photographic realism."
    }
]

# 修改这些节点的 widgets_values(第一个 widget 是 prompt)
modified = 0
for n in wf['nodes']:
    for nv in NEW_VIEWS:
        if n.get('title') == nv['title_match']:
            if not n.get('widgets_values'):
                print(f"⚠️ 节点 {n['id']} 没有 widgets_values,跳过")
                continue
            old = n['widgets_values'][0][:60]
            n['widgets_values'][0] = nv['new_instruction']
            new = n['widgets_values'][0][:60]
            print(f"\n[{n['id']}] {n.get('title','')}")
            print(f"  OLD: {old}...")
            print(f"  NEW: {new}...")
            modified += 1

print(f"\n✅ 修改了 {modified} 个节点的 prompt")

# 保存
with open(WF_PATH, "w", encoding="utf-8") as f:
    json.dump(wf, f, ensure_ascii=False, indent=1)

print(f"✅ 已保存: {WF_PATH}")
