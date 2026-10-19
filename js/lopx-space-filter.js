/*!
 * lopx-space-filter —— /tech/ 与 /indie/ 分类胶囊的本地过滤（2026-10-19）
 *
 * 背景：
 *   这两个空间的分类切换原先走 pjax，而 pjax 的 selectors 含 #body-wrap，
 *   于是每切一次分类，整块 #body-wrap（顶部 #nav、页头、h1、胶囊、卡片、
 *   footer、所有 data-pjax 脚本）全部销毁重建；再加上 #content-inner 的
 *   opacity 过渡，新节点一出生就带着 0.45 的透明度再淡回，肉眼看到的就是
 *   「整页刷了一下」。实测 #body-wrap 移除 1 次、九个关键节点 uid 全部变化、
 *   页面高度 1442 → 805。
 *
 * 做法：
 *   构建期把该空间的全量卡片一次渲染出来，非当前分类的带 hidden 属性
 *   （见 includes/mixins/space-cards.pug），本脚本只负责在胶囊之间搬 hidden。
 *   → 零网络请求、零节点重建、封面图不会重新解码，标题栏与顶部导航完全不动。
 *
 * 与 pjax 的关系：
 *   本脚本在捕获阶段拦下点击并 stopPropagation，pjax 的冒泡监听收不到，
 *   因此不会触发整页替换。带修饰键（Ctrl / Cmd / Shift / 中键）的点击不拦，
 *   交给浏览器开新标签页。
 *
 * 与 pjax 生命周期的关系：
 *   pjax 会替换 #body-wrap，本脚本挂在 additional-js.pug 的 .js-pjax 块里、
 *   带 data-pjax 重新执行；旧的 root 节点已销毁，其监听器随之失效，
 *   新 root 没有 data-space-ready 标记，自然重新绑定。切勿自行监听
 *   pjax:complete —— 那会在每次导航后多叠一个监听器。
 *
 * 为什么必须自己接管 popstate：
 *   pjax 的 popstate 处理器写的是 `if (st.state) { loadUrl(st.state.url, ...) }`
 *   （见 public/pluginsSrc/pjax/pjax.min.js）。我们用 pushState 写入的 state
 *   只有 { lopxSpaceCat }，没有 url 字段 → pjax 会拿 undefined 去 loadUrl，
 *   实测触发数十次 pjax:send / pjax:complete 的抖动循环，后退后 URL 变成
 *   /tech/项目/ 而内容停在 /tech/Git/。所以这里在 window 上抢注 popstate，
 *   能在本空间内解析出分类就 stopImmediatePropagation 拦下 pjax，
 *   解析不出（用户退到了文章页等）则放行，交回 pjax 正常处理。
 *   注册顺序有保证：本脚本在 additional-js.pug 的 .js-pjax 块里（第 365 行），
 *   pjax 的 partial 在其后（第 447 行），且本脚本无 async/defer，先行执行。
 */
(function () {
  'use strict'

  function init() {
    var root = document.querySelector('[data-space-root]')
    if (!root) return
    if (root.getAttribute('data-space-ready') === '1') return

    var nav = root.querySelector('.lopx-space-nav')
    var cardsBox = root.querySelector('[data-space-cards]')
    if (!nav || !cardsBox) return

    var links = Array.prototype.slice.call(nav.querySelectorAll('a[data-space-cat]'))
    var cards = Array.prototype.slice.call(cardsBox.querySelectorAll('.lopx-card'))
    if (!links.length) return

    root.setAttribute('data-space-ready', '1')

    var label = root.querySelector('[data-space-label]')
    var reduceMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // cat(空串=全部) → { href, title }，全部是构建期写进 HTML 的，无需请求
    var targets = {}
    links.forEach(function (a) {
      var cat = a.getAttribute('data-space-cat') || ''
      targets[cat] = {
        href: a.getAttribute('href') || '',
        title: a.getAttribute('data-space-title') || ''
      }
    })

    function activeCat() {
      var el = nav.querySelector('a.is-active')
      return el ? el.getAttribute('data-space-cat') || '' : ''
    }

    function pathOf(href) {
      try {
        return new URL(href, location.href).pathname
      } catch (err) {
        return href
      }
    }

    function pulse() {
      if (reduceMotion) return
      cardsBox.classList.remove('is-switching')
      // 强制回流，让同一 class 连续添加两次也能重播动画
      void cardsBox.offsetWidth
      cardsBox.classList.add('is-switching')
      window.clearTimeout(pulse.timer)
      pulse.timer = window.setTimeout(function () {
        cardsBox.classList.remove('is-switching')
      }, 320)
    }

    function apply(cat, options) {
      var changed = false

      cards.forEach(function (card) {
        var shouldHide = !!cat && (card.getAttribute('data-cat') || '') !== cat
        if (card.hidden !== shouldHide) {
          card.hidden = shouldHide
          changed = true
        }
      })

      links.forEach(function (a) {
        var isActive = (a.getAttribute('data-space-cat') || '') === cat
        if (a.classList.contains('is-active') !== isActive) {
          a.classList.toggle('is-active', isActive)
        }
      })

      if (label && label.textContent !== cat) label.textContent = cat
      if (changed) pulse()

      if (options && options.history === false) return

      var target = targets[cat]
      if (!target || !target.href) return
      if (pathOf(target.href) === location.pathname) return

      history.pushState({ lopxSpaceCat: cat }, '', target.href)
      if (target.title) document.title = target.title
    }

    // 捕获阶段：必须在 pjax 的冒泡监听之前截住，否则会走整页替换
    root.addEventListener(
      'click',
      function (event) {
        if (event.defaultPrevented) return
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return
        }

        var anchor = event.target.closest ? event.target.closest('a[data-space-cat]') : null
        if (!anchor || !nav.contains(anchor)) return

        event.preventDefault()
        event.stopPropagation()

        var cat = anchor.getAttribute('data-space-cat') || ''
        if (cat === activeCat()) return
        apply(cat)
      },
      true
    )

    // 首屏若 URL 与高亮项不一致（浏览器前进/后退回来、或静态页与状态错位），
    // 以 URL 为准校正一次，不写历史。
    var matched = links.filter(function (a) {
      return pathOf(a.getAttribute('href') || '') === location.pathname
    })[0]
    if (matched) {
      var urlCat = matched.getAttribute('data-space-cat') || ''
      if (urlCat !== activeCat()) apply(urlCat, { history: false })
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

  // ---- popstate 接管（全局只注册一次）------------------------------------
  // 每次 pjax 后本文件会重新执行，用 window 上的标记避免叠加监听器。
  // handler 内不复用闭包里的 root / targets，一律现查 DOM —— pjax 之后
  // 旧的 root 已经销毁，闭包变量会指向游离节点。
  function pathOf(href) {
    try {
      return new URL(href, location.href).pathname
    } catch (err) {
      return href
    }
  }

  function syncToUrl() {
    var root = document.querySelector('[data-space-root]')
    if (!root || root.getAttribute('data-space-ready') !== '1') return false

    var nav = root.querySelector('.lopx-space-nav')
    var cardsBox = root.querySelector('[data-space-cards]')
    if (!nav || !cardsBox) return false

    var links = Array.prototype.slice.call(nav.querySelectorAll('a[data-space-cat]'))
    var hit = null
    for (var i = 0; i < links.length; i++) {
      if (pathOf(links[i].getAttribute('href') || '') === location.pathname) {
        hit = links[i]
        break
      }
    }
    // URL 不属于本空间的任何胶囊（例如退到了文章页）→ 交回 pjax
    if (!hit) return false

    var cat = hit.getAttribute('data-space-cat') || ''
    var cards = Array.prototype.slice.call(cardsBox.querySelectorAll('.lopx-card'))

    cards.forEach(function (card) {
      card.hidden = !!cat && (card.getAttribute('data-cat') || '') !== cat
    })

    links.forEach(function (a) {
      a.classList.toggle('is-active', (a.getAttribute('data-space-cat') || '') === cat)
    })

    var label = root.querySelector('[data-space-label]')
    if (label) label.textContent = cat

    var title = hit.getAttribute('data-space-title')
    if (title) document.title = title

    return true
  }

  if (!window.__lopxSpacePopBound) {
    window.__lopxSpacePopBound = true
    window.addEventListener('popstate', function (event) {
      // 只有能解析成空间胶囊目标时才拦截；否则让 pjax 照常处理整页替换
      if (syncToUrl()) event.stopImmediatePropagation()
    })
  }
})()
