/* 追番页封面懒加载
 *
 * 背景：插件把真实图片地址写在 img[data-lazy-src]，src 是 1×1 的 base64 占位 gif，
 *       而主题的 lazyload 只认自己的 data-src 约定，不会处理这个属性。
 * 早期写法是「遍历全部元素、立刻把 src 写回去」—— 当时封面走外链镜像，
 * 反正大部分会失败，看不出代价。现在封面已自托管，全页 346 张一起加载
 * 就是 12.6MB / 346 个请求，必须按视口来。
 *
 * 现在：IntersectionObserver 提前 400px 预载，加载后移除 data-lazy-src 去重；
 *       切 tab、翻页（元素从 display:none 变可见）与 pjax 切页都会重新扫描。
 *
 * 2026-10-30 修：隐藏组被提前加载。
 *   实测首屏请求 20 张 / 766KB，其中 12 张来自 display:none 的「想看」组。
 *   原因有两层：① IIFE 立即执行的首次 scan 早于主题 tab 初始化，那时所有组
 *   还是可见的；② IntersectionObserver 对零尺寸元素（display:none）在
 *   rootMargin 扩展后的根区域内仍会报一次 isIntersecting。
 *   现在 scan 里先做可见性判断，不可见的**不登记 seen**，留到它真正出现时再扫。
 *   注意不能登记：一旦写进 seen，切 tab 后就再也不会被 observe 了。
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

  // display:none 的祖先会让元素没有布局框，getClientRects() 返回空
  function visible(el) {
    return el.getClientRects().length > 0;
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
      if (seen && seen.has(img)) continue;
      // 隐藏组先放过：不 observe、不登记，等它可见时再处理
      if (!visible(img)) continue;
      if (seen) seen.add(img);
      if (io) io.observe(img);
      else load(img);
    }
  }

  function boot() {
    scan();
    // 首帧后再扫一次：主题的 tab 初始化在 DOM 就绪后才写 display
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () {
        scan();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.addEventListener('load', function () {
    scan();
  });
  document.addEventListener('pjax:complete', boot);

  // 切 tab / 翻页后，原本隐藏的组才进入渲染树，补两次扫描（同步 + 等布局稳定）
  document.addEventListener(
    'click',
    function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('.bangumi-tab') || t.closest('.bangumi-pagination')) {
        setTimeout(function () {
          scan();
        }, 0);
        setTimeout(function () {
          scan();
        }, 220);
      }
    },
    true
  );
})();
