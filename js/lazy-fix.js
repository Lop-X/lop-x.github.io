/* 追番页封面懒加载修复
 *
 * 现象：/garden/anime/ 顶部的番剧卡片封面全部空白。
 * 原因：生成该页的插件把真实图片地址写在 img[data-lazy-src]，
 *       而 src 被置为 1×1 的 base64 占位 gif；主题的 lazyload
 *       只认自己的 data-src 约定，不会替换这个属性，于是封面永远停在占位图。
 * 处理：显式把 data-lazy-src 补回 src。pjax 切页后重跑一次。
 */
(function () {
  function fix() {
    var imgs = document.querySelectorAll('img[data-lazy-src]');
    for (var i = 0; i < imgs.length; i++) {
      var real = imgs[i].getAttribute('data-lazy-src');
      if (real && imgs[i].getAttribute('src') !== real) {
        imgs[i].setAttribute('src', real);
      }
    }
  }

  fix();
  window.addEventListener('load', fix);
  document.addEventListener('pjax:complete', fix);
  document.addEventListener('DOMContentLoaded', fix);
  setTimeout(fix, 1200);
})();
