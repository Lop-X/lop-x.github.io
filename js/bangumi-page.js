/**
 * 追番页（/garden/anime/）：标签切换 + 分页
 *
 * 为什么自己写：
 *   hexo-bilibili-bangumi 自带的 index.js / pagination.js 有两个硬伤——
 *   1) 每页条数写死 10（`Math.ceil(n.length/10)`、`Math.floor(t/10)`），
 *      「已看」307 条要翻 31 页；想改只能 patch node_modules。
 *   2) 插件的 after_render:html 会把 <style>/<script> 复制到 <head>，
 *      但**不从 body 删除**，于是两份脚本 + 两份 7KB CSS 同时下发。
 *   现在由 scripts/filters/bangumi-page.js 在构建时把插件脚本整段剥掉，
 *   这里接管全部交互；DOM 结构沿用插件模板（.bangumi-tabs / #bangumi-itemN）。
 *
 * 设计要点：
 *   - 所有条目本来就在 HTML 里（_config.yml 的 bangumi.pagination: false
 *     让 pug 渲染全量），所以分页只是加/减 `.bangumi-hide`，不发请求。
 *   - 每组独立记页码；切 tab 回到第 1 页。
 *   - 只有 1 页的分组把分页条整体隐藏（原插件会显示「首页/上一页/1 / 1/…」）。
 *   - 幂等：同一个 DOM 只初始化一次；pjax 换页后 DOM 是新的，会重新初始化。
 */
(function () {
  'use strict';

  // 25 = 五列 × 5 整行（见 custom-lopos-16-bangumi-overrides.css §47.1）。
  // 换列数必须同步改这里，否则最后一页会剩半行。
  var PER_PAGE = 25;
  var TOP_OFFSET = 96; // 固定导航栏 + 一点呼吸位

  function toArray(list) {
    return Array.prototype.slice.call(list);
  }

  function init() {
    var root = document.querySelector('.bangumi-container');
    if (!root || root.getAttribute('data-lopx-ready') === '1') return;

    var tabs = toArray(root.querySelectorAll('.bangumi-tab'));
    var panes = toArray(root.querySelectorAll('[id^="bangumi-item"]'));
    if (tabs.length !== panes.length || !panes.length) return;

    root.setAttribute('data-lopx-ready', '1');

    var lists = panes.map(function (pane) {
      return toArray(pane.children).filter(function (el) {
        return el.classList.contains('bangumi-item');
      });
    });
    var pageAt = panes.map(function () {
      return 0;
    });
    var current = 0;

    function paint(idx, page) {
      var items = lists[idx];
      var total = Math.max(1, Math.ceil(items.length / PER_PAGE));
      page = Math.max(0, Math.min(page, total - 1));
      pageAt[idx] = page;

      for (var i = 0; i < items.length; i++) {
        var visible = Math.floor(i / PER_PAGE) === page;
        if (visible) items[i].classList.remove('bangumi-hide');
        else items[i].classList.add('bangumi-hide');
      }

      var bar = panes[idx].querySelector('.bangumi-pagination');
      if (!bar) return;
      // 单页分组：整条隐藏，别让「1 / 1」占位
      if (total <= 1) bar.classList.add('bangumi-hide');
      else bar.classList.remove('bangumi-hide');
      var num = bar.querySelector('.bangumi-pagenum');
      if (num) num.textContent = page + 1 + ' / ' + total;
    }

    function activate(idx, page) {
      if (idx < 0 || idx >= panes.length) return;
      current = idx;
      tabs.forEach(function (tab, i) {
        if (i === idx) tab.classList.add('bangumi-active');
        else tab.classList.remove('bangumi-active');
      });
      panes.forEach(function (pane, i) {
        if (i === idx) {
          pane.classList.add('bangumi-show');
          pane.classList.remove('bangumi-hide');
        } else {
          pane.classList.remove('bangumi-show');
          pane.classList.add('bangumi-hide');
        }
      });
      paint(idx, page === undefined ? pageAt[idx] : page);
    }

    function backToTop() {
      var y = root.getBoundingClientRect().top + window.pageYOffset - TOP_OFFSET;
      window.scrollTo(0, y > 0 ? y : 0);
    }

    tabs.forEach(function (tab, i) {
      tab.onclick = null; // 清掉可能残留的插件 handler
      tab.addEventListener('click', function (event) {
        event.preventDefault();
        if (i === current) return;
        activate(i, 0);
        // 深翻之后切 tab，新分组更短会被浏览器夹到奇怪的滚动位置，
        // 统一回到列表顶部（已在顶部时是无操作）。
        backToTop();
      });
    });

    panes.forEach(function (pane, idx) {
      var bar = pane.querySelector('.bangumi-pagination');
      if (!bar) return;
      var go = function (page) {
        paint(idx, page);
        backToTop();
      };
      [
        ['bangumi-firstpage', function () { go(0); }],
        ['bangumi-previouspage', function () { go(pageAt[idx] - 1); }],
        ['bangumi-nextpage', function () { go(pageAt[idx] + 1); }],
        ['bangumi-lastpage', function () { go(Infinity); }]
      ].forEach(function (pair) {
        var btn = bar.querySelector('.' + pair[0]);
        if (!btn) return;
        btn.onclick = null;
        btn.addEventListener('click', function (event) {
          event.preventDefault();
          pair[1]();
        });
      });
    });

    // 初始标签由模板下发（= _config.yml 的 bangumi.show，0 起算）
    var host = root.closest('[data-bangumi-show]');
    var start = host ? parseInt(host.getAttribute('data-bangumi-show'), 10) : 0;
    if (isNaN(start) || start < 0 || start >= panes.length) start = 0;
    // 先把三组都画一遍：模板里的「2 / 3」是写死的占位文案，
    // 只画当前组的话，切到别的 tab 前那组的分页条还是错的。
    panes.forEach(function (_, i) {
      paint(i, 0);
    });
    activate(start, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
