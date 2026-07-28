module.exports = function (RED) {
    function JoeUltrasonicParserNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        node.parseMode = config.parseMode || "auto";

        node.on('input', function (msg) {
            try {
                let isMqttFormat = msg.payload && typeof msg.payload === 'object' && Array.isArray(msg.payload.in_data_cha) && msg.payload.in_data_cha.length === 2;
                
                let modeToUse = node.parseMode;
                if (modeToUse === "auto") {
                    modeToUse = isMqttFormat ? "mqtt" : "modbus";
                }

                if (modeToUse === "mqtt") {
                    if (isMqttFormat) {
                        let highByte = msg.payload.in_data_cha[0];
                        let lowByte = msg.payload.in_data_cha[1];
                        let rawValue = (highByte * 256) + lowByte;
                        let realValue_mm = Number((rawValue / 4.0).toFixed(1));
                        
                        msg.payload = {
                            raw: rawValue,
                            distance: realValue_mm
                        };
                        node.send(msg);
                    } else {
                        node.warn("MQTT 模式下輸入資料格式不符 (缺少 in_data_cha [byte, byte])");
                    }
                } else {
                    // Modbus 模式
                    let inputVal = msg.payload;
                    if (Array.isArray(inputVal) || ArrayBuffer.isView(inputVal)) {
                        inputVal = inputVal[0];
                    }

                    let rawData = parseInt(inputVal);
                    if (isNaN(rawData)) {
                        node.warn("Modbus 模式下 msg.payload 不是有效的數字");
                        node.send(msg);
                        return;
                    }

                    let uint16Data = (rawData >>> 0) & 0xFFFF;
                    let realDistance = uint16Data / 1024.0;
                    let distance = Number(realDistance.toFixed(1));

                    msg.payload = {
                        "raw": rawData,
                        "distance": distance
                    };
                    node.send(msg);
                }
            } catch (err) {
                node.error("解析超聲波資料時發生錯誤: " + err.message, msg);
            }
        });
    }

    RED.nodes.registerType("joe-ultrasonic-parser", JoeUltrasonicParserNode);
};
