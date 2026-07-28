# 🗄️ MySQL 視覺化 SQL 產生器 (`my-mysql-extended`)

> **分類**：`Joe-Tools`  
> **難易度**：⭐小白友善

---

## 💡 一秒看懂
不用背語法、不用手寫 `SELECT * FROM...`！  
這個節點提供**視覺化點選介面**，點幾下滑鼠就能幫你自動產生標準的 MySQL SQL 查詢指令。

---

## 🎯 什麼時候用它？
* 不熟悉 SQL 語法的新手要讀寫 MySQL 資料庫。
* 需要動態對多張表進行 `INNER JOIN` 或 `LEFT JOIN` 關聯查詢。

---

## ⚙️ 面板屬性設定指南

1. **選擇資料庫連線 (Database)**：選擇你的 MySQL 連線設定。
2. **操作模式 (Action)**：選擇 `SELECT` (查詢)、`INSERT` (新增)、`UPDATE` (更新) 或 `DELETE` (刪除)。
3. **選擇資料表 (Table)**：連線成功後自動下拉顯示資料庫中的所有表格。
4. **多表關聯 (Joins)**：點擊「新增 Join」按鈕即可拉入第二張表進行關聯點選。

---

## 📤 輸出結果 (Output)

```json
{
  "topic": "SELECT `users`.`id`, `users`.`name` FROM `users` WHERE `users`.`status` = 1;",
  "payload": []
}
```
直接接給 `node-red-node-mysql` 即可執行資料庫操作！
