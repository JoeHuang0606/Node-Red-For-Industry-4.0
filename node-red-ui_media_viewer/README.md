# 📺 Dashboard 動態媒體播放器 (`node-red-ui_media_viewer`)

> **分類**：`Joe-Tools`  
> **難易度**：⭐小白友善  
> *(註：需先安裝 Node-RED Dashboard)*

---

## 💡 一秒看懂
只要在 `msg.payload` 傳入圖片或影片的**檔案路徑**（例如 `C:\test.mp4` 或 `D:\photo.jpg`），Dashboard 畫面上就會自動播放影片或顯示圖片！

---

## 🎯 什麼時候用它？
* 產線檢驗判定時，自動切換顯示不良品照片。
* 警報發生時，在 Dashboard 畫面上自動播放 SOP 示範影片。

---

## 📥 輸入資料 (Input)

傳入檔案路徑字串：
```json
{
  "payload": "C:\\videos\\alarm_sop.mp4"
}
```

若要清除畫面，只需傳入：
```json
{
  "payload": "clear"
}
```

---

## ⚙️ 面板屬性設定指南

* **Group**：選擇要放在 Dashboard 的哪一個 UI 群組視窗中。
* **Size**：設定播放器顯示的寬高尺寸。
