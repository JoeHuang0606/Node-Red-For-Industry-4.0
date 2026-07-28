module.exports = function(RED) {
    function JoePowerParserNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        node.on('input', function(msg) {
            try {
                var payload = msg.payload;

                // 需要至少 3 個暫存器：[狀態, 電壓, 電流]
                if (!Array.isArray(payload) || payload.length < 3) {
                    node.warn("輸入資料需為至少 3 個元素的陣列 [狀態, 電壓, 電流]");
                    return;
                }

                var rawVoltage = payload[1];
                var rawCurrent = payload[2];

                // 手冊定義 0~9990 代表 0.00~99.90，因此乘上 0.01
                var voltage = rawVoltage * 0.01;
                var current = rawCurrent * 0.01;

                // 計算瓦特數 (W)
                var wattage = voltage * current;

                // 取小數點後兩位，避免浮點數誤差
                msg.payload = {
                    "Voltage_V": Number(voltage.toFixed(2)),
                    "Current_A": Number(current.toFixed(2)),
                    "Power_W": Number(wattage.toFixed(1))
                };

                node.send(msg);
            } catch (e) {
                node.error("電力計解析錯誤: " + e.message, msg);
            }
        });
    }
    RED.nodes.registerType("joe-power-parser", JoePowerParserNode);
};
