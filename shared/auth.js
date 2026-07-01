(function() {
  var TOKEN_KEY = 'erp_token';
  var USER_KEY = 'erp_user';

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function getUser() {
    try {
      var raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setSession(token, user) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) {
      console.error('Auth.setSession failed:', e);
    }
  }

  function clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (e) {
      console.error('Auth.clear failed:', e);
    }
  }

  function isLoggedIn() {
    return !!getToken();
  }

  function logout() {
    clear();
    var path = window.location.pathname;
    var inPages = path.indexOf('/pages/') !== -1;
    var target = inPages ? 'login.html' : '/pages/login.html';
    if (window.Router && typeof window.Router.navigate === 'function') {
      window.Router.navigate(target);
    } else {
      window.location.href = target;
    }
  }

  function requireLogin() {
    if (isLoggedIn()) return true;
    var path = window.location.pathname + window.location.search;
    var returnUrl = encodeURIComponent(path);
    var target = '/pages/login.html?returnUrl=' + returnUrl;
    if (window.Router && typeof window.Router.navigate === 'function') {
      window.Router.navigate(target);
    } else {
      window.location.href = target;
    }
    return false;
  }

  function hasRole() {
    var roles = [];
    for (var i = 0; i < arguments.length; i++) {
      roles.push(arguments[i]);
    }
    var user = getUser();
    if (!user || !user.role) return false;
    for (var j = 0; j < roles.length; j++) {
      if (user.role === roles[j]) return true;
    }
    return false;
  }

  function isAdmin() {
    var user = getUser();
    return !!(user && user.role === 'admin');
  }

  window.Auth = {
    isLoggedIn: isLoggedIn,
    getToken: getToken,
    getUser: getUser,
    setSession: setSession,
    clear: clear,
    logout: logout,
    requireLogin: requireLogin,
    hasRole: hasRole,
    isAdmin: isAdmin
  };
})();