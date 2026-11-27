/* 首页 Hero 背景轮播：/academic/uploads/hero/1-9.jpg，每 5 秒切换一次。
 *
 * 主题 CSS 用 `section:has(.typography-hero-display){ background: ... !important }`
 * 把 hero 背景固定成渐变，所以这里用更高优先级的选择器 + CSS 变量覆盖，
 * 同时继续通过 dashboard-hero 区域驱动 React（保持和后台配置机制一致）。
 */
(function () {
  var KEY = 'mingyue_bg_zones';
  var ZONE = 'dashboard-hero';
  var INTERVAL = 5000;
  var VER = '20261127';
  var IMAGES = [];
  for (var n = 1; n <= 9; n++) IMAGES.push('/academic/uploads/hero/' + n + '.jpg?v=' + VER);

  var nativeSet = Storage.prototype.setItem;
  var current = IMAGES[0];

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

  function paint(url) {
    var sec = findHero();
    if (!sec) {
      setTimeout(function () { paint(url); }, 120);
      return;
    }
    sec.setAttribute('data-mq-hero', '1');
    sec.style.setProperty('--mq-hero-bg', 'url("' + url + '")');
  }

  // 覆盖主题 CSS 的 !important 渐变
  var style = document.createElement('style');
  style.textContent =
    'section[data-mq-hero]:has(.typography-hero-display){' +
    'background:radial-gradient(ellipse at 50% 45%, rgba(255,255,255,.86) 0%, rgba(255,255,255,.68) 40%, rgba(255,255,255,.35) 72%, rgba(255,255,255,.15) 100%), var(--mq-hero-bg) center center / cover no-repeat !important;' +
    'background-color:transparent !important;' +
    '}';
  document.head.appendChild(style);

  for (var i = 0; i < IMAGES.length; i++) {
    var img = new Image();
    img.src = IMAGES[i];
  }

  if (isHome()) {
    apply(IMAGES[0], false);
    paint(IMAGES[0]);
  }

  var idx = 0;
  setInterval(function () {
    if (!isHome()) return;
    idx = (idx + 1) % IMAGES.length;
    current = IMAGES[idx];
    apply(current, true);
    paint(current);
  }, INTERVAL);

  // 兜底：React 重渲染后确保覆盖仍在
  setInterval(function () {
    if (isHome()) paint(current);
  }, 1000);
})();
