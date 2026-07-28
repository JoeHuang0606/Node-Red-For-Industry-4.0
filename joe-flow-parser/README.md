# 💧 Joe 流量表解析器 (`joe-flow-parser`)

> **分類**：`Joe-Tools`  
> **難易度**：⭐小白友善

---

## 💡 一秒看懂
自動解析 **SMC 數位流量計** 的 2 個 Modbus 暫存器資料，直接計算出**即時實際流量**以及硬體警報與開關狀態！

---

## 🎯 什麼時候用它？
* 監控氣體或液體管道流速流量。

---

## 📥 輸入資料 (Input)
讀取 Modbus 2 個 Word "288 2"的陣列輸入：
```json
{
  "payload": [10240, 768]
}
```

---

## ⚙️ 面板屬性設定指南

| 設定項目 | 小白白話說明 | 預設值 |
| :--- | :--- | :--- |
| **節點名稱** | 自訂名稱 | `Joe 流量表解析器` |
| **流量縮放係數** | 用於將原始數值換算為真實流量的除數係數 | `40` |

---

## 📤 輸出結果 (Output)

```json
{
  "payload": {
    "raw_data": [10240, 768],
    "flow_rate_raw": 40,
    "actual_flow": 1.0,
    "out1_active": true,
    "out2_active": true,
    "hardware_error": false
  }
}
```
* `actual_flow`：計算出的即時實際流量值。
* `hardware_error`：硬體是否發生故障警報 (`true` / `false`)。
