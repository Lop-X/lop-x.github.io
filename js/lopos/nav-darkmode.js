/**
 * 导航栏「暗色模式」切换按钮 —— 2026-10-01
 *
 * 背景
 *   右下角浮游菜单 #rightside 已隐藏（见 custom.css 第 22 节），
 *   原本折叠在其中的暗色切换按钮随之不可达，这里在导航栏右侧补一个。
 *
 * 为什么用「转发点击」而不是把按钮搬进导航栏
 *   主题把 rightside 的事件做成委托 —— main.js 在 #rightside 上监听 click，
 *   再按 e.target.id 派发到 rightSideFn[id]（`#darkmode` 对应 rightSideFn.darkmode）。
 *   一旦把 #darkmode 元素移出 #rightside，这条委托就断了。
 *   而 HTMLElement.click() 对 display:none 的元素依然会派发事件并冒泡，
 *   所以「保留 DOM、只隐藏容器、再转发点击」是风险最低的接法，
 *   且能自动继承主题的 localStorage 记忆、Snackbar 提示与 pjax 行为。
 *
 * 事件委托
 *   点击监听挂在 document 上而非按钮自身，这样 pjax 重建 #nav-right 后
 *   不需要重新绑定；按钮本身在 pjax:complete 后重建即可。
 */
(function () {
  var BTN_ID = 'lopx-darkmode';
  var ICON = 'anzhiyu-icon-circle-half-stroke';

  function isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  function label() {
    return isDark() ? '切换到浅色模式' : '切换到深色模式';
  }

  function paint(btn) {
    if (!btn) return;
    var text = label();
    btn.setAttribute('title', text);
    btn.setAttribute('aria-label', text);
    btn.setAttribute('aria-pressed', isDark() ? 'true' : 'false');
  }

  function mount() {
    var navRight = document.getElementById('nav-right');
    if (!navRight) return;

    var btn = document.getElementById(BTN_ID);
    if (btn && btn.parentNode === navRight) {
      paint(btn);
      return;
    }
    if (btn) btn.remove();

    btn = document.createElement('div');
    btn.id = BTN_ID;
    btn.className = 'nav-button lopx-darkmode-btn';
    btn.innerHTML =
      '<a class="site-page" href="javascript:void(0);" role="button">' +
      '<i class="anzhiyufont ' + ICON + '"></i></a>';
    paint(btn);

    // 与「回到顶部」同属右侧动作组，插在它前面
    var anchor = document.getElementById('nav-totop');
    if (anchor && anchor.parentNode === navRight) {
      navRight.insertBefore(btn, anchor);
    } else {
      navRight.appendChild(btn);
    }
  }

  // 委托到 document：pjax 换掉 #nav-right 也不需要重新绑定
  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    if (!e.target.closest('#' + BTN_ID)) return;
    e.preventDefault();

    var source = document.getElementById('darkmode');
    if (source) {
      source.click();
    }
    // 主题切换是同步的，稍后刷新自身状态
    setTimeout(function () {
      paint(document.getElementById(BTN_ID));
    }, 80);
  });

  // 通过其他入口（右键菜单 / 快捷键 D / 控制台）切换时，同步本按钮状态
  if (window.MutationObserver) {
    new MutationObserver(function () {
      paint(document.getElementById(BTN_ID));
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
  document.addEventListener('pjax:complete', mount);
  window.addEventListener('load', mount);
})();
