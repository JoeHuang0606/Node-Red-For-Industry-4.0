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

        // AngularJS 雙向綁定模板：支援動態 msg 與面板預設靜態 filepath
        const htmlTemplate = `
            <div class="ui-media-viewer-container" style="width:100%; height:100%; display:flex; justify-content:center; align-items:center; overflow:hidden;">
                <img ng-if="mediaType === 'image' && trustedUrl" ng-src="{{trustedUrl}}" style="{{mediaStyle}}">
                <video ng-if="mediaType === 'video' && trustedUrl" ng-src="{{trustedUrl}}" style="{{mediaStyle}}" controls autoplay muted loop></video>
                <div ng-if="!trustedUrl" style="color:#aaa; font-size:12px; text-align:center;">未載入媒體 (等待輸入)</div>
            </div>
        `;

        function buildMediaState(filePath, customType, customWidth) {
            if (!filePath) return { trustedUrl: "", mediaType: "none", mediaStyle: "" };

            filePath = filePath.replace(/^["']|["']$/g, '').trim();
            let ext = filePath.split('.').pop().toLowerCase();
            let mType = customType || "image";

            if (['mp4', 'webm', 'mov', 'ogg'].includes(ext)) {
                mType = "video";
            } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) {
                mType = "image";
            }

            let rootPath = (RED.settings && RED.settings.httpNodeRoot) ? RED.settings.httpNodeRoot : '/';
            if (!rootPath.endsWith('/')) rootPath += '/';

            let ts = Date.now();
            let rawUrl = rootPath + `ui_media_viewer_api?ts=${ts}&f=${encodeURIComponent(filePath)}`;

            let dWidth = customWidth || "100%";
            let mediaStyle = `max-width:100%; max-height:100%; object-fit:contain;`;
            if (dWidth && dWidth !== "100%") {
                mediaStyle += ` width:${dWidth};`;
            } else {
                mediaStyle += ` width:100%;`;
            }

            return {
                rawUrl: rawUrl,
                mediaType: mType,
                mediaStyle: mediaStyle
            };
        }

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
                msg = msg || {};
                
                // 處理重設/清空 (Reset)
                if (msg.payload === "reset" || msg.payload === "clear" || msg.reset === true) {
                    msg.fileUrl = "";
                    msg.mediaType = "none";
                    return { msg: msg };
                }

                // 優先權：msg.filepath > msg.payload > config.filepath
                let filePath = config.filepath;
                if (msg.filepath && typeof msg.filepath === 'string' && msg.filepath.trim() !== '') {
                    filePath = msg.filepath;
                } else if (typeof msg.payload === 'string' && msg.payload.trim() !== '' && msg.payload !== 'CLEAR_MEDIA') {
                    filePath = msg.payload;
                } else if (msg.payload && typeof msg.payload.filepath === 'string' && msg.payload.filepath.trim() !== '') {
                    filePath = msg.payload.filepath;
                }

                if (!filePath) {
                    msg.fileUrl = "";
                    msg.mediaType = "none";
                    return { msg: msg };
                }

                let state = buildMediaState(filePath, msg.mediaType || config.mediaType, config.displayWidth);
                msg.fileUrl = state.rawUrl;
                msg.mediaType = state.mediaType;
                msg.mediaStyle = state.mediaStyle;

                return { msg: msg };
            },
            
            initController: function($scope, events) {
                function updateScope(url, type, style) {
                    if (!url) {
                        $scope.trustedUrl = "";
                        $scope.mediaType = "none";
                        return;
                    }
                    if ($scope.$sce) {
                        $scope.trustedUrl = $scope.$sce.trustAsResourceUrl(url);
                    } else {
                        $scope.trustedUrl = url;
                    }
                    $scope.mediaType = type;
                    $scope.mediaStyle = style;
                }

                // 【關鍵修復】：初次開啟 Dashboard 頁面時，若節點面板有填寫 filepath，立即靜態載入顯示圖片/影片
                if ($scope.me && $scope.me.item && $scope.me.item.filepath) {
                    var item = $scope.me.item;
                    var fp = item.filepath.replace(/^["']|["']$/g, '').trim();
                    if (fp) {
                        var ext = fp.split('.').pop().toLowerCase();
                        var mType = item.mediaType || 'image';
                        if (['mp4', 'webm', 'mov', 'ogg'].includes(ext)) mType = 'video';
                        else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) mType = 'image';

                        var rootPath = '/';
                        var url = rootPath + 'ui_media_viewer_api?ts=' + Date.now() + '&f=' + encodeURIComponent(fp);
                        var style = 'max-width:100%; max-height:100%; object-fit:contain; width:' + (item.displayWidth || '100%') + ';';
                        updateScope(url, mType, style);
                    }
                }

                // 監聽動態輸入訊息
                $scope.$watch('msg', function(msg) {
                    if (!msg) return;
                    if (msg.fileUrl) {
                        updateScope(msg.fileUrl, msg.mediaType, msg.mediaStyle);
                    } else if (msg.payload === "CLEAR_MEDIA" || msg.mediaType === "none") {
                        updateScope("", "none", "");
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