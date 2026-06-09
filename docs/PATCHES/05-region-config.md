# 05. 地区敌人配置

> **章节 M**（2026-06-08 加）
>
> 涉及文件：[locations.ts](../../packages/webgal/src/UI/Scavenge/ScavengeMap/locations.ts)

## 目的

让"高警觉场所"成为可能。普通地点不出现哨兵，高安全级别地点（医院/警察局/政府）出现哨兵。

## 新增的 enemyPool 配置

覆盖默认 `ENEMY_POOL_BY_DANGER[dangerLevel]`：

| 地点 | danger | 区域 | 敌人构成 | 哨兵 | 设计意图 |
|---|---|---|---|---|---|
| `hospital` 医院 | 4 | public | 1-2 wanderer + 1-2 chaser + 0-1 rioter | **1 sentinel** | 医疗安全警卫（中等） |
| `police` 警察局 | 5 | government | 1 wanderer + 2-3 chaser + 1-2 rioter | **2 sentinel** | 双岗哨（高） |
| `government` 政府办公楼 | 4 | government | 1 wanderer + 1-2 chaser + 1 rioter | **1 sentinel** | 入口安检（中等） |

## 未配置的地点（继续走默认 pool，不出现哨兵）

- `slums` 贫民窟（danger 0）
- `park` 公园（danger 1）
- `convenience` 便利店（danger 1）
- `apartment` 普通小区（danger 2）
- `food_street` 美食街（danger 2）
- `shopping` 购物街（danger 2）
- `supermarket` 大型商超（danger 3）
- `villa` 别墅区（danger 3）
- `school` 学校（danger 3）
- `industrial` 工业区（danger 3）

## 哨兵 vs 普通防甲的潜行成功测试（基于 Luce choice 公式）

> 注意：以下用旧版 `detection × (1 - stealth)` 公式算的，新版是 `char / (char + enemy)`，比例近似

- 警察局（detection 平均 ~60）+ 普通防甲（Σ=-19）→ 潜行 0%，必战
- 警察局 + 顶级潜行套装（Σ=+35）→ 潜行 42.5% × 60% = 25.5% 潜行成功
- 警察局 + 顶级套装 + agi 12 → 46% × 60% = 27.6% 潜行成功

## 添加新地区敌人配置的模板

在 [locations.ts](../../packages/webgal/src/UI/Scavenge/ScavengeMap/locations.ts) 的 location 对象里加 `enemyPool` 字段：

```ts
{
  id: 'your_location',
  name: '你的地点',
  // ...其他字段...
  dangerLevel: 4,
  enemyPool: [
    { type: 'wanderer', min: 1, max: 2 },
    { type: 'chaser', min: 1, max: 2 },
    { type: 'rioter', min: 0, max: 1 },
    { type: 'sentinel', min: 1, max: 1 },  // 想要哨兵就加这行
  ],
}
```

不设 `enemyPool` 字段 = 走 `ENEMY_POOL_BY_DANGER[dangerLevel]` 默认值。

---

## 相关文档

- 核心机制 B（敌人系统 + ENEMY_POOL_BY_DANGER）：[00-overview.md](./00-overview.md#b-敌人系统enemists)
- 哨兵的设计定位：[04-stealth.md](./04-stealth.md#哨兵设计2026-06-08-加)
- 警觉判定公式：[04-stealth.md](./04-stealth.md#警觉判定公式)
