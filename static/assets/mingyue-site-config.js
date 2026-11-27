/* 明月学术交流平台 —— 站点配置同步（背景配图）
 *
 * 背景：管理端「图片素材 → 区域配置」原本只把结果写进浏览器 localStorage，
 * 导致「管理员配了背景，访客却看不到」；换浏览器/清缓存还会丢。
 *
 * 本脚本把这份配置接到服务端：
 *   1) 同步 XHR 拉取 /academic/api/v1/site-config，写回 localStorage —— 必须早于 React
 *      渲染执行（因此本文件在 <head> 中以阻塞脚本加载，不能加 defer）。
 *   2) 拦截 localStorage.setItem('mingyue_bg_images' | 'mingyue_bg_zones')，
 *      防抖后 PUT 回服务端持久化（仅登录的管理员；普通用户只读）。
 */
(function () {
  'use strict';
  var KEY_ZONES = 'mingyue_bg_zones';
  var KEY_IMAGES = 'mingyue_bg_images';
  var API = '/academic/api/v1/site-config';

  function parse(s, fb) {
    try { return JSON.parse(s || fb); } catch (e) { return JSON.parse(fb); }
  }

  /* ---------- 1. 启动时：服务端 → 本地 ---------- */
  try {
    var raw = null;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API, false); // 同步：必须早于首屏渲染
    xhr.send();
    if (xhr.status === 200) {
      raw = parse(xhr.responseText, '{}');
    }
    if (raw) {
      var zones = raw.backgrounds || {};
      var imgs = raw.images || [];
      if (zones && Object.keys(zones).length) {
        localStorage.setItem(KEY_ZONES, JSON.stringify(zones));
      }
      if (Array.isArray(imgs) && imgs.length) {
        localStorage.setItem(KEY_IMAGES, JSON.stringify(imgs));
      }
      window.__mqSiteConfig = raw;
    }
  } catch (e) {
    /* 离线或接口异常时静默降级到本地配置 */
  }

  /* ---------- 2. 管理端改动 → 服务端 ---------- */
  function token() {
    try {
      return localStorage.getItem('token') || localStorage.getItem('access_token') || '';
    } catch (e) { return ''; }
  }

  var timer = null;

  function push() {
    if (!token()) return; // 未登录不上报
    var zones = null, imgs = null;
    try { zones = localStorage.getItem(KEY_ZONES); } catch (e) {}
    try { imgs = localStorage.getItem(KEY_IMAGES); } catch (e) {}
    var body = {
      backgrounds: parse(zones || '{}', '{}'),
      images: parse(imgs || '[]', '[]')
    };
    try {
      fetch(API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify(body)
      }).catch(function () {});
    } catch (e) {}
  }

  var origSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (k, v) {
    origSet(k, v);
    if (k === KEY_ZONES || k === KEY_IMAGES) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(push, 700); // 防抖，避免连续写入刷爆接口
    }
  };

  window.mqSiteConfig = { push: push };
})();
