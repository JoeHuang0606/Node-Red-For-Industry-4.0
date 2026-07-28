module.exports = function(RED) {
    function RFIDLazyNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        // 讀取 UI 設定值
        node.mode = config.mode;
        node.writeStrategy = config.writeStrategy || "manual"; 
        node.offset = parseInt(config.offset) || 0;
        node.length = parseInt(config.length) || 4;
        node.writeDataConfig = config.writeData || "";
        node.writeDataType = config.writeDataType || "str";
        node.readTriggerMode = config.readTriggerMode || "manual";
        node.autoReadInterval = parseInt(config.autoReadInterval) || 1000;
        
        node.enableDeparture = (config.enableDeparture === "true" || config.enableDeparture === true);
        node.departureTimeout = (parseFloat(config.departureTimeout) || 3) * 1000; 
        
        // 內部狀態變數
        node.rfidState = "IDLE";
        node.readTime = 0;
        node.targetTag = [];
        node.writeRawdata = [];
        node.currentWriteText = ""; 
        node.autoTimer = null; 
        
        // WRITE/CLEAR 專用分批處理變數
        node.currentProcessOffset = 0;
        node.processEndOffset = 0;
        node.currentChunkLength = 0;

        node.lastSeenTag = false;
        node.departureTimer = null;
        node.watchdogTimer = null;
        node.hardwareDelayTimer = null; 
        node.manualRetryTimer = null; // 【新增】：手動排隊計時器

        // ==========================================
        // 【核心 1】全域互斥鎖 (Global Mutex Lock)
        // 確保整個 Node-RED 同一時間只有一個節點能存取硬體
        // ==========================================
        function acquireLock() {
            let lock = node.context().global.get("rfid_hardware_lock");
            if (!lock) {
                node.context().global.set("rfid_hardware_lock", node.id);
                return true;
            }
            return lock === node.id;
        }

        function releaseLock() {
            let lock = node.context().global.get("rfid_hardware_lock");
            if (lock === node.id) {
                node.context().global.set("rfid_hardware_lock", null);
            }
        }

        function clearAllTimers() {
            if (node.watchdogTimer) clearTimeout(node.watchdogTimer);
            if (node.hardwareDelayTimer) clearTimeout(node.hardwareDelayTimer);
            node.watchdogTimer = null;
            node.hardwareDelayTimer = null;
        }

        function resetWatchdog() {
            clearAllTimers();
            node.watchdogTimer = setTimeout(() => {
                if (node.rfidState !== "IDLE") {
                    if (node.rfidState !== "CHECK_TAG") {
                        node.warn("看門狗警報：Modbus 掉線或無回應，強制解除忙碌並釋放總線鎖！");
                        if (!(node.mode === "READ" && node.readTriggerMode === "auto")) {
                            node.send([null, null, { payload: "錯誤: 底層通訊掉線，已自動重置", timeout: true }]);
                        }
                    }
                    node.rfidState = "IDLE";
                    releaseLock(); // 確保逾時也能解鎖
                }
            }, 6000); 
        }

        function startCheckTag() {
            if (node.rfidState !== "IDLE") return; 
            node.rfidState = "CHECK_TAG";
            node.readTime = Date.now();
            node.send([{ payload: { fc: 3, unitid: 1, address: 0x00ff, quantity: 13 } }, null, null]);
            resetWatchdog(); 
        }

        // ==========================================
        // 【核心 2】自動讀取靜音迴避機制
        // ==========================================
        if (node.mode === "READ" && node.readTriggerMode === "auto") {
            node.autoTimer = setInterval(() => {
                if (node.rfidState === "IDLE") {
                    if (acquireLock()) { // 拿不到鎖就默默放棄，絕不干擾寫入！
                        prepareAndStartProcess(null);
                    }
                }
            }, node.autoReadInterval);
        }

        node.on('close', function() {
            if (node.autoTimer) clearInterval(node.autoTimer);
            if (node.departureTimer) clearTimeout(node.departureTimer);
            if (node.manualRetryTimer) clearTimeout(node.manualRetryTimer);
            clearAllTimers();
            releaseLock(); 
        });

        // 整理前置準備邏輯
        function prepareAndStartProcess(msg) {
            if (node.mode === "WRITE") {
                let val = "";
                if (msg && node.writeDataType === "msg") val = RED.util.getMessageProperty(msg, node.writeDataConfig);
                else if (node.writeDataType === "flow") val = node.context().flow.get(node.writeDataConfig);
                else if (node.writeDataType === "global") val = node.context().global.get(node.writeDataConfig);
                else val = node.writeDataConfig;
                
                // 【終極字串淨化器】：杜絕 undefined 幽靈字串
                if (val === undefined || val === null) val = "";
                else if (typeof val === "object") { try { val = JSON.stringify(val); } catch(e) { val = String(val); } }
                else val = String(val);
                val = val.replace(/undefined/g, ""); // 清除上一站傳來的空變數殘留

                node.currentWriteText = val;
                
                if (node.writeStrategy === "auto") {
                    let requiredWords = Math.ceil(node.currentWriteText.length / 2);
                    node.length = requiredWords === 0 ? 1 : requiredWords; 
                }

                if (node.length > 64) node.length = 64; 
                
                if (node.currentWriteText.length > node.length * 2) {
                    node.currentWriteText = node.currentWriteText.substring(0, node.length * 2);
                    node.warn("輸入字串過長，已自動截斷");
                }

                let value = [];
                let chars = node.currentWriteText.split(""); 
                for (let i = 0; i < node.length * 2; i += 2) {
                    let high = (chars[i] || ' ').charCodeAt(0);
                    let low = (chars[i+1] || ' ').charCodeAt(0);
                    value.push((high << 8) | low);
                }
                node.writeRawdata = value;
                node.currentProcessOffset = node.offset;
                node.processEndOffset = node.offset + node.length;
                node.currentChunkLength = Math.min(8, node.processEndOffset - node.currentProcessOffset);

            } else if (node.mode === "READ") {
                if (node.length > 16) {
                    node.length = 16; 
                }
            } else if (node.mode === "CLEAR") {
                if (node.length > 64) node.length = 64; 
                node.currentProcessOffset = node.offset;
                node.processEndOffset = node.offset + node.length;
                node.currentChunkLength = Math.min(8, node.processEndOffset - node.currentProcessOffset);
            }
            startCheckTag();
        }

        node.on('input', function(msg, send, done) {
            send = send || function() { node.send.apply(node, arguments) };

            if (msg.payload === "reset") {
                node.rfidState = "IDLE";
                node.lastSeenTag = false;
                if (node.departureTimer) { clearTimeout(node.departureTimer); node.departureTimer = null; }
                if (node.manualRetryTimer) { clearTimeout(node.manualRetryTimer); node.manualRetryTimer = null; }
                clearAllTimers();
                if (node.context().global.get("rfid_hardware_lock") === node.id) releaseLock();
                send([null, null, { payload: "系統已強制重置並釋放總線鎖" }]);
                if (done) done(); return;
            }

            // ==========================================
            // 【核心 3】嚴格路由：區分 Modbus 回傳 vs 手動 Inject
            // ==========================================
            let isModbusMsg = Array.isArray(msg.payload) || 
                              (msg.payload !== null && typeof msg.payload === 'object' && 
                              !Array.isArray(msg.payload) && 
                              ('fc' in msg.payload || 'unitid' in msg.payload || 'value' in msg.payload || 'data' in msg.payload));

            if (isModbusMsg) {
                // 如果是 Modbus 廣播，但我沒拿鎖，或者是多餘的雜訊，直接無情丟棄！
                let lock = node.context().global.get("rfid_hardware_lock");
                if (lock !== node.id || node.rfidState === "IDLE") {
                    if (done) done(); return; 
                }

                // --- 以下為拿著鎖的節點，專心處理狀態機 ---
                clearAllTimers(); 
                let data = msg.payload;

                if (node.rfidState === "CHECK_TAG") {
                    if (data[0] > 0) { 
                        node.lastSeenTag = true;
                        if (node.departureTimer) {
                            clearTimeout(node.departureTimer);
                            node.departureTimer = null;
                        }
                        node.targetTag = data.slice(1, 13);
                        node.rfidState = "SET_INDEX";

                        if (node.mode === "WRITE" || node.mode === "CLEAR") {
                            send([null, { payload: { value: [node.currentProcessOffset, node.currentChunkLength], fc: 16, unitid: 1, address: 0x0212, quantity: 2 } }, null]);
                        } else { 
                            send([null, { payload: { value: [node.offset, node.length], fc: 16, unitid: 1, address: 0x0212, quantity: 2 } }, null]);
                        }
                        resetWatchdog();

                    } else { 
                        node.rfidState = "IDLE";
                        releaseLock(); // 沒掃到 Tag，提早釋放總線讓別人用
                        
                        if (node.enableDeparture && node.lastSeenTag && !node.departureTimer) {
                            node.departureTimer = setTimeout(() => {
                                let warnMsg = { payload: "提醒: Tag 已移開", event: "tag_departed", timeout_seconds: (node.departureTimeout / 1000) };
                                node.send([null, null, warnMsg]); 
                                node.lastSeenTag = false;         
                                node.departureTimer = null;
                            }, node.departureTimeout);
                        }
                        if (!(node.mode === "READ" && node.readTriggerMode === "auto")) {
                            send([null, null, { payload: "錯誤: 範圍內無 Tag", error: true }]);
                        }
                    }
                }
                else if (node.rfidState === "SET_INDEX") {
                    node.rfidState = "START_CMD";
                    node.hardwareDelayTimer = setTimeout(() => {
                        if (node.mode === "WRITE") {
                            let chunkStart = node.currentProcessOffset - node.offset;
                            let chunkData = node.writeRawdata.slice(chunkStart, chunkStart + node.currentChunkLength);
                            let writePayload = [1].concat(chunkData); 
                            send([null, { payload: { value: writePayload, fc: 16, unitid: 1, address: 0x0400, quantity: writePayload.length } }, null]);
                        } else if (node.mode === "CLEAR") {
                            let writePayload = [1];
                            for (let i = 0; i < node.currentChunkLength; i++) writePayload.push(0);
                            send([null, { payload: { value: writePayload, fc: 16, unitid: 1, address: 0x0400, quantity: writePayload.length } }, null]);
                        } else { 
                            send([null, { payload: { value: [1], fc: 16, unitid: 1, address: 0x0300, quantity: 1 } }, null]);
                        }
                        resetWatchdog();
                    }, 100); 
                }
                else if (node.rfidState === "START_CMD") {
                    node.rfidState = "POLLING";
                    node.readTime = Date.now();
                    node.hardwareDelayTimer = setTimeout(() => {
                        let addr = (node.mode === "READ") ? 0x0300 : 0x0400;
                        let qty = (node.mode === "READ") ? (node.length + 1) : 1; 
                        send([{ payload: { fc: 3, unitid: 1, address: addr, quantity: qty } }, null, null]);
                        resetWatchdog();
                    }, 150);
                }
                else if (node.rfidState === "POLLING") {
                    if (data[0] === 1) { 
                        if (Date.now() - node.readTime < 5000) {
                            node.hardwareDelayTimer = setTimeout(() => {
                                let addr = (node.mode === "READ") ? 0x0300 : 0x0400;
                                let qty = (node.mode === "READ") ? (node.length + 1) : 1;
                                send([{ payload: { fc: 3, unitid: 1, address: addr, quantity: qty } }, null, null]);
                                resetWatchdog();
                            }, 150);
                        } else {
                            node.rfidState = "IDLE";
                            releaseLock(); 
                            let addr = (node.mode === "READ") ? 0x0300 : 0x0400;
                            let resetMsg = { payload: { value: [0], fc: 16, unitid: 1, address: addr, quantity: 1 } };
                            if (node.mode === "READ" && node.readTriggerMode === "auto") {
                                send([null, resetMsg, null]); 
                            } else {
                                send([null, resetMsg, { payload: "錯誤: 執行逾時", timeout: true }]);
                            }
                        }
                    } else if (data[0] === 0) { 
                        
                        if (node.mode === "WRITE" || node.mode === "CLEAR") {
                            node.currentProcessOffset += node.currentChunkLength; 
                            if (node.currentProcessOffset < node.processEndOffset) {
                                node.rfidState = "SET_INDEX";
                                node.currentChunkLength = Math.min(8, node.processEndOffset - node.currentProcessOffset);
                                
                                node.hardwareDelayTimer = setTimeout(() => {
                                    send([null, { payload: { value: [node.currentProcessOffset, node.currentChunkLength], fc: 16, unitid: 1, address: 0x0212, quantity: 2 } }, null]);
                                    resetWatchdog();
                                }, 100);
                                if (done) done();
                                return; 
                            }
                        }

                        // ==== 全部處理完成，打包最終輸出 ====
                        node.rfidState = "IDLE";
                        releaseLock(); // 完美收工，釋放總線鎖！

                        let hexString = node.targetTag.map(b => ("0" + b.toString(16)).slice(-2).toUpperCase()).join("");
                        let outbuf = { tagID: hexString, mode: node.mode, offset: node.offset, length: node.length, userData: "" };

                        if (node.mode === "READ") {
                            let asciiString = "";
                            for (let i = 0; i < node.length; i++) {
                                let val = data[i+1];
                                if (val !== undefined) {
                                    let hiByte = (val >> 8) & 0xFF;
                                    let loByte = val & 0xFF;
                                    if (hiByte !== 0) asciiString += String.fromCharCode(hiByte);
                                    if (loByte !== 0) asciiString += String.fromCharCode(loByte);
                                }
                            }
                            outbuf.userData = asciiString;
                            outbuf.rawData = data.slice(1, node.length + 1);
                        } else if (node.mode === "WRITE") { 
                            outbuf.userData = node.currentWriteText; 
                            outbuf.rawData = node.writeRawdata;
                            if(node.writeStrategy === "auto" && node.length > 8) outbuf.autoBatched = true;
                        } else if (node.mode === "CLEAR") {
                            outbuf.userData = "成功批次清空 " + node.length + " 個 Word";
                            outbuf.rawData = [];
                            if (node.length > 8) outbuf.autoBatched = true;
                        }
                        send([null, null, { payload: outbuf }]);
                    }
                }
            } else {
                // ==========================================
                // 【核心 4】外部手動觸發 (Inject) 的智能排隊系統
                // ==========================================
                if (node.rfidState !== "IDLE" || node.context().global.get("rfid_hardware_lock") === node.id) {
                    node.warn("忽略重複觸發：系統正在處理您上一次的指令。");
                    if (done) done(); return;
                }

                // 嘗試拿鎖，若被自動讀取佔用，就等它 0.2 秒，最多重試 5 次 (1秒)
                function tryManualTrigger(retryCount) {
                    let lock = node.context().global.get("rfid_hardware_lock");
                    if (lock && lock !== node.id) {
                        if (retryCount < 5) {
                            node.manualRetryTimer = setTimeout(() => tryManualTrigger(retryCount + 1), 200);
                        } else {
                            if (!(node.mode === "READ" && node.readTriggerMode === "auto")) {
                                send([null, null, { payload: "錯誤: 總線持續忙碌中，請稍後再試", error: true }]);
                            }
                        }
                        return;
                    }
                    if (acquireLock()) {
                        prepareAndStartProcess(msg);
                    }
                }
                
                tryManualTrigger(0);
            }
            if (done) done();
        });
    }
    RED.nodes.registerType("rfid-lazy", RFIDLazyNode);
}