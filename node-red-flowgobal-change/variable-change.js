module.exports = function(RED) {
    function VariableChangeNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        
        node.mode = config.mode || "realtime";
        node.initData = config.initData || "[]";

        node.on('input', function(msg) {
            if (node.mode === 'init') {
                try {
                    var initVars = JSON.parse(node.initData);
                    initVars.forEach(function(item) {
                        var parsedValue = item.value;
                        if (item.type === "number") parsedValue = Number(item.value);
                        if (item.type === "boolean") parsedValue = (item.value === "true" || item.value === true);
                        if (item.type === "json") {
                            try { parsedValue = JSON.parse(item.value); } catch(e) {}
                        }
                        node.context()[item.scope].set(item.key, parsedValue);
                    });
                } catch(e) {
                    node.error("初始化資料解析錯誤: " + e.message, msg);
                }
            }
            node.send(msg);
        });
    }
    RED.nodes.registerType("variable-change", VariableChangeNode);

    RED.httpAdmin.get("/variable-change/all", RED.auth.needsPermission('settings.read'), function(req, res) {
        var nodeId = req.query.nodeId;
        var targetNode = RED.nodes.getNode(nodeId);
        
        if (!targetNode) return res.status(404).send("請先部署節點以啟用自動讀取功能。");

        try {
            var flowCtx = targetNode.context().flow;
            var globalCtx = targetNode.context().global;

            var flowVars = (flowCtx.keys() || []).map(k => ({ scope: 'flow', key: k, value: flowCtx.get(k), type: typeof flowCtx.get(k) }));
            var globalVars = (globalCtx.keys() || []).map(k => ({ scope: 'global', key: k, value: globalCtx.get(k), type: typeof globalCtx.get(k) }));

            res.json({ flow: flowVars, global: globalVars });
        } catch(err) {
            res.status(500).send(err.toString());
        }
    });

    RED.httpAdmin.post("/variable-change/save", RED.auth.needsPermission('settings.write'), function(req, res) {
        var nodeId = req.body.nodeId;
        var scope = req.body.scope;       
        var oldKey = req.body.oldKey;     
        var newKey = req.body.key;        
        var value = req.body.value;
        var type = req.body.type;         

        var targetNode = RED.nodes.getNode(nodeId);
        if (!targetNode) return res.status(404).send("找不到節點實例。");

        var parsedValue = value;
        if (type === "number") parsedValue = Number(value);
        if (type === "boolean") parsedValue = (value === "true" || value === true);
        if (type === "json") {
            // 前端已經轉換為標準格式，這裡直接 parse 即可
            try { parsedValue = JSON.parse(value); } catch(e) { return res.status(400).send("JSON 格式錯誤"); }
        }

        try {
            var ctx = targetNode.context()[scope];
            if (oldKey && oldKey !== newKey) ctx.set(oldKey, undefined); 
            ctx.set(newKey, parsedValue);
            res.sendStatus(200);
        } catch(err) {
            res.status(500).send(err.toString());
        }
    });

    RED.httpAdmin.post("/variable-change/delete", RED.auth.needsPermission('settings.write'), function(req, res) {
        var nodeId = req.body.nodeId;
        var scope = req.body.scope;
        var key = req.body.key;

        var targetNode = RED.nodes.getNode(nodeId);
        if (targetNode) {
            targetNode.context()[scope].set(key, undefined);
            res.sendStatus(200);
        } else {
            res.status(404).send("找不到節點");
        }
    });
};