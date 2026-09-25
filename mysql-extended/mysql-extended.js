module.exports = function (RED) {

    // === 提供給前端介面抓取 Database Schema 的 API ===
    RED.httpAdmin.get("/mysql-extended/schema/:id", RED.auth.needsPermission('nodes.read'), function(req, res) {
        const configNode = RED.nodes.getNode(req.params.id);
        if (configNode && configNode.pool) {
            const sql = "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE()";
            configNode.pool.query(sql, function(err, rows) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                const tables = new Set();
                const cols = new Set();
                rows.forEach(r => {
                    tables.add(r.TABLE_NAME);
                    cols.add(r.COLUMN_NAME);
                });
                res.json({ 
                    tables: Array.from(tables), 
                    allColumns: Array.from(cols) 
                });
            });
        } else {
            res.status(404).json({ error: "Database not connected or node not deployed yet." });
        }
    });

    function MysqlExtendedNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        config.autoGenerate = (config.autoGenerate !== false && config.autoGenerate !== "false");
        config.action = (config.action || "SELECT").toUpperCase();

        // 綁定資料庫設定
        this.mydb = config.mydb;
        this.mydbConfig = RED.nodes.getNode(this.mydb);
        this.status({});

        if (this.mydbConfig) {
            this.mydbConfig.connect();
            // 監聽連線狀態，同步顯示在節點下方
            this.mydbConfig.on("state", function(info) {
                if (info === "connecting") { node.status({fill:"grey", shape:"ring", text:info}); }
                else if (info === "connected") { node.status({fill:"green", shape:"dot", text:info}); }
                else { node.status({fill:"red", shape:"ring", text:info}); }
            });
        }

        node.on('input', function (msg, send, done) {
            send = send || function() { node.send.apply(node, arguments) };
            try {
                let sqlTemplate = "";
                if (!config.autoGenerate) {
                    sqlTemplate = config.sqlCustom || "";
                } else {
                    switch (config.action) {
                        case "SELECT": sqlTemplate = buildSelectSQL(config, msg, node); break;
                        case "INSERT": sqlTemplate = buildInsertSQL(config, msg, node); break;
                        case "UPDATE": sqlTemplate = buildUpdateSQL(config, msg, node); break;
                        case "DELETE": sqlTemplate = buildDeleteSQL(config, msg, node); break;
                        default: sqlTemplate = "";
                    }
                }
                if (msg.sql && typeof msg.sql === "string" && msg.useRawSql === true) {
                    sqlTemplate = msg.sql;
                }

                sqlTemplate = applyAllTemplates(sqlTemplate, msg, node);
                msg.topic = sqlTemplate;
                msg.sql = sqlTemplate;

                // === 執行查詢的整合邏輯 ===
                if (node.mydbConfig && node.mydbConfig.connected) {
                    node.mydbConfig.pool.getConnection(function (err, conn) {
                        if (err) {
                            if (conn) conn.release();
                            node.status({ fill: "red", shape: "ring", text: "Error: " + err.code });
                            node.error(err, msg);
                            if (done) done();
                            return;
                        }
                        
                        conn.query(sqlTemplate, [], function (err, rows) {
                            conn.release();
                            if (err) {
                                node.status({ fill: "red", shape: "ring", text: "Error: " + err.code });
                                node.error(err, msg);
                            } else {
                                msg.payload = rows;
                                send(msg);
                                node.status({ fill: "green", shape: "dot", text: "OK" });
                            }
                            if (done) done();
                        });
                    });
                } else {
                    node.error("MySQL Database not connected or not configured", msg);
                    node.status({fill:"red", shape:"ring", text:"Not connected"});
                    if (done) done();
                }

            } catch (e) {
                node.error(e && e.message || e, msg);
                msg.payload = { error: (e && e.message) || String(e) };
                send(msg); done && done();
            }
        });

        node.on('close', function() {
            if (node.mydbConfig) {
                node.mydbConfig.removeAllListeners();
            }
            node.status({});
        });
    }

    // ==== 輔助函數區 ====
    function normOp(op) { return op === "==" ? "=" : op; }

    function parseJoins(jsonStr) {
        try {
            const arr = JSON.parse(jsonStr || "[]");
            return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
    }

    function autoAliasFor(table) {
        const t = (table || "").trim(); if (!t) return "";
        if (t === "oc_order") return "oo";
        if (t === "oc_order_product") return "ooc";
        const bare = t.replace(/^oc_/, "");
        const parts = bare.split("_").filter(Boolean);
        if (parts.length === 0) return t[0];
        return parts.map(p => p[0]).join("");
    }

    function qField(aliasOrTable, field) {
        field = (field || "").trim();
        if (!field) return "";
        if (field.includes(".") || /\bas\b/i.test(field) || field.includes("(")) return field;
        if (field === "*") return (aliasOrTable) + ".*";
        return (aliasOrTable) + "." + field;
    }

    function getMsgProp(msg, path) {
        if (!msg || !path) return undefined;
        const parts = String(path).split(".");
        let obj = msg;
        for (let i = 0; i < parts.length; i++) {
            if (obj == null) return undefined;
            obj = obj[parts[i]];
        }
        return obj;
    }

    function applyAllTemplates(str, msg, node) {
        if (!str || typeof str !== "string") return str;
        return str.replace(/\{\{\s*(.*?)\s*\}\}/g, function (_all, path) {
            path = path.trim();
            let type = "msg";
            
            if (path.startsWith("msg.")) { type = "msg"; path = path.substring(4); } 
            else if (path.startsWith("flow.")) { type = "flow"; path = path.substring(5); } 
            else if (path.startsWith("global.")) { type = "global"; path = path.substring(7); } 
            else if (path === "payload") { type = "msg"; path = "payload"; }

            let val;
            if (type === "msg") { val = getMsgProp(msg, path); } 
            else if (type === "flow") { try { val = node.context().flow.get(path); } catch(e){} } 
            else if (type === "global") { try { val = node.context().global.get(path); } catch(e){} }

            if (val === null || val === undefined) return "";
            return String(val);
        });
    }

    function resolveCtxValue(src, nameOrLiteral, msg, node) {
        if (src === "flow") { try { return node.context().flow.get(nameOrLiteral); } catch (e) { return undefined; } }
        if (src === "global") { try { return node.context().global.get(nameOrLiteral); } catch (e) { return undefined; } }
        return nameOrLiteral;
    }

    function sqlValueLiteral(v) {
        if (v === null || v === undefined) return "NULL";
        if (typeof v === "number") return String(v);
        if (typeof v === "boolean") return v ? "1" : "0";
        return "'" + String(v).replace(/'/g, "\\'") + "'";
    }

    function buildWhereFromCfg(cfg, aliasMain, aliasForLastJoin, msg, node) {
        let whereSQL = (cfg.whereManual || "").trim();
        if (whereSQL) return whereSQL;

        const wField = (cfg.whereField || "").trim();
        const wOp = normOp((cfg.whereOp || "").trim());
        const wVal = (cfg.whereValue || "").trim();
        if (wField && wOp && wVal) {
            const qualified = (wField.indexOf(".") !== -1)
                ? wField
                : qField(aliasMain || aliasForLastJoin || "", wField);

            const vsrc = (cfg.whereVSrc || "value");
            let raw = (vsrc && vsrc !== "value") ? resolveCtxValue(vsrc, wVal, msg, node) : wVal;
            let lit;
            if (raw === null || raw === undefined) lit = "NULL";
            else if (typeof raw === "number" || /^-?\d+(?:\.\d+)?$/.test(String(raw))) lit = String(raw);
            else if (typeof raw === "boolean") lit = raw ? "1" : "0";
            else lit = "'" + String(raw).replace(/'/g, "\\'") + "'";
            return qualified + " " + wOp + " " + lit;
        }
        return "";
    }

    function buildOrderByFromCfg(cfg, aliasMain) {
        const raw = (cfg.orderByFields || "").trim();
        if (!raw) return "";
        const dir = ((cfg.orderDir || "ASC").toUpperCase() === "DESC") ? "DESC" : "ASC";
        const list = raw.split(",").map(s => s.trim()).filter(Boolean);
        if (!list.length) return "";
        const parts = list.map(f => (f.indexOf(".") !== -1 || /\bas\b/i.test(f)) ? f : qField(aliasMain, f));
        return " ORDER BY " + parts.join(", ") + " " + dir;
    }

    function buildSelectSQL(cfg, msg, node) {
        const mainTable = (cfg.mainTable || "").trim();
        if (!mainTable) return "";
        const mainAlias = (cfg.mainAlias || autoAliasFor(mainTable));
        const mainFields = (cfg.mainFields || "").split(",").map(s => s.trim()).filter(Boolean);
        const joins = parseJoins(cfg.joinsJSON);

        let selectParts = [];
        if (mainFields.length === 0 && (!joins.length || joins.every(j => !j.fields))) {
            selectParts.push(mainAlias + ".*");
        } else {
            selectParts = selectParts.concat(mainFields.map(f => qField(mainAlias, f)));
            joins.forEach(j => {
                const alias = (j.alias && j.alias.trim()) || autoAliasFor(j.table);
                const fields = (j.fields || "").split(",").map(s => s.trim()).filter(Boolean);
                fields.forEach(f => selectParts.push(qField(alias, f)));
            });
        }

        let fromSQL = `${mainTable} AS ${mainAlias}`;
        let lastJoinAlias = null;
        joins.forEach(j => {
            const jt = (j.table || "").trim();
            if (!jt) return;
            const jtype = (j.type || "JOIN").toUpperCase();
            const key = (j.key || "id").trim();
            const alias = (j.alias && j.alias.trim()) || autoAliasFor(jt);
            fromSQL += ` ${jtype} ${jt} AS ${alias} ON ${mainAlias}.${key} = ${alias}.${key}`;
            lastJoinAlias = alias;
        });

        const whereSQL = buildWhereFromCfg(cfg, mainAlias, lastJoinAlias, msg, node);
        const orderSQL = buildOrderByFromCfg(cfg, mainAlias);
        let sql = "SELECT " + selectParts.join(", ") + " FROM " + fromSQL;
        if (whereSQL) sql += " WHERE " + whereSQL;
        if (orderSQL) sql += orderSQL;
        return sql;
    }

    function buildInsertSQL(cfg, msg, node) {
        const table = (cfg.iTable || "").trim();
        const cols = (cfg.iColumns || "").split(",").map(s => s.trim()).filter(Boolean);
        
        const vals = (cfg.iValues || "").split(",").map(s => {
            let v = s.trim();
            let m = v.match(/^\{\{\s*(.*?)\s*\}\}$/);
            if (m) {
                let path = m[1].trim();
                let type = "msg";
                if (path.startsWith("msg.")) { type = "msg"; path = path.substring(4); }
                else if (path.startsWith("flow.")) { type = "flow"; path = path.substring(5); }
                else if (path.startsWith("global.")) { type = "global"; path = path.substring(7); }
                else if (path === "payload") { type = "msg"; path = "payload"; }
                
                let val;
                if (type === "msg") { val = getMsgProp(msg, path); } 
                else if (type === "flow") { try { val = node.context().flow.get(path); } catch(e){} } 
                else if (type === "global") { try { val = node.context().global.get(path); } catch(e){} }
                return sqlValueLiteral(val);
            }
            return v;
        }).filter(Boolean);

        if (!table || cols.length === 0 || vals.length === 0) return "";
        return "INSERT INTO " + table + " (" + cols.join(", ") + ") VALUES (" + vals.join(", ") + ")";
    }

    function buildUpdateSQL(cfg, msg, node) {
        const table = (cfg.uTable || "").trim();
        const setClause = (cfg.uSet || "").trim();
        if (!table || !setClause) return "";

        const uWhereManual = (cfg.uWhereManual || "").trim();
        let whereSQL = "";

        if (uWhereManual) {
            whereSQL = uWhereManual;
        } else {
            const wf = (cfg.uWhereField || "").trim();
            const wo = normOp((cfg.uWhereOp || "").trim());
            const wv = (cfg.uWhereValue || "").trim();
            const vs = (cfg.uWhereVSrc || "value");

            if (wf && wo && wv) {
                const qualified = (wf.indexOf(".") !== -1) ? wf : (table + "." + wf);
                const __raw = resolveCtxValue(vs, wv, msg, node);
                let __lit;
                if (__raw === null || __raw === undefined) __lit = "NULL";
                else if (typeof __raw === "number" || /^-?\d+(?:\.\d+)?$/.test(String(__raw))) __lit = String(__raw);
                else __lit = sqlValueLiteral(__raw);
                whereSQL = qualified + " " + wo + " " + __lit;
            }
        }

        let sql = "UPDATE " + table + " SET " + setClause;
        if (whereSQL) sql += " WHERE " + whereSQL;
        return sql;
    }

    function buildDeleteSQL(cfg, msg, node) {
        const table = (cfg.dTable || "").trim();
        if (!table) return "";

        const dWhereManual = (cfg.dWhereManual || "").trim();
        let whereSQL = "";

        if (dWhereManual) {
            whereSQL = dWhereManual;
        } else {
            const wf = (cfg.dWhereField || "").trim();
            const wo = normOp((cfg.dWhereOp || "").trim());
            const wv = (cfg.dWhereValue || "").trim();
            const vs = (cfg.dWhereVSrc || "value");

            if (wf && wo && wv) {
                const qualified = (wf.indexOf(".") !== -1) ? wf : (table + "." + wf);
                const __raw = resolveCtxValue(vs, wv, msg, node);
                let __lit;
                if (__raw === null || __raw === undefined) __lit = "NULL";
                else if (typeof __raw === "number" || /^-?\d+(?:\.\d+)?$/.test(String(__raw))) __lit = String(__raw);
                else __lit = sqlValueLiteral(__raw);
                whereSQL = qualified + " " + wo + " " + __lit;
            }
        }

        let sql = "DELETE FROM " + table;
        if (whereSQL) sql += " WHERE " + whereSQL;
        return sql;
    }

    RED.nodes.registerType("mysql-extended", MysqlExtendedNode);
};