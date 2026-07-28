const fs = require('fs');
const path = require('path');

module.exports = function(RED) {
    let ui = undefined;
    try {
        ui = RED.require("node-red-dashboard")(RED);
    } catch (e) {
        RED.log.warn("ui_media_viewer 需要安裝 node-red-dashboard 才能運作。");
    }

    // 全域共用的 API 路由
    RED.httpNode.get('/ui_media_viewer_api', function(req, res) {
        let filePath = req.query.f; 
        
        if (filePath) {
            filePath = filePath.replace(/^["']|["']$/g, '').trim();
        }

        if (filePath && fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).send("File not found");
        }
    });

    function UIMediaViewerNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        if (!ui) return;

        const htmlTemplate = `
            <div id="media-container-{{$id}}" style="width:100%; height:100%; display:flex; justify-content:center; align-items:center; overflow:hidden;">
            </div>
        `;

        const done = ui.addWidget({
            node: node,
            group: config.group,
            width: config.width,
            height: config.height,
            format: htmlTemplate,
            templateScope: "local",
            order: config.order,
            emitOnlyNewValues: false,
            forwardInputMessages: false,
            storeFrontEndInputAsState: false,
            
            beforeEmit: function(msg, value) {
                // 處理消失(Reset)
                if (msg.payload === "reset" || msg.payload === "clear" || msg.reset === true) {
                    msg.payload = "CLEAR_MEDIA";
                    return { msg: msg };
                }

                // 【極致容錯的輸入判斷】
                let filePath = config.filepath;
                
                if (msg.filepath && typeof msg.filepath === 'string' && msg.filepath.trim() !== '') {
                    filePath = msg.filepath;
                } 
                else if (typeof msg.payload === 'string' && msg.payload.trim() !== '' && msg.payload !== 'CLEAR_MEDIA') {
                    filePath = msg.payload;
                }
                // 新增：如果使用者傳遞了 JSON 物件 msg.payload.filepath 也能抓到
                else if (msg.payload && typeof msg.payload.filepath === 'string' && msg.payload.filepath.trim() !== '') {
                    filePath = msg.payload.filepath;
                }

                // 清除路徑頭尾引號與多餘的空白換行
                if (filePath) {
                    filePath = filePath.replace(/^["']|["']$/g, '').trim();
                }

                let mType = msg.mediaType || config.mediaType || "image"; 
                let dWidth = config.displayWidth || "100%";

                if (!filePath) {
                    node.error("未設定檔案路徑或路徑無效", msg);
                    msg.payload = "CLEAR_MEDIA";
                    return { msg: msg };
                }

                // 自動偵測副檔名
                let ext = filePath.split('.').pop().toLowerCase();
                if (['mp4', 'webm', 'mov'].includes(ext)) {
                    mType = "video";
                } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) {
                    mType = "image";
                }

                let ts = new Date().getTime();
                let fileUrl = `/ui_media_viewer_api?ts=${ts}&f=${encodeURIComponent(filePath)}`;

                let mediaStyle = `max-width:100%; max-height:100%; object-fit:contain;`;
                if (dWidth && dWidth !== "100%") {
                    mediaStyle += ` width:${dWidth};`;
                } else {
                    mediaStyle += ` width:100%;`; 
                }

                let renderHtml = "";
                if (mType === "video") {
                    renderHtml = `<video src="${fileUrl}" style="${mediaStyle}" controls autoplay muted loop type="video/mp4"></video>`;
                } else {
                    renderHtml = `<img src="${fileUrl}" style="${mediaStyle}">`;
                }

                msg.payload = renderHtml; 
                return { msg: msg };      
            },
            
            initController: function($scope, events) {
                $scope.$watch('msg', function(msg) {
                    if (!msg) return;
                    
                    var container = $('#media-container-' + $scope.$id);
                    if (msg.payload === "CLEAR_MEDIA") {
                        container.html(''); 
                    } else if (msg.payload) {
                        container.html(msg.payload); 
                    }
                });
            }
        });

        node.on("close", function() {
            if (done) {
                done();
            }
        });
    }

    RED.nodes.registerType("ui_media_viewer", UIMediaViewerNode);
};