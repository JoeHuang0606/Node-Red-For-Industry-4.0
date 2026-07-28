'use strict';

const { isHexAddress, isSymbolicName } = require('../lib/s7plus/tag-routing');
const { formatOutputPayload } = require('../lib/s7plus/read-result');

/**
 * Normalize a tag entry from config or msg.symbols into a consistent shape.
 * Routing priority:
 *   1. Pre-computed symbolCrc + hex address → readTags with CRC (already secured)
 *   2. Symbolic address (no hex) → resolveAndRead
 *   3. Hex address + symbolic name → resolveAndRead (CRC protection for browsed vars)
 *   4. Hex address only → readTags without CRC (legacy)
 */
function normalizeTag(t, i) {
    if (!t) throw new Error(`Symbol #${i} is empty`);
    if (typeof t === 'string') {
        return { name: t, address: t, symbolic: !isHexAddress(t) };
    }
    if (typeof t === 'object') {
        if (t.address) {
            const addrIsHex = isHexAddress(t.address);

            if (addrIsHex && t.symbolCrc) {
                return {
                    name: t.name || t.address,
                    address: t.address,
                    datatype: t.datatype,
                    symbolCrc: t.symbolCrc,
                    symbolic: false
                };
            }

            if (!addrIsHex) {
                return {
                    name: t.name || t.address,
                    address: t.address,
                    datatype: t.datatype,
                    symbolic: true
                };
            }

            if (isSymbolicName(t.name)) {
                return {
                    name: t.name,
                    address: t.name,
                    datatype: t.datatype,
                    symbolic: true
                };
            }

            return {
                name: t.name || t.address,
                address: t.address,
                datatype: t.datatype,
                symbolic: false
            };
        }
        if (t.symbol) {
            return { name: t.name || t.symbol, address: t.symbol, symbolic: true };
        }
    }
    throw new Error(`Symbol #${i} has no address or symbol`);
}

function parseAddSymbols(msg) {
    if (!Array.isArray(msg.addSymbols) || msg.addSymbols.length === 0) {
        return [];
    }
    if (!msg.addSymbols.every(s => typeof s === 'string')) {
        return [];
    }
    return msg.addSymbols;
}

/**
 * Parse a per-message symbol override from msg.symbols.
 * Only a (non-empty) array of strings is accepted; anything else is rejected.
 * Returns undefined when msg.symbols is not set (use configured symbols),
 * or an empty array when it is an empty array (also falls back to configured).
 */
function parseMsgSymbols(msg) {
    if (msg.symbols === undefined || msg.symbols === null) {
        return undefined;
    }
    if (!Array.isArray(msg.symbols)) {
        throw new Error('msg.symbols must be an array of strings');
    }
    if (!msg.symbols.every(s => typeof s === 'string')) {
        throw new Error('msg.symbols must be an array of strings');
    }
    return msg.symbols;
}

module.exports = function (RED) {
function S7ComPlusIn(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.endpoint = RED.nodes.getNode(config.endpoint);
        if (!node.endpoint) {
            node.error('Missing s7-plus endpoint configuration');
            return;
        }

        const configuredSymbols = Array.isArray(config.symbols) ? config.symbols : [];

        let busy = false;
        let lastPayloadString = ""; // 用於 Diff 判斷
        let cycleTimer = null;      // 用於自動讀取

        // 將讀取核心邏輯獨立成一個函數
        const executeRead = async (msg) => {
            // 兼容外部 Inject 或是自動輪詢的 send/done 處理
            const sendFn = msg._send || function () { node.send.apply(node, arguments); };
            const doneFn = msg._done || function (err) { if (err) node.error(err, msg); };

            if (busy) {
                node.status({ fill: 'grey', shape: 'ring', text: 'skipped (busy)' });
                if (msg._done) doneFn(); // 只有外部手動觸發才回報完成
                return;
            }
            busy = true;

            try {
                const addPaths = parseAddSymbols(msg);
                let msgSymbols;
                try {
                    msgSymbols = parseMsgSymbols(msg);
                } catch (e) {
                    doneFn(e);
                    return;
                }

                const source = msgSymbols && msgSymbols.length ? msgSymbols : configuredSymbols;
                let tags = [];
                try {
                    if (source.length) tags = source.map(normalizeTag);
                } catch (e) {
                    doneFn(e);
                    return;
                }

                const configuredSymbolicPaths = tags.filter(t => t.symbolic).map(t => t.address);
                const hexTags = tags.filter(t => !t.symbolic);
                const allSymbolicPaths = [...new Set([...configuredSymbolicPaths, ...addPaths])];

                if (allSymbolicPaths.length === 0 && hexTags.length === 0) {
                    doneFn(new Error('No symbols configured'));
                    return;
                }

                node.status({ fill: 'blue', shape: 'ring', text: 'reading' });
                const t0 = Date.now();

                let result = {};

                // 執行通訊讀取
                if (allSymbolicPaths.length > 0) {
                    const symbolicResult = await node.endpoint.resolveAndRead(allSymbolicPaths);
                    Object.assign(result, symbolicResult);
                }
                if (hexTags.length > 0) {
                    const hexResult = await node.endpoint.readTags(hexTags);
                    Object.assign(result, hexResult);
                }

                const elapsed = Date.now() - t0;
                // 注意：這裡是用 t.name (也就是你的自訂義 Alias) 來當作輸出的 Key
                const outputOrder = [...allSymbolicPaths, ...hexTags.map((t) => t.name)];
                
                // --- 修改：支援單一數值直接輸出 ---
                if (config.outputFormat === 'value') {
                    if (outputOrder.length === 1) {
                        const singleKey = outputOrder[0];
                        // 直接將數值剝離出來賦予 payload
                        msg.payload = result[singleKey] ? result[singleKey].value : null;
                    } else {
                        // 防呆機制：如果有人用外部 inject msg.symbols 強制讀多個點位，自動降級成 object
                        node.warn("Output set to 'Value' but multiple tags requested. Falling back to 'Object' format.");
                        msg.payload = formatOutputPayload(result, outputOrder, 'object');
                    }
                } else {
                    // 原本的 Object 或 Array 輸出模式
                    msg.payload = formatOutputPayload(result, outputOrder, config.outputFormat);
                }
                // ---------------------------------

                // --- 新增：Diff Filter 邏輯 ---
                if (config.diff) {
                    const currentPayloadString = JSON.stringify(msg.payload);
                    if (currentPayloadString === lastPayloadString) {
                        // 數值沒變，直接結束，不輸出 msg
                        busy = false;
                        if (msg._done) doneFn(); 
                        return;
                    }
                    lastPayloadString = currentPayloadString;
                }
                // -----------------------------

                const allTags = Object.values(result);
                const failed = allTags.filter(t => t.status !== 'ok').length;
                if (failed > 0) {
                    node.status({
                        fill: 'yellow',
                        shape: 'dot',
                        text: `read ${allTags.length - failed}/${allTags.length} ok (${elapsed}ms)`
                    });
                } else {
                    node.status({ fill: 'green', shape: 'dot', text: `read ${allTags.length} (${elapsed}ms)` });
                }
                
                sendFn(msg);
                doneFn();

            } catch (e) {
                const elapsed = Date.now() - Date.now(); // 錯誤時的簡化處理
                node.status({ fill: 'red', shape: 'dot', text: `${e.message}` });
                doneFn(e);
            } finally {
                busy = false;
            }
        };

        // 監聽外部 Inject 節點 (手動觸發)
        node.on('input', (msg, send, done) => {
            msg._send = send;
            msg._done = done;
            executeRead(msg);
        });

        // --- 新增：啟動自動讀取定時器 ---
        if (config.readMode === 'auto') {
            let cycleMs = parseInt(config.readCycle, 10) || 1000;
            if (cycleMs < 100) cycleMs = 100; // 最低限制 100ms 保護機制
            cycleTimer = setInterval(() => {
                // 自動觸發不需要傳入 _send 與 _done，因為不用回應前面的 inject
                executeRead({ payload: '' }); 
            }, cycleMs);
        }

        // 節點關閉或重新部署時，清除定時器
        node.on('close', (done) => {
            if (cycleTimer) {
                clearInterval(cycleTimer);
                cycleTimer = null;
            }
            done();
        });
    }

    RED.nodes.registerType('s7-plus read', S7ComPlusIn);
};

module.exports.parseAddSymbols = parseAddSymbols;
module.exports.parseMsgSymbols = parseMsgSymbols;
