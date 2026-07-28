module.exports = function (RED) {
    function JoeFlowParserNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        node.scaleFactor = parseFloat(config.scaleFactor);
        if (isNaN(node.scaleFactor) || node.scaleFactor === 0) {
            node.scaleFactor = 40.0;
        }

        node.on('input', function (msg) {
            if (!msg.payload || !Array.isArray(msg.payload) || msg.payload.length < 2) {
                node.warn("msg.payload 必須為包含至少 2 個 Word 數值的陣列");
                node.send(msg);
                return;
            }

            try {
                const word0 = msg.payload[0];
                const word1 = msg.payload[1];

                // 1. 解析即時流量值 (進行 Byte Swap)
                const flow_high_byte = word0 & 0xFF;
                const flow_low_byte = (word0 >> 8) & 0xFF;
                let raw_flow = (flow_high_byte << 8) | flow_low_byte;

                // 處理 16-bit 有符號數
                if (raw_flow & 0x8000) {
                    raw_flow = raw_flow - 0x10000;
                }

                // 2. 換算實際流量
                let actual_flow = raw_flow / node.scaleFactor;
                actual_flow = Math.round(actual_flow * 100) / 100;

                // 3. 解析狀態位元 (進行 Byte Swap)
                const status_high_byte = word1 & 0xFF;
                const status_low_byte = (word1 >> 8) & 0xFF;
                const status_word = (status_high_byte << 8) | status_low_byte;

                const out1_active = (status_word & 0x01) === 0x01;
                const out2_active = (status_word & 0x02) === 0x02;
                const flow_error = (status_word & 0x04) === 0x04;

                // 4. 輸出整理後的資料
                msg.payload = {
                    raw_data: msg.payload,
                    flow_rate_raw: raw_flow,
                    actual_flow: actual_flow,
                    out1_active: out1_active,
                    out2_active: out2_active,
                    hardware_error: flow_error
                };

                node.send(msg);
            } catch (err) {
                node.error("解析流量表資料時發生錯誤: " + err.message, msg);
            }
        });
    }

    RED.nodes.registerType("joe-flow-parser", JoeFlowParserNode);
};
