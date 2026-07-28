module.exports = function (RED) {
    function JoeRfidDecoderNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        node.sliceCount = parseInt(config.sliceCount);
        if (isNaN(node.sliceCount) || node.sliceCount <= 0) {
            node.sliceCount = 12;
        }

        node.paddingDigits = parseInt(config.paddingDigits);
        if (isNaN(node.paddingDigits) || node.paddingDigits <= 0) {
            node.paddingDigits = 2;
        }

        node.on('input', function (msg) {
            if (msg.payload && (Array.isArray(msg.payload) || ArrayBuffer.isView(msg.payload))) {
                try {
                    let rawArray = Array.from(msg.payload).slice(0, node.sliceCount);
                    msg.payload = rawArray
                        .map(num => (num & 0xffff).toString(16).toUpperCase().padStart(node.paddingDigits, "0"))
                        .join("");
                    node.send(msg);
                } catch (err) {
                    node.error("解析 RFID 資料時發生錯誤: " + err.message, msg);
                }
            } else {
                node.warn("msg.payload 不是有效的陣列或 Buffer 格式");
                node.send(msg);
            }
        });
    }

    RED.nodes.registerType("joe-rfid-decoder", JoeRfidDecoderNode);
};
