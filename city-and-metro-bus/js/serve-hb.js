'use strict';
// 本地服务心跳（v3.21）：每 8 秒告诉 serve.py / server.ps1「页面还开着」。
// 服务端在收到心跳之后才开始计时，标签页关掉 45 秒就自动退出——这样启动游戏不再留下
// 后台进程或最小化的控制台窗口。
// 只在「本机地址」上跑：file:// 打开时跳过；若以后把游戏挂到公网站点，也不会每 8 秒打一次 404。
(function () {
  const host = location.hostname;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') return;
  const beat = function () {
    try { fetch('/__hb', { cache: 'no-store' }).catch(function () {}); } catch (e) {}
  };
  beat();
  setInterval(beat, 8000);
})();
