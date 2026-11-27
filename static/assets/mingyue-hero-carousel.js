/* 首页 Hero 背景轮播：/academic/uploads/hero/1-9.jpg，每 5 秒切换一次。
 *
 * - 用 ::before 画背景图，opacity 过渡实现淡出/淡入，避免生硬切换。
 * - 用 ::after 统一加白色 + 降饱和掩膜，降低照片颜色刺眼程度。
 * - 隐藏原主题的 hero-visual-wrap（白色方框 + 紫色轨道插画）。
 * - 仍通过 dashboard-hero 区域驱动 React，保持与后台配置机制一致。
 */
(function () {
  var KEY = 'mingyue_bg_zones';
  var ZONE = 'dashboard-hero';
  var INTERVAL = 5000;
  var FADE_MS = 650;
  var VER = '20261127';
  var IMAGES = [];
  for (var n = 1; n <= 9; n++) IMAGES.push('/academic/uploads/hero/' + n + '.jpg?v=' + VER);

  var nativeSet = Storage.prototype.setItem;
  var current = IMAGES[0];
  var fadeTimer = null;

  function isHome() { return /^\/academic\/?$/.test(location.pathname); }

  function apply(url, notify) {
    var map = {};
    try { map = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { map = {}; }
    map[ZONE] = url;
    var value = JSON.stringify(map);
    try { nativeSet.call(localStorage, KEY, value); } catch (e) { }
    if (notify) {
      try {
        window.dispatchEvent(new StorageEvent('storage', {
          key: KEY, newValue: value, storageArea: localStorage,
        }));
      } catch (e) { }
    }
  }

  function findHero() {
    var el = document.querySelector('.typography-hero-display');
    while (el && el.tagName !== 'SECTION') el = el.parentElement;
    return el;
  }

  function setInitial(url) {
    var sec = findHero();
    if (!sec) { setTimeout(function () { setInitial(url); }, 120); return; }
    sec.setAttribute('data-mq-hero', '1');
    sec.style.setProperty('--mq-hero-bg', 'url("' + url + '")');
    sec.style.setProperty('--mq-hero-opacity', '1');
  }

  function show(url) {
    var sec = findHero();
    if (!sec) { setTimeout(function () { show(url); }, 120); return; }
    sec.setAttribute('data-mq-hero', '1');
    sec.style.setProperty('--mq-hero-opacity', '0');
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(function () {
      sec.style.setProperty('--mq-hero-bg', 'url("' + url + '")');
      sec.style.setProperty('--mq-hero-opacity', '1');
    }, FADE_MS);
  }

  var style = document.createElement('style');
  style.textContent =
    /* 背景由伪元素绘制，section 本身透明 */
    'section[data-mq-hero]:has(.typography-hero-display){' +
    'background:transparent !important;background-color:transparent !important;' +
    '}' +
    /* 照片层：淡入淡出 + 降饱和/压亮度 */
    'section[data-mq-hero]:has(.typography-hero-display)::before{' +
    'content:"";position:absolute;inset:0 !important;left:0 !important;right:0 !important;top:0 !important;bottom:0 !important;width:100% !important;height:100% !important;margin:0 !important;z-index:0;pointer-events:none;' +
    'background-image:var(--mq-hero-bg);background-size:cover;background-position:center center;background-repeat:no-repeat;' +
    'opacity:var(--mq-hero-opacity,1);transition:opacity ' + (FADE_MS / 1000) + 's ease-in-out;' +
    'filter:saturate(.55) brightness(.92) contrast(.95);animation:none !important;' +
    '}' +
    /* 统一掩膜：整体压白并降饱和，中心更白保证文字 */
    'section[data-mq-hero]:has(.typography-hero-display)::after{' +
    'content:"";position:absolute;inset:0 !important;left:0 !important;right:0 !important;top:0 !important;bottom:0 !important;width:100% !important;height:100% !important;margin:0 !important;z-index:1;pointer-events:none;' +
    'background-image:radial-gradient(ellipse 75% 55% at 50% 24%, rgba(255,255,255,.92) 0%, rgba(255,255,255,.80) 40%, rgba(255,255,255,.55) 75%, rgba(255,255,255,.32) 100%);' +
    'background-color:rgba(255,255,255,.10);' +
    'opacity:1 !important;animation:none !important;' +
    '}' +
    /* 内容在掩膜上方 */
    'section[data-mq-hero] .tile-content{z-index:2 !important;}' +
    /* 去掉白色方框和轨道插画，但保留它占的高度，维持首屏大气尺寸 */
    'section[data-mq-hero] .hero-visual-wrap,' +
    'section[data-mq-hero] .hero-ambient-orb{visibility:hidden !important;}';
  document.head.appendChild(style);

  for (var i = 0; i < IMAGES.length; i++) {
    var img = new Image();
    img.src = IMAGES[i];
  }

  if (isHome()) {
    apply(IMAGES[0], false);
    setInitial(IMAGES[0]);
  }

  var idx = 0;
  setInterval(function () {
    if (!isHome()) return;
    idx = (idx + 1) % IMAGES.length;
    current = IMAGES[idx];
    apply(current, true);
    show(current);
  }, INTERVAL);

  // 兜底：React 重渲染后确保变量仍在
  setInterval(function () {
    if (!isHome()) return;
    var sec = findHero();
    if (!sec) return;
    sec.setAttribute('data-mq-hero', '1');
    if (!sec.style.getPropertyValue('--mq-hero-bg')) {
      sec.style.setProperty('--mq-hero-bg', 'url("' + current + '")');
    }
    if (!sec.style.getPropertyValue('--mq-hero-opacity')) {
      sec.style.setProperty('--mq-hero-opacity', '1');
    }
  }, 1000);
})();
