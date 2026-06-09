# 04. 潜行 / 警觉系统

> **章节 L**（2026-06-08 改，经历 4 次公式迭代）
>
> 涉及文件：[enemies.ts](../../packages/webgal/src/UI/Scavenge/ScavengeEnemies/enemies.ts) + [characterCombat.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCharacter/characterCombat.ts) + [missions.ts](../../packages/webgal/src/UI/Scavenge/ScavengeMissions/missions.ts) + [inventory.ts](../../packages/webgal/src/UI/Scavenge/ScavengeItems/inventory.ts) + [items.ts](../../packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts) + UI 多处

## 核心机制

- 敌人加 `detection: 0~100` 整数（警觉基数）
- 装备加 `stealth: -N ~ +N`（潜行值，可负可正）
- 拾荒遭遇时，**每个敌人独立对角色做警觉判定**
- 至少一个发现 → 战斗；全部没发现 → `evade_success`

## 角色潜行公式

[characterCombat.ts computeDerivedStats](../../packages/webgal/src/UI/Scavenge/ScavengeCharacter/characterCombat.ts)：

```ts
let stealth = Σ(equipped.stealth) * (1 + char.agi / 10)   // 装备×agi 乘数
if (isNight) stealth = Math.floor(stealth * 1.1);           // 黑夜 ×1.1
stealth = Math.round(stealth);                             // 取整
stealth = Math.min(100, stealth);                          // 上界 100，负值保留
```

**关键约定**（用户原话）："装备提供的潜行值是基础，agi 是百分比乘数"
- Σ equipped.stealth = 0 → 必然 stealth = 0（agi 再高也救不回来）
- Σ equipped.stealth < 0（重甲）→ stealth < 0 → 装备太暴露，必被发现
- 这是设计意图：装备是"潜行的物质条件"，agi 只是"放大器"

| 装备配置 | Σ | agi | stealth | 备注 |
|---|---|---|---|---|
| 全裸 / 卸光 | 0 | 任意 | 0 | 必被发现 |
| 6 件普通防具 | -19 | 5 | -28.5 → **-29** | 必被发现（强制） |
| 全裸 + 顶级潜行套装 | +35 | 5 | 35 × 1.5 = 52.5 → **53** | 高潜行 |
| 露西（基础潜行套装）| +12 | 8 | 12 × 1.8 = 21.6 → **22** | 偏敏捷潜行流 |
| 露西 + 黑夜 | +12 | 8 | 22 × 1.1 = 24.2 → **24** | 夜间 ×1.1 |

## 警觉判定公式

[missions.ts encounterCheck](../../packages/webgal/src/UI/Scavenge/ScavengeMissions/missions.ts)：

```ts
// 单敌人察觉概率（Luce choice 非对称公式，2026-06-08 第四次改）
success = char / (char + enemy)
//   char 主导（大于 enemy）→ success 偏高
//   enemy 主导（大于 char）→ success 偏低
//   char == enemy           → 50% 掷硬币
//
// 例：char=50, enemy=25 → 50/75 = 66.7%   (char 主导，合理的高)
//   char=50, enemy=75 → 50/125 = 40%    (enemy 主导，合理的低)
//   char=22, enemy=25 → 22/47 = 46.8%   (略低于敌人，掷硬币)
//   char=22, enemy=90 → 22/112 = 19.6%  (差很多，难)

detected = (char <= 0) || (random() >= success)  // 不成功 = 被发现
```

**判定语义**（用户原话）："用两个数值来计算"
- 双方都是 **整数**（不是百分比）
- 公式：**非对称** Luce choice，char 占优→高，enemy 占优→低
- 修正了上一版 `1 - min/max` 的"差距越大成功率越高"反直觉问题
- 例外：
  - `char <= 0`（无潜行装备或装备总暴露）→ 强制被发现
  - `enemy.detection <= 0`（特殊敌人不警觉）→ 100% 潜行成功

## 敌人警觉值表

[enemies.ts](../../packages/webgal/src/UI/Scavenge/ScavengeEnemies/enemies.ts)：

| 敌人 | detection | 特征 |
|---|---|---|
| 游荡者 wanderer | 25 | 漫无目的，察觉率低 |
| 追逐者 chaser | 50 | 警觉高 |
| 防暴者 rioter | 75 | 训练有素 |
| **哨兵 sentinel（新增）** | **90** | 远距侦测，碰见基本必战 |

## 哨兵设计（2026-06-08 加）

- HP 30（低）/ 攻击 6（低）/ 速度 25（中等）
- accuracy 0.8 / evasion 0.2 / critRate 0.10 / critMult 1.4
- detection 90（极高）
- 意图：让"高警觉场所"成为可能，装备潜行套装 vs 哨兵仍有 7% 潜行成功率
- 配置详见 [05-region-config.md](./05-region-config.md)

## 被发现时的先手机制（2026-06-08 加）

- 被发现的敌人 `EnemyInstance.startAtb = 50`
- `runCombat` 初始化时 `currentTick = startAtb ?? 0`
- 效果：发现的敌人首轮直接行动 1 次（ATB 50% + attackSpeed 25 = 75% 接近触发），未发现的敌人 ATB=0 正常开始
- 这是"被发现"的合理代价

## 装备潜行值分配规则

- 普通防具：-1 ~ -8（沉重/会响 → 减潜行）
- 重型防具 epic：-3 ~ -10（更明显）
- 顶级特战装备：+3 ~ +15（轻量/消音 → 加潜行）

### 潜行护甲清单（2026-06-08 新增 5 件，2026-06-08 改耐久 1/3）

**耐久规则**：潜行型护甲 maxDurability ≈ 同稀有度同部位普通护甲的 1/3
- 软质内甲（rare chest）：150/3 = **50**
- 吉利服（epic chest）：200/3 = **67**
- 战术斗篷（epic chest）：200/3 = **67**
- 软底靴（rare boots）：90/3 = **30**
- 薄手套（rare gloves）：70/3 = **23**

**耐久衰减公式**（[inventory.ts getItemCurrentStealth](../../packages/webgal/src/UI/Scavenge/ScavengeItems/inventory.ts)，2026-06-08 加）：

```ts
currentStealth = baseStealth × (current / max)
// 吉利服（+15, 满 67/67）→ 当前 +15
// 吉利服（+15, 半 33/67）→ 当前 +7.5
// 吉利服（+15, 残 1/67）  → 当前 +0.2 ≈ 0
```

| ID | 部位 | 稀有 | stealth | 耐久 | 描述 |
|---|---|---|---|---|---|
| `armor_chest_soft` 软质内甲 | chest | rare | +5 | **50** | 贴身软甲，便于隐蔽 |
| `armor_chest_ghillie` 吉利服 | chest | epic | **+15** | **67** | 伪装用，破损快 |
| `armor_chest_cloak` 战术斗篷 | chest | epic | +8 | **67** | 轻便披风 |
| `armor_boots_soft` 软底靴 | boots | rare | +4 | **30** | 静音鞋底 |
| `armor_gloves_thin` 薄手套 | gloves | rare | +3 | **23** | 不影响精细操作 |

### 现有护甲 stealth 值（普通/epic）

| 部位 | 普通 | 战术 | 重型 epic |
|---|---|---|---|
| helmet | -2 | - | -4（防暴头盔）|
| chest | -3 | -5（防刺背心）/ -8（战术背心）| -10（重型护甲）|
| arms | -2 | -4 | -6 |
| gloves | -1 | -2 | -3 |
| legs | -3 | -5 | -7 |
| boots | -2 | -3 | -4 |

## UI 显示约定

- 角色面板"战斗属性"原"隐蔽率"改为"**总潜行值**"
- 直接显示 character.stealth（带 agi + base 算好）的**整数**（如 `+35` / `-19` / `0`）
- 颜色：正绿 / 轻橙（-1~-7）/ 重红（≤-8）/ 0 灰
- **不显示潜行率**（百分比）：因为真正的成功率由 `char / (char + enemy)` 按单个敌人算，单一百分比没意义
- 装备栏每件装备单独显示自己的 stealth 值（`潜行 +15` 小标签 + ↓ 提示），按当前耐久缩放
- tooltip 详细显示潜行值 + 文字说明（增强隐蔽/轻微暴露/严重暴露）

---

## 相关文档

- 核心机制 B（敌人系统）：[00-overview.md](./00-overview.md#b-敌人系统enemists)
- 核心机制 D（遭遇判定）：[00-overview.md](./00-overview.md#d-遭遇判定missionsencountercheck)
- 护甲系统的 stealth 字段：[02-armor.md](./02-armor.md)
- 哨兵在哪些地点出现：[05-region-config.md](./05-region-config.md)
- 物品 ID 注册规则：[10-item-registry.md](./10-item-registry.md)
