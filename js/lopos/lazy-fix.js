/* 追番页封面懒加载
 *
 * 背景：插件把真实图片地址写在 img[data-lazy-src]，src 是 1×1 的 base64 占位 gif，
 *       而主题的 lazyload 只认自己的 data-src 约定，不会处理这个属性。
 * 早期写法是「遍历全部元素、立刻把 src 写回去」—— 当时封面走外链镜像，
 * 反正大部分会失败，看不出代价。现在封面已自托管（220px WebP 约 16KB），
 * 全页 341 张一起加载就是 5.4MB / 205 个请求，必须按视口来。
 *
 * 现在：IntersectionObserver 提前 400px 预载，加载后移除 data-lazy-src 去重；
 *       切 tab（元素从 display:none 变可见）与 pjax 切页都会重新扫描。
 *       不支持 IO 的浏览器退回一次性加载。
 */
(function () {
  var seen = typeof WeakSet === 'function' ? new WeakSet() : null;

  function load(img) {
    var real = img.getAttribute('data-lazy-src');
    if (real && img.getAttribute('src') !== real) {
      img.setAttribute('src', real);
    }
    img.removeAttribute('data-lazy-src');
  }

  var io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            io.unobserve(entries[i].target);
            load(entries[i].target);
          }
        }
      },
      { rootMargin: '400px 0px' }
    );
  }

  function scan(root) {
    var imgs = (root || document).querySelectorAll('img[data-lazy-src]');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (seen) {
        if (seen.has(img)) continue;
        seen.add(img);
      }
      if (io) io.observe(img);
      else load(img);
    }
  }

  scan();
  document.addEventListener('DOMContentLoaded', function () { scan(); });
  document.addEventListener('pjax:complete', function () { scan(); });
  // 切 tab 后元素才变为可见，IO 会重算交集，这里补一次扫描兜底
  setTimeout(function () { scan(); }, 1200);
})();
