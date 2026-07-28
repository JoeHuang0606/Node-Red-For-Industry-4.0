# 🔌 西門子 S7 PLC 萬用通訊套件 (`s7complus`)

> **分類**：`Joe-Tools`  
> **難易度**：⭐小白友善

---

## 💡 一秒看懂
專為西門子 **S7-1200 / S7-1500 PLC** 設計的通訊節點！支援**符號名稱 (Symbolic Access)** 直接讀寫，不用再辛苦去算 DB 區的 Offset 位元組位址了！

---

## 🎯 什麼時候用它？
* 與西門子 S7-1200 / 1500 PLC 進行高速資料讀取與寫入。
* 需要自動重連機制與通訊看門狗 (Watchdog) 保護。

---

## 🛠️ 套件包含之節點

1. **S7+ Endpoint (連線設定節點)**：設定 PLC IP 位址與 Rack / Slot。
2. **S7+ Read (讀取節點)**：輸入變數符號名稱（如 `"DB1.Temperature"`）直接讀取數值。
3. **S7+ Write (寫入節點)**：將 Payload 寫入 PLC 指定的符號名稱位址。
4. **S7+ Explore (瀏覽節點)**：自動掃描 PLC 內部所有的符號變數結構。

---

## 📥 讀取範例 (S7+ Read)
```json
{
  "payload": {
    "DB_Sensors.Temperature": 25.4,
    "DB_Sensors.Pressure": 1.02
  }
}
```
極其穩定且支援掉線自動自我修復！
