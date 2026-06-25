// Max Web hardening — runs before the app bundle (classic script in <head>).
//  1) polyfill crypto.randomUUID (works on plain HTTP / insecure contexts)
//  2) block analytics/crash trackers (apptracer, OK calls telemetry)
//  3) spoof device fingerprint sent in the WS handshake (opcode 6)
//  4) drop product-analytics frames (opcode 5)
(function () {
  'use strict';

  // ---- 1) crypto.randomUUID polyfill (uses getRandomValues, no secure ctx) --
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function' && crypto.getRandomValues) {
      crypto.randomUUID = function () {
        var b = crypto.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
        var h = []; for (var i = 0; i < 256; i++) h[i] = (i + 0x100).toString(16).slice(1);
        return h[b[0]]+h[b[1]]+h[b[2]]+h[b[3]]+'-'+h[b[4]]+h[b[5]]+'-'+h[b[6]]+h[b[7]]+'-'+
               h[b[8]]+h[b[9]]+'-'+h[b[10]]+h[b[11]]+h[b[12]]+h[b[13]]+h[b[14]]+h[b[15]];
      };
    }
  } catch (e) {}

  // ---- persistent random spoof profile (stable across reloads) --------------
  var UAS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
  ];
  var SCREENS = [[1920,1080],[1366,768],[1536,864],[1440,900],[2560,1440],[1280,720]];
  var DPRS = [1, 1.25, 1.5, 2];
  var TZS = ['Europe/London','America/New_York','Europe/Berlin','Asia/Tokyo','Europe/Paris','America/Los_Angeles','Asia/Dubai','Australia/Sydney'];
  function pick(a){ return a[Math.floor(Math.random()*a.length)]; }

  var P;
  try { P = JSON.parse(localStorage.getItem('__mw_spoof') || 'null'); } catch (e) {}
  if (!P) {
    var s = pick(SCREENS);
    P = { ua: pick(UAS), sw: s[0], sh: s[1], dpr: pick(DPRS), tz: pick(TZS) };
    try { localStorage.setItem('__mw_spoof', JSON.stringify(P)); } catch (e) {}
  }

  // ---- 2) block trackers (apptracer crash/perf, OK calls beacons) -----------
  var BLOCK = /apptracer\.ru|okcdn\.ru\/fb\.do/i;
  try {
    var _fetch = window.fetch;
    window.fetch = function (input, init) {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      if (BLOCK.test(url)) return Promise.resolve(new Response('', { status: 204 }));
      return _fetch.apply(this, arguments);
    };
  } catch (e) {}
  try {
    var _beacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
    if (_beacon) navigator.sendBeacon = function (url) { return BLOCK.test(String(url)) ? true : _beacon.apply(navigator, arguments); };
  } catch (e) {}
  try {
    var _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, url) {
      this.__blocked = BLOCK.test(String(url));
      return _open.apply(this, arguments);
    };
    var _send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () { if (this.__blocked) return; return _send.apply(this, arguments); };
  } catch (e) {}

  // ---- 3) spoof fingerprint INPUTS: UA, screen, devicePixelRatio, timezone --
  function def(obj, prop, val) {
    try { Object.defineProperty(obj, prop, { get: function () { return val; }, configurable: true }); } catch (e) {}
  }
  def(Navigator.prototype, 'userAgent', P.ua);
  def(window.screen, 'width', P.sw);  def(window.screen, 'height', P.sh);
  def(window.screen, 'availWidth', P.sw); def(window.screen, 'availHeight', P.sh);
  def(window, 'devicePixelRatio', P.dpr);
  try {
    var _ro = Intl.DateTimeFormat.prototype.resolvedOptions;
    Intl.DateTimeFormat.prototype.resolvedOptions = function () {
      var o = _ro.apply(this, arguments); o.timeZone = P.tz; return o;
    };
  } catch (e) {}

  // ---- 4) WS hook: drop analytics (op5) + force osVersion/deviceName -------
  function readStr(u8, p) { // returns {start,end,value} of msgpack string at p
    var b = u8[p], hdr, len;
    if (b >= 0xa0 && b <= 0xbf) { hdr = 1; len = b & 0x1f; }
    else if (b === 0xd9) { hdr = 2; len = u8[p+1]; }
    else if (b === 0xda) { hdr = 3; len = (u8[p+1]<<8)|u8[p+2]; }
    else return null;
    return { start: p, end: p + hdr + len, len: len };
  }
  function encStr(s) {
    var bytes = []; for (var i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i) & 0xff);
    var out; if (bytes.length <= 31) out = [0xa0 | bytes.length]; else out = [0xd9, bytes.length];
    return out.concat(bytes);
  }
  function isStrPrefix(b) { return (b >= 0xa0 && b <= 0xbf) || b === 0xd9 || b === 0xda; }
  function findValuePos(u8, key) {
    // Locate the key by its raw ASCII bytes (MAX uses both standard fixstr and
    // custom-marker key prefixes), accepting only where the value right after
    // is itself a msgpack string. Returns the value position, or -1.
    var kb = []; for (var i = 0; i < key.length; i++) kb.push(key.charCodeAt(i) & 0xff);
    outer: for (var p = 1; p < u8.length - kb.length - 1; p++) {
      for (var j = 0; j < kb.length; j++) if (u8[p+j] !== kb[j]) continue outer;
      var vp = p + kb.length;
      var prev = u8[p-1];
      // key must start at a boundary: preceded by a length/prefix byte, not a letter
      if (prev >= 0x30 && prev <= 0x7e) continue;     // preceding ASCII letter -> substring, skip
      if (isStrPrefix(u8[vp])) return vp;
    }
    return -1;
  }
  function maskInPlace(u8, key, value) { // same-length overwrite of the value's bytes
    var vp = findValuePos(u8, key); if (vp < 0) return;
    var s = readStr(u8, vp); if (!s) return;
    var dataStart = s.end - s.len;            // first byte of the string data
    for (var i = 0; i < s.len; i++) {
      u8[dataStart + i] = i < value.length ? (value.charCodeAt(i) & 0xff) : 0x20; // pad with space
    }
  }
  function patchHandshake(u8) {
    // Same-length, in-place edits only — never changes frame/msgpack structure.
    var payload = u8.subarray(10);
    maskInPlace(payload, 'osVersion', 'Secret');
    maskInPlace(payload, 'Name', 'Secret');
    return u8;
  }
  try {
    var _wsSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      try {
        var u8 = null;
        if (data instanceof ArrayBuffer) u8 = new Uint8Array(data);
        else if (ArrayBuffer.isView(data)) u8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        if (u8 && u8.length >= 10 && u8[0] === 10) {
          var opcode = (u8[4]<<8) | u8[5];
          if (opcode === 5) return;                 // drop product analytics
          if (opcode === 6 && !window.__MW_NOPATCH6) return _wsSend.call(this, patchHandshake(u8)); // spoof
        }
      } catch (e) {}
      return _wsSend.apply(this, arguments);
    };
  } catch (e) {}
})();
