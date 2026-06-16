#!/usr/bin/env python3
"""用 ComfyUI 自带的 spandrel 库跑 RealESRGAN 4x 放大"""
import sys
import os
import time

# 静默 torch 的 MPS 警告
os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"

import torch
import spandrel
import numpy as np
from PIL import Image

MODEL_DIR = "/Users/xiongyongsheng/Documents/ComfyUI/models/upscale_models"
# 用 ComfyUI 已有的 4x_foolhardy_Remacri.pth（社区精品 4x 放大模型）
MODEL_PATH = os.path.join(MODEL_DIR, "4x_foolhardy_Remacri.pth")
SRC = "/Users/xiongyongsheng/WORKSPACE/OpenWebGal/WebGAL/lore/assets/city-map-original.png"
DST = "/Users/xiongyongsheng/WORKSPACE/OpenWebGal/WebGAL/lore/assets/city-map-2k.png"

assert os.path.exists(MODEL_PATH), f"模型不存在: {MODEL_PATH}"
print(f"使用模型: {os.path.basename(MODEL_PATH)} ({os.path.getsize(MODEL_PATH) // 1024 // 1024} MB)")

# 2) 加载模型
print("加载 RealESRGAN ...")
model = spandrel.ModelLoader().load_from_file(MODEL_PATH)
model.eval()

# 3) Mac 用 MPS
device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
print(f"使用设备: {device}")
model.to(device)

# 4) 读图
print(f"读取原图: {SRC}")
img = Image.open(SRC).convert("RGB")
print(f"  原图尺寸: {img.size}")

# 5) 推理
print("开始放大 ...")
t0 = time.time()
with torch.no_grad():
    img_t = torch.from_numpy(np.array(img)).permute(2, 0, 1).unsqueeze(0).float() / 255.0
    img_t = img_t.to(device)
    out_t = model(img_t)
    out_t = out_t.clamp(0, 1).cpu()
    out_img = (out_t[0].permute(1, 2, 0).numpy() * 255).round().astype("uint8")
    out_pil = Image.fromarray(out_img)
elapsed = time.time() - t0
print(f"  放大后尺寸: {out_pil.size}  用时: {elapsed:.1f}s")

# 6) 如果超过 2K（2560×1440），缩放到 2K
target_w, target_h = 2560, 1440
ow, oh = out_pil.size
print(f"  4x 放大: {ow}×{oh}")
if ow > target_w or oh > target_h:
    scale = min(target_w / ow, target_h / oh)
    new_w = int(ow * scale)
    new_h = int(oh * scale)
    out_pil = out_pil.resize((new_w, new_h), Image.LANCZOS)
    print(f"  缩放到 2K: {new_w}×{new_h}")

# 7) 保存
out_pil.save(DST, optimize=True)
size_mb = os.path.getsize(DST) / 1024 / 1024
print(f"✅ 已保存: {DST}  ({out_pil.size[0]}×{out_pil.size[1]}, {size_mb:.1f} MB)")
