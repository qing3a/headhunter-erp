(function() {
  var PUBLIC_PAGES = [
    '/pages/login.html',
    '/pages/register.html',
    '/pages/forgot-password.html',
    '/pages/index.html',
    '/index.html',
    '/'
  ];

  function getPageKey() {
    const path = window.location.pathname;
    const filename = path.substring(path.lastIndexOf('/') + 1).replace('.html', '');
    return filename;
  }

  function getPageConfig() {
    var key = getPageKey();
    var title = (window.PAGE_TITLES && window.PAGE_TITLES[key]) || '';
    // 反查 navKey：在 MENU_CONFIG 中找 pageKey 或 alias 匹配的项
    var navKey = '';
    if (window.MENU_CONFIG) {
      for (var i = 0; i < window.MENU_CONFIG.length; i++) {
        var items = window.MENU_CONFIG[i].items || [];
        for (var j = 0; j < items.length; j++) {
          var item = items[j];
          if (item.pageKey === key) { navKey = item.key; break; }
          if (item.alias && item.alias.indexOf(key) !== -1) { navKey = item.key; break; }
        }
        if (navKey) break;
      }
    }
    return { title: title, navKey: navKey };
  }

  function initTheme() {
    const savedTheme = localStorage.getItem('theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);

    const toggleBtn = document.getElementById('themeToggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
      });
    }
  }

  function setActiveNav(navKey) {
    if (!navKey) return;
    document.querySelectorAll('.shell-sidebar .nav-item').forEach(item => {
      if (item.dataset.navKey === navKey) {
        item.setAttribute('data-active', 'true');
      } else {
        item.setAttribute('data-active', 'false');
      }
    });
  }

  /**
   * 根据 window.MENU_CONFIG 渲染 sidebar 菜单项
   * - 'main' 组：注入到 [data-dom-id="nav-list"]
   * - 'system' 组：复用 partial 里 [data-nav-key="settings"] 那一行，修改 href/icon/label
   * 支持 roles 字段做角色白名单过滤
   */
  function renderSidebarMenu() {
    var cfg = window.MENU_CONFIG;
    if (!cfg || !cfg.length) return;

    var user = (window.Auth && typeof window.Auth.getUser === 'function') ? window.Auth.getUser() : null;
    var userRole = user && user.role;

    function isVisible(item) {
      if (!item.roles || !item.roles.length) return true;
      if (!userRole) return false;
      return item.roles.indexOf(userRole) !== -1;
    }

    function escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // 主菜单区
    var mainList = document.querySelector('.shell-sidebar [data-dom-id="nav-list"]');
    if (mainList) {
      var html = '';
      cfg.forEach(function (group) {
        if (group.group === 'system') return;
        (group.items || []).forEach(function (item) {
          if (!isVisible(item)) return;
          html += '<a href="' + escapeHtml(item.path) + '" class="nav-item" data-nav-key="' + escapeHtml(item.key) + '">' +
                    '<i data-lucide="' + escapeHtml(item.icon) + '" class="nav-icon"></i>' +
                    '<span>' + escapeHtml(item.label) + '</span>' +
                  '</a>';
        });
      });
      mainList.innerHTML = html;
    }

    // 系统组（settings + tags）：完全由 JS 渲染，不再依赖 partial 占位
    var systemContainer = document.querySelector('[data-dom-id="sidebar-system"]');
    if (systemContainer) {
      // 找到 user-info div（保留为最底部）
      var userInfoEl = systemContainer.querySelector('.flex.items-center.gap-3.px-4');
      var sysHtml = '';
      cfg.forEach(function (group) {
        if (group.group !== 'system') return;
        (group.items || []).forEach(function (item) {
          if (!isVisible(item)) return;
          sysHtml += '<a href="' + escapeHtml(item.path) + '" class="nav-item" data-nav-key="' + escapeHtml(item.key) + '">' +
                    '<i data-lucide="' + escapeHtml(item.icon) + '" class="nav-icon"></i>' +
                    '<span>' + escapeHtml(item.label) + '</span>' +
                    '</a>';
        });
      });
      if (userInfoEl) {
        userInfoEl.insertAdjacentHTML('beforebegin', sysHtml);
      } else {
        systemContainer.insertAdjacentHTML('afterbegin', sysHtml);
      }
    }
  }

  function setPageTitle(title) {
    if (!title) return;
    const titleEl = document.querySelector('[data-slot="pageTitle"]');
    if (titleEl) titleEl.textContent = title;
    document.title = title + ' - TalentFlow AI';
  }

  function movePageContent() {
    const pageContent = document.getElementById('pageContent');
    const slot = document.querySelector('[data-slot="pageContent"]');
    if (pageContent && slot) {
      while (pageContent.firstChild) {
        slot.appendChild(pageContent.firstChild);
      }
      pageContent.remove();
    }
  }

  function movePageStyles() {
    const pageStyle = document.getElementById('pageStyle');
    if (pageStyle) {
      document.head.appendChild(pageStyle);
    }
  }

  function movePageScripts() {
    const pageScript = document.getElementById('pageScript');
    if (pageScript) {
      document.body.appendChild(pageScript);
    }
  }

  function isPublicPage() {
    var path = window.location.pathname;
    for (var i = 0; i < PUBLIC_PAGES.length; i++) {
      if (path === PUBLIC_PAGES[i]) return true;
    }
    return false;
  }

  function fillUserInfo() {
    if (!window.Auth || typeof window.Auth.getUser !== 'function') return;
    var user = window.Auth.getUser();
    if (!user) return;

    var name = user.displayName || user.username || '用户';
    var role = user.role || '';
    var roleLabelMap = {
      'admin': '管理员',
      'consultant': '顾问',
      'leader': '团队负责人',
      'manager': '经理'
    };
    var roleLabel = roleLabelMap[role] || role;

    var initial = '';
    if (name && name.length) {
      initial = name.charAt(0).toUpperCase();
    }

    var sidebarNameNodes = document.querySelectorAll('[data-dom-id="sidebar-user-name"]');
    for (var i = 0; i < sidebarNameNodes.length; i++) {
      sidebarNameNodes[i].textContent = name;
    }

    var sidebarRoleNodes = document.querySelectorAll('[data-dom-id="sidebar-user-role"]');
    for (var j = 0; j < sidebarRoleNodes.length; j++) {
      sidebarRoleNodes[j].textContent = roleLabel;
    }

    var dropdownNameNodes = document.querySelectorAll('[data-dom-id="dropdown-user-name"]');
    for (var m = 0; m < dropdownNameNodes.length; m++) {
      dropdownNameNodes[m].textContent = name;
    }

    var dropdownRoleNodes = document.querySelectorAll('[data-dom-id="dropdown-user-role"]');
    for (var n = 0; n < dropdownRoleNodes.length; n++) {
      dropdownRoleNodes[n].textContent = roleLabel + (user.username ? ' · ' + user.username : '');
    }

    var avatarNodes = document.querySelectorAll('.shell-sidebar .rounded-full, .dropdown > button > div.rounded-full, .dropdown > button .rounded-full');
    for (var k = 0; k < avatarNodes.length; k++) {
      var el = avatarNodes[k];
      if (el.children.length === 0) {
        el.textContent = initial;
      }
    }

    var logoutBtn = document.querySelector('[data-dom-id="logout-btn"]');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (window.Auth && typeof window.Auth.logout === 'function') {
          window.Auth.logout();
        } else {
          window.location.href = '/pages/login.html';
        }
      });
    }
  }

  // ===== v3-21 (P3-21) 修复：partial 加载缓存 + 并发防抖 =====
  // 第一次 fetch 后缓存 promise，session 内所有 layout 调用复用同一份 HTML
  // 也避免同一时刻多个 layout 触发重复请求
  var partialCache = null;
  function fetchPartial() {
    if (partialCache) return partialCache;
    var shellPath = '../partials/project-shell.html';
    var altPath = 'partials/project-shell.html';
    partialCache = fetch(shellPath)
      .then(function(res) {
        if (!res.ok) throw new Error('not found');
        return res.text();
      })
      .catch(function() { return fetch(altPath).then(function(res) { return res.text(); }); });
    return partialCache;
  }

  function loadLayout() {
    if (!isPublicPage()) {
      if (window.Auth && typeof window.Auth.requireLogin === 'function') {
        window.Auth.requireLogin();
      }
    }

    fetchPartial()
      .then(function(html) {
        var temp = document.createElement('div');
        temp.innerHTML = html;

        var sidebar = temp.querySelector('.shell-sidebar');
        var header = temp.querySelector('.shell-header');
        var main = temp.querySelector('.shell-main');

        if (sidebar) document.body.insertBefore(sidebar, document.body.firstChild);
        if (header) document.body.insertBefore(header, document.body.firstChild ? document.body.firstChild.nextSibling : null);
        if (main) document.body.appendChild(main);

        var config = getPageConfig();
        setPageTitle(config.title);
        setActiveNav(config.navKey);
        renderSidebarMenu();

        movePageContent();
        movePageStyles();
        movePageScripts();

        if (window.lucide) {
          window.lucide.createIcons();
        }

        initTheme();

        if (window.UI && window.UI.initDropdowns) {
          window.UI.initDropdowns();
        }

        fillUserInfo();

        document.dispatchEvent(new CustomEvent('layout:ready'));
      })
      .catch(function(err) {
        console.error('Failed to load layout:', err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadLayout);
  } else {
    loadLayout();
  }
})();
