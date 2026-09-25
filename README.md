# 🛠️ node-red-contrib-joe-tools

> 專為工業自動化、感知器數據解析、PLC 通訊、RFID 與系統管理打造的 Node-RED 一站式工具箱套件。

---

## 🚀 核心特色

* 📦 **一站式工具箱**：只需安裝單一套件，即可擁有 11 個功能強大的專用工業節點。
* 🏷️ **統一分類 (`Joe-Tools`)**：所有節點安裝後自動集中於 Node-RED 側邊欄 **`Joe-Tools`** 分類面板下，整潔不雜亂。
* 🌙 **完美適配深色模式 (Dark Theme)**：UI 面板完全支援 Node-RED 深色主題，對比度清晰，長時間操作眼睛不疲勞。
* ⭐ **小白極簡上手**：每個節點皆提供獨立的小白友善 `README.md` 指南與輸入/輸出範例。

---

## 📦 安裝說明 (Installation)

### 方法一：透過 Node-RED 介面安裝 (推薦)
1. 開啟 Node-RED 編輯器，點擊右上角選單圖示 ➔ 選擇 **Manage palette (管理面板)**。
2. 切換至 **Install (安裝)** 分頁。
3. 搜尋 `node-red-contrib-joe-tools`。
4. 點擊 **Install** 即可自動完成安裝！

### 方法二：透過 Terminal / 命令列安裝
進入您的 Node-RED 使用者資料夾（通常為 `~/.node-red`）並執行安裝指令：

```bash
cd ~/.node-red
npm install node-red-contrib-joe-tools
```
安裝完成後，重啟 Node-RED 即可在側邊欄找到 **Joe-Tools** 分類！

---

## 🛠️ 套件包含之 11 個節點

### 📡 感測器與數據解析

| 節點名稱 | 標記名稱 | 功能簡述 | 說明文件 |
| :--- | :--- | :--- | :--- |
| **Modbus ASCII 打包器** | `modbus-ascii-packer` | 將文字轉為 Modbus 數字陣列並延遲發送寫入觸發命令 | [README](./modbus-ascii-packer/README.md) |
| **Modbus Hex 解碼器** | `modbus-hex-decoder` | 將 Modbus 讀取出的陣列轉為大寫 HEX 連續字串 | [README](./modbus-hex-decoder/README.md) |
| **Joe RFID 解析器** | `joe-rfid-decoder` | 自動將 Modbus RFID 感應器數據解碼為標準 RFID 卡號 | [README](./joe-rfid-decoder/README.md) |
| **Joe 壓力表解析器** | `joe-pressure-parser` | 解析 SMC 壓力表 (ISE20B/ZSE20B/ZSE20BF) 壓力值與開關狀態 | [README](./joe-pressure-parser/README.md) |
| **Joe 流量表解析器** | `joe-flow-parser` | 解析 SMC 流量計 2 個暫存器，計算實際流量與硬體診斷狀態 | [README](./joe-flow-parser/README.md) |
| **Joe 超聲波解析器** | `joe-ultrasonic-parser` | 支援 Modbus (除以 1024) 與 MQTT 2-Byte (除以 4) 距離解析 | [README](./joe-ultrasonic-parser/README.md) |
| **Omron 電力計解析器** | `joe-power-parser` | 解析 Omron 電力計電壓/電流原始值並自動計算功率 (W) | [README](./joe-power-parser/README.md) |

### 🔌 PLC 通訊與 RFID

| 節點名稱 | 標記名稱 | 功能簡述 | 說明文件 |
| :--- | :--- | :--- | :--- |
| **Siemens S7-Plus** | `s7complus` | 西門子 S7-1200 / S7-1500 PLC 符號名稱 (Symbolic) 通訊套件 | [README](./node-red-contrib-s7-plus/nodes/README.md) |
| **RFID 智慧模組** | `rfid-lazy` | 工業級 RFID 卡片防碰撞分批寫入與卡片離開通知 | [README](./rfid-lazy/README.md) |

### 🗄️ 資料庫與 UI 工具

| 節點名稱 | 標記名稱 | 功能簡述 | 說明文件 |
| :--- | :--- | :--- | :--- |
| **MySQL SQLGen** | `mysql-extended` | 免寫程式碼，透過視覺化介面點選產生 SELECT / INSERT SQL | [README](./mysql-extended/README.md) |
| **全自動變數管理** | `variable-change` | 拖曳式與視覺化 Flow / Global 全域變數管理員 | [README](./variable-change/README.md) |
| **Media Viewer** | `node-red-ui_media_viewer` | Dashboard 動態圖片與 MP4 影片播放檢視器 | [README](./node-red-ui_media_viewer/README.md) |

---

## 📜 授權條款 (License)

[ISC License](./LICENSE)
