# ⏱️ Joe 壓力表解析器 (`joe-pressure-parser`)

> **分類**：`Joe-Tools`  
> **難易度**：⭐小白友善

---

## 💡 一秒看懂
自動解析 **SMC 數位壓力表** 傳過來的 16-bit 原始數值。不用你自己寫程式去算高低 Byte 對調、位元位移或公式，拉這個節點直接產出**實際壓力值 (MPa/kPa)** 與 **OUT1/OUT2 開關狀態**！

---

## 🎯 什麼時候用它？
* 廠務與自動化設備讀取 SMC 氣壓表、真空表數值時。

---

## 📥 輸入資料 (Input)
接 Modbus Read 讀取暫存器 272 "272 1" 傳出的原始數值：
```json
{
  "payload": 57374
}
```
*(也支援陣列 `[57374]` 輸入)*

---

## ⚙️ 面板屬性設定指南

| 設定項目 | 小白白話說明 | 可選項目 |
| :--- | :--- | :--- |
| **節點名稱** | 自訂名稱 | `Joe 壓力表解析器` |
| **SMC 型號** | 依據你現場實際使用的 SMC 壓力表型號選擇 | 1. **ISE20B** (正壓型: -0.1 ~ 1 MPa)<br>2. **ZSE20B** (真空壓型: 0 ~ -101 kPa)<br>3. **ZSE20BF** (混合壓型: -100 ~ 100 kPa) |

---

## 📤 輸出結果 (Output)

```json
{
  "payload": {
    "is_connected": true,
    "out1_status": "OFF",
    "out2_status": "OFF",
    "status_normal": true,
    "raw_pd": 988,
    "actual_pressure": -0.003
  }
}
```
* `actual_pressure` 就是讀取出的實際壓力數值！
* `out1_status` / `out2_status` 表示壓力開關警報觸發狀態！
