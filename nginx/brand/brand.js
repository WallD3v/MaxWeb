// Max Web branding: adds "Maked with ❤️ by WallD3v" under the
// "phone number" button on the MAX auth screen. Injected by nginx.
(function () {
  var REPO = 'https://github.com/WallD3v/MaxWeb';

  function findPhoneButton() {
    // The language switcher carries aria-label / aria-haspopup; the phone-login
    // button is the plain ghost button with visible text (locale-independent).
    var btns = document.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (b.innerText && b.innerText.trim().length > 0 &&
          !b.hasAttribute('aria-label') && !b.hasAttribute('aria-haspopup')) {
        return b;
      }
    }
    return null;
  }

  function inject() {
    if (document.getElementById('wd-brand')) return;
    var btn = findPhoneButton();
    if (!btn) return;
    var el = document.createElement('div');
    el.id = 'wd-brand';
    el.style.cssText = 'margin-top:12px;text-align:center;font-size:13px;line-height:1.4;opacity:.6;width:100%';
    el.innerHTML = 'Maked with ❤️ by <a href="' + REPO +
      '" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">WallD3v</a>';
    btn.insertAdjacentElement('afterend', el);
  }

  function start() {
    inject();
    var obs = new MutationObserver(function () { inject(); });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
