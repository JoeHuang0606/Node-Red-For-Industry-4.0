module.exports = function (RED) {
    function ModbusAsciiPackerNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        // 讀取 UI 設定的參數
        node.totalWords = parseInt(config.totalWords) || 32;
        node.maxValidWords = parseInt(config.maxValidWords) || 8;
        node.delayTime = parseFloat(config.delayTime) || 1.0;
        node.triggerValue = parseInt(config.triggerValue) || 1;

        node.on('input', function (msg) {
            let inputString = (msg.payload || "").toString();

            // 1. 建立指定長度的 Uint16Array
            let uint16Payload = new Uint16Array(node.totalWords);

            // 2. 截取有效字元長度
            let maxChars = node.maxValidWords * 2;
            let validString = inputString.substring(0, maxChars).padEnd(maxChars, '\0');

            // 3. 進行 Big-Endian 高低位元組打包
            for (let i = 0; i < node.totalWords; i++) {
                if (i < node.maxValidWords) {
                    let charHi = validString.charCodeAt(i * 2);
                    let charLo = validString.charCodeAt(i * 2 + 1);
                    uint16Payload[i] = (charHi << 8) | (charLo & 0xFF);
                } else {
                    uint16Payload[i] = 0;
                }
            }

            // 4. 第一路輸出：打包後的 Uint16 陣列
            let msgData = RED.util.cloneMessage(msg);
            msgData.payload = uint16Payload;

            // 第二路輸出：預設為 null (稍後非同步發送)
            node.send([msgData, null]);

            // 5. 延遲指定時間後，發送第二路觸發訊號
            setTimeout(function () {
                let msgTrigger = RED.util.cloneMessage(msg);
                msgTrigger.payload = node.triggerValue;
                node.send([null, msgTrigger]);
            }, node.delayTime * 1000);
        });
    }

    RED.nodes.registerType("modbus-ascii-packer", ModbusAsciiPackerNode);
}