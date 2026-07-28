const assert = require('assert');

console.log("=== 開始執行 Joe-Tools 模組單元測試 ===");

function runTestHelper(modulePath, config, inputMsg) {
    let sentMsg = null;
    let warnMsg = null;
    let errorMsg = null;

    let mockNodeInstance = {};
    let inputCallback = null;

    const mockRED = {
        nodes: {
            createNode: function (node, cfg) {
                node.on = (evt, fn) => { if (evt === 'input') inputCallback = fn; };
                node.send = (m) => { sentMsg = m; };
                node.warn = (w) => { warnMsg = w; };
                node.error = (e) => { errorMsg = e; };
            },
            registerType: function (typeName, ctor) {
                mockNodeInstance = new ctor(config);
            }
        }
    };

    const mod = require(modulePath);
    mod(mockRED);

    if (inputCallback) {
        inputCallback(inputMsg);
    }

    return { sentMsg, warnMsg, errorMsg };
}

// 測試 1: RFID
console.log("\n[1/4] 測試 RFID 解析器 (joe-rfid-decoder)...");
{
    const testPayload = [0x12, 0x34, 0x56, 0x78, 0x90, 0xAB, 0xCD, 0xEF, 0x11, 0x22, 0x33, 0x44, 0x55];
    const res = runTestHelper('./joe-rfid-decoder/joe-rfid-decoder.js', { sliceCount: 12, paddingDigits: 2 }, { payload: testPayload });
    assert.strictEqual(res.sentMsg.payload, "1234567890ABCDEF11223344");
    console.log("  ✓ RFID 解析正確: 1234567890ABCDEF11223344");
}

// 測試 2: 壓力表 (ISE20B)
console.log("\n[2/4] 測試 壓力表解析器 (joe-pressure-parser)...");
{
    const res = runTestHelper('./joe-pressure-parser/joe-pressure-parser.js', { modelType: "ISE20B" }, { payload: 57374 });
    assert.strictEqual(res.sentMsg.payload.raw_pd, 988);
    assert.strictEqual(res.sentMsg.payload.actual_pressure, -0.003);
    console.log("  ✓ 壓力表 (ISE20B) 解析正確: raw_pd=988, pressure=-0.003");
}

// 測試 3: 流量表
console.log("\n[3/4] 測試 流量表解析器 (joe-flow-parser)...");
{
    const word0 = 0x2800; 
    const word1 = 0x0300; 
    const res = runTestHelper('./joe-flow-parser/joe-flow-parser.js', { scaleFactor: 40 }, { payload: [word0, word1] });
    assert.strictEqual(res.sentMsg.payload.actual_flow, 1);
    assert.strictEqual(res.sentMsg.payload.out1_active, true);
    assert.strictEqual(res.sentMsg.payload.out2_active, true);
    assert.strictEqual(res.sentMsg.payload.hardware_error, false);
    console.log("  ✓ 流量表解析正確: actual_flow=1, out1=true, out2=true, err=false");
}

// 測試 4: 超聲波 (Modbus & MQTT)
console.log("\n[4/4] 測試 超聲波解析器 (joe-ultrasonic-parser)...");
{
    const resModbus = runTestHelper('./joe-ultrasonic-parser/joe-ultrasonic-parser.js', { parseMode: "modbus" }, { payload: 56704 });
    assert.strictEqual(resModbus.sentMsg.payload.distance, 55.4);
    console.log("  ✓ 超聲波 Modbus 模式解析正確: distance=55.4");

    const resMqtt = runTestHelper('./joe-ultrasonic-parser/joe-ultrasonic-parser.js', { parseMode: "mqtt" }, { payload: { in_data_cha: [0, 221] } });
    assert.strictEqual(resMqtt.sentMsg.payload.distance, 55.3);
    console.log("  ✓ 超聲波 MQTT 模式解析正確: distance=55.3");
}

console.log("\n🎉 所有 4 個 Joe-Tools 節點測試皆通過！\n");
