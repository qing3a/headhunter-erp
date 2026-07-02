(function() {
  var counter = 0;

  function ensureStyle() {
    if (document.getElementById('globalLoadingStyle')) return;
    var style = document.createElement('style');
    style.id = 'globalLoadingStyle';
    style.textContent =
      '@keyframes erpSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }' +
      '#globalLoading {' +
      '  position: fixed;' +
      '  top: 0; left: 0; right: 0; bottom: 0;' +
      '  background: rgba(0, 0, 0, 0.45);' +
      '  display: flex;' +
      '  align-items: center;' +
      '  justify-content: center;' +
      '  z-index: 99999;' +
      '}' +
      '#globalLoading .erp-spinner {' +
      '  width: 48px;' +
      '  height: 48px;' +
      '  border: 4px solid rgba(255, 255, 255, 0.85);' +
      '  border-top-color: transparent;' +
      '  border-radius: 50%;' +
      '  animation: erpSpin 0.8s linear infinite;' +
      '  box-sizing: border-box;' +
      '}';
    document.head.appendChild(style);
  }

  function show() {
    counter += 1;
    if (document.getElementById('globalLoading')) return;
    ensureStyle();
    var el = document.createElement('div');
    el.id = 'globalLoading';
    var spinner = document.createElement('div');
    spinner.className = 'erp-spinner';
    el.appendChild(spinner);
    document.body.appendChild(el);
  }

  function hide() {
    if (counter > 0) counter -= 1;
    if (counter > 0) return;
    counter = 0;
    var el = document.getElementById('globalLoading');
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  function forceHide() {
    counter = 0;
    var el = document.getElementById('globalLoading');
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  window.Loading = {
    show: show,
    hide: hide,
    forceHide: forceHide
  };
})();