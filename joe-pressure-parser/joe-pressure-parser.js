module.exports = function (RED) {
    function JoePressureParserNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        node.modelType = config.modelType || "ISE20B";

        node.on('input', function (msg) {
            let rawInput = msg.payload;

            // 若 payload 是陣列則取第一個元素
            if (Array.isArray(rawInput) || ArrayBuffer.isView(rawInput)) {
                rawInput = rawInput[0];
            }

            let raw = parseInt(rawInput);
            if (isNaN(raw)) {
                node.warn("msg.payload 不是有效的數字格式");
                node.send(msg);
                return;
            }

            try {
                // 1. 限制在 16-bit 範圍
                raw = raw & 0xFFFF;

                // 2. 高低位元組對調 (Byte Swap)
                let swapped = ((raw & 0xFF) << 8) | ((raw >> 8) & 0xFF);

                // 3. 狀態訊號
                let out1 = swapped & 0x01;
                let out2 = (swapped >> 1) & 0x01;
                let diag = (swapped >> 2) & 0x01;

                // 4. 壓力計原始數值 (PD)
                let pd = swapped >> 3;

                // 5. 依型號計算壓力值
                let pressure = 0;
                if (node.modelType === "ZSE20B") {
                    // 真空壓型 (ZSE20B) -> 單位：kPa
                    pressure = (-0.025 * pd) + 25;
                } else if (node.modelType === "ZSE20BF") {
                    // 混合壓型 (ZSE20BF) -> 單位：kPa
                    pressure = (0.05 * pd) - 150;
                } else {
                    // 正壓型 (ISE20B) -> 單位：MPa
                    pressure = (0.00025 * pd) - 0.25;
                }

                // 6. 輸出格式化結果
                msg.payload = {
                    "is_connected": true,
                    "out1_status": out1 === 1 ? "ON" : "OFF",
                    "out2_status": out2 === 1 ? "ON" : "OFF",
                    "status_normal": diag === 0,
                    "raw_pd": pd,
                    "actual_pressure": Number(pressure.toFixed(4))
                };

                node.send(msg);
            } catch (err) {
                node.error("解析壓力表資料時發生錯誤: " + err.message, msg);
            }
        });
    }

    RED.nodes.registerType("joe-pressure-parser", JoePressureParserNode);
};
