(function() {
  var ROUTES = {
    'dashboard': '/pages/dashboard.html',
    'candidates': '/pages/candidate-pool.html',
    'jobs': '/pages/job-management.html',
    'interviews': '/pages/interview-management.html',
    'tasks': '/pages/dashboard.html',
    'clients': '/pages/client-management.html',
    'ai-matching': '/pages/ai-matching.html',
    'reports': '/pages/reports.html',
    'settings': '/pages/settings.html',
    'notifications': '/pages/notifications.html',
    'login': '/pages/login.html',
    'register': '/pages/register.html',
    'forgot-password': '/pages/forgot-password.html',
    'candidate-detail': '/pages/candidate-detail.html',
    'candidate-import': '/pages/candidate-import.html',
    'job-create': '/pages/job-create.html',
    'job-detail': '/pages/job-detail.html',
    'interview-detail': '/pages/interview-detail.html',
    'client-detail': '/pages/client-detail.html'
  };

  function go(name) {
    var path = ROUTES[name];
    if (!path) {
      console.warn('Router.go: unknown route "' + name + '"');
      return;
    }
    window.location.href = path;
  }

  function navigate(path) {
    if (!path) return;
    window.location.href = path;
  }

  function getParam(name) {
    try {
      var search = window.location.search || '';
      var usp = new URLSearchParams(search);
      return usp.get(name);
    } catch (e) {
      return null;
    }
  }

  function current() {
    return window.location.pathname + window.location.search + window.location.hash;
  }

  window.Router = {
    ROUTES: ROUTES,
    go: go,
    getParam: getParam,
    navigate: navigate,
    current: current
  };
})();