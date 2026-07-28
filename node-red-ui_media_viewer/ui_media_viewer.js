const fs = require('fs');
const path = require('path');

module.exports = function(RED) {
    let ui = undefined;
    try {
        ui = RED.require("node-red-dashboard")(RED);
    } catch (e) {
        RED.log.warn("ui_media_viewer 需要安裝 node-red-dashboard 才能運作。");
    }

    // 全域共用的 API 路由 (讀取本地媒體檔案)
    RED.httpNode.get('/ui_media_viewer_api', function(req, res) {
        let filePath = req.query.f; 
        
        if (!filePath) {
            return res.status(400).send("No file path specified");
        }

        filePath = filePath.replace(/^["']|["']$/g, '').trim();
        let normalizedPath = path.normalize(filePath);

        if (fs.existsSync(normalizedPath)) {
            res.sendFile(path.resolve(normalizedPath), function(err) {
                if (err && !res.headersSent) {
                    res.status(500).send("Error sending file: " + err.message);
                }
            });
        } else {
            res.status(404).send("File not found: " + normalizedPath);
        }
    });

    function UIMediaViewerNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        if (!ui) return;

        // 使用 AngularJS 原生雙向綁定與指令，徹底擺脫 jQuery DOM 找不到的致命問題
        const htmlTemplate = `
            <div class="ui-media-viewer-container" style="width:100%; height:100%; display:flex; justify-content:center; align-items:center; overflow:hidden;">
                <img ng-if="msg.mediaType === 'image' && msg.fileUrl" ng-src="{{trustedUrl}}" style="{{msg.mediaStyle}}">
                <video ng-if="msg.mediaType === 'video' && msg.fileUrl" ng-src="{{trustedUrl}}" style="{{msg.mediaStyle}}" controls autoplay muted loop></video>
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
                // 處理重設/消失 (Reset)
                if (!msg || msg.payload === "reset" || msg.payload === "clear" || msg.reset === true) {
                    msg = msg || {};
                    msg.fileUrl = "";
                    msg.mediaType = "none";
                    return { msg: msg };
                }

                // 【極致容錯的輸入路徑抓取】
                let filePath = config.filepath;
                
                if (msg.filepath && typeof msg.filepath === 'string' && msg.filepath.trim() !== '') {
                    filePath = msg.filepath;
                } 
                else if (typeof msg.payload === 'string' && msg.payload.trim() !== '' && msg.payload !== 'CLEAR_MEDIA') {
                    filePath = msg.payload;
                }
                else if (msg.payload && typeof msg.payload.filepath === 'string' && msg.payload.filepath.trim() !== '') {
                    filePath = msg.payload.filepath;
                }

                if (filePath) {
                    filePath = filePath.replace(/^["']|["']$/g, '').trim();
                }

                if (!filePath) {
                    node.warn("ui_media_viewer: 未設定檔案路徑或路徑無效");
                    msg.fileUrl = "";
                    msg.mediaType = "none";
                    return { msg: msg };
                }

                let mType = msg.mediaType || config.mediaType || "image"; 
                let dWidth = config.displayWidth || "100%";

                // 自動偵測副檔名
                let ext = filePath.split('.').pop().toLowerCase();
                if (['mp4', 'webm', 'mov', 'ogg'].includes(ext)) {
                    mType = "video";
                } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) {
                    mType = "image";
                }

                let rootPath = RED.settings.httpNodeRoot || '/';
                if (!rootPath.endsWith('/')) rootPath += '/';

                let ts = Date.now();
                msg.fileUrl = rootPath + `ui_media_viewer_api?ts=${ts}&f=${encodeURIComponent(filePath)}`;
                msg.mediaType = mType;

                let mediaStyle = `max-width:100%; max-height:100%; object-fit:contain;`;
                if (dWidth && dWidth !== "100%") {
                    mediaStyle += ` width:${dWidth};`;
                } else {
                    mediaStyle += ` width:100%;`; 
                }
                msg.mediaStyle = mediaStyle;

                return { msg: msg };      
            },
            
            initController: function($scope, events) {
                $scope.$watch('msg', function(msg) {
                    if (!msg || !msg.fileUrl) {
                        $scope.trustedUrl = "";
                        return;
                    }
                    // 解除 AngularJS 對動態 Resource URL 的安全限制阻擋
                    if ($scope.$sce) {
                        $scope.trustedUrl = $scope.$sce.trustAsResourceUrl(msg.fileUrl);
                    } else {
                        $scope.trustedUrl = msg.fileUrl;
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