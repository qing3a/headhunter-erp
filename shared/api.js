(function() {
  var API_BASE = '/api/v1';

  function buildQuery(params) {
    if (!params) return '';
    var entries = [];
    for (var key in params) {
      if (!Object.prototype.hasOwnProperty.call(params, key)) continue;
      var v = params[key];
      if (v === null || v === undefined || v === '') continue;
      entries.push(encodeURIComponent(key) + '=' + encodeURIComponent(v));
    }
    return entries.length ? '?' + entries.join('&') : '';
  }

  function notify(message) {
    if (window.UI && typeof window.UI.showToast === 'function') {
      window.UI.showToast({ type: 'error', title: '错误', message: message });
    } else {
      alert(message);
    }
  }

  function notifyError(error) {
    if (!error) return;
    var message = error.message || '操作失败';
    var code = error.code || '';
    if (code === 'NO_TOKEN' || code === 'INVALID_TOKEN' || code === 'UNAUTHORIZED') {
      if (window.Auth && typeof window.Auth.logout === 'function') {
        window.Auth.logout();
      }
      alert('登录已过期');
      return;
    }
    if (window.Toast && typeof window.Toast.error === 'function') {
      window.Toast.error(message);
    } else {
      notify(message);
    }
  }

  function ApiClient() {
    this.baseUrl = API_BASE;
  }

  ApiClient.prototype._request = function(path, options) {
    options = options || {};
    var method = (options.method || 'GET').toUpperCase();
    var url = this.baseUrl + path;

    var headers = {
      'Content-Type': 'application/json'
    };
    if (options.skipAuth !== true) {
      if (window.Auth && typeof window.Auth.getToken === 'function') {
        var token = window.Auth.getToken();
        if (token) {
          headers['Authorization'] = 'Bearer ' + token;
        }
      }
    }
    if (options.headers) {
      for (var hk in options.headers) {
        if (Object.prototype.hasOwnProperty.call(options.headers, hk)) {
          headers[hk] = options.headers[hk];
        }
      }
    }

    var init = {
      method: method,
      headers: headers
    };
    if (method !== 'GET' && method !== 'HEAD' && options.body !== undefined && options.body !== null) {
      if (options.isFormData) {
        init.body = options.body;  // FormData 保留原样（不要 JSON.stringify）
      } else {
        init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      }
    }

    if (window.Loading && typeof window.Loading.show === 'function') {
      window.Loading.show();
    }

    var api = this;

    return fetch(url, init)
      .then(function(res) {
        if (res.status === 401) {
          // ===== P3-19 修复：保存当前 URL，登录后回跳 =====
          try {
            if (window.location && window.location.pathname && window.Auth && typeof window.Auth.isLoggedIn === 'function' && window.Auth.isLoggedIn()) {
              sessionStorage.setItem('lastUrl', window.location.pathname + window.location.search);
            }
          } catch (e) { /* 忽略 */ }
          if (window.Auth && typeof window.Auth.logout === 'function') {
            window.Auth.logout();
          }
          alert('登录已过期');
          return { ok: false, error: { code: 'UNAUTHORIZED', message: '登录已过期' } };
        }
        // ===== P2-A1 修复：识别 413 Payload Too Large 等常见错误码 =====
        if (res.status === 413) {
          notify('文件超过大小限制');
          return { ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: '文件超过大小限制' } };
        }
        if (res.status === 429) {
          return { ok: false, error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' } };
        }
        if (res.status >= 500) {
          notify('服务器错误 (' + res.status + ')');
          return { ok: false, error: { code: 'INTERNAL_ERROR', message: '服务器错误' } };
        }
        // ===== 修复结束 =====
        return res.json().catch(function() {
          return { ok: false, error: { code: 'BAD_JSON', message: '响应格式错误' } };
        }).then(function(data) {
          if (data && data.ok === false) {
            if (data.error) notifyError(data.error);
          }
          return data;
        });
      })
      .catch(function(err) {
        console.error('Network error:', err);
        notify('网络错误');
        return { ok: false, error: { code: 'NETWORK_ERROR', message: err && err.message ? err.message : '网络错误' } };
      })
      .then(function(result) {
        if (window.Loading && typeof window.Loading.hide === 'function') {
          window.Loading.hide();
        }
        return result;
      });
  };

  ApiClient.prototype._unwrap = function(res) {
    return res;
  };

  function makeNs(methods) {
    var ns = {};
    for (var name in methods) {
      if (Object.prototype.hasOwnProperty.call(methods, name)) {
        ns[name] = methods[name];
      }
    }
    return ns;
  }

  var api = new ApiClient();

  api.dashboard = makeNs({
    getStats: function() { return api._request('/dashboard/stats').then(function(r) { return api._unwrap(r); }); }
  });

  api.candidates = makeNs({
    list: function(params) {
      params = params || {};
      var qs = buildQuery({
        keyword: params.keyword,
        status: params.status,
        city: params.city,
        source_channel: params.source_channel,
        years_min: params.years_min,
        years_max: params.years_max,
        education_level: params.education_level,
        industry: params.industry,
        salary_min: params.salary_min,
        salary_max: params.salary_max,
        tag: params.tag,
        has_recommendation: params.has_recommendation,
        sort: params.sort,
        includeDeleted: params.includeDeleted,
        page: params.page,
        pageSize: params.pageSize
      });
      return api._request('/candidates' + qs).then(function(r) { return api._unwrap(r); });
    },
    get: function(id) {
      return api._request('/candidates/' + encodeURIComponent(id)).then(function(r) { return api._unwrap(r); });
    },
    create: function(data) {
      return api._request('/candidates', { method: 'POST', body: data }).then(function(r) { return api._unwrap(r); });
    },
    update: function(id, data) {
      return api._request('/candidates/' + encodeURIComponent(id), { method: 'PUT', body: data }).then(function(r) { return api._unwrap(r); });
    },
    remove: function(id) {
      return api._request('/candidates/' + encodeURIComponent(id), { method: 'DELETE' }).then(function(r) { return api._unwrap(r); });
    },
    checkEmail: function(email, excludeId) {
      var qs = buildQuery({ email: email, id: excludeId });
      return api._request('/candidates/check-email' + qs).then(function(r) { return api._unwrap(r); });
    },
    updateTags: function(id, data) {
      return api._request('/candidates/' + encodeURIComponent(id) + '/tags', { method: 'PUT', body: data }).then(function(r) { return api._unwrap(r); });
    },
    // 工作经历
    listExperiences: function(id) {
      return api._request('/candidates/' + encodeURIComponent(id) + '/experiences').then(function(r) { return api._unwrap(r); });
    },
    createExperience: function(id, data) {
      return api._request('/candidates/' + encodeURIComponent(id) + '/experiences', { method: 'POST', body: data }).then(function(r) { return api._unwrap(r); });
    },
    updateExperience: function(id, eid, data) {
      return api._request('/candidates/' + encodeURIComponent(id) + '/experiences/' + encodeURIComponent(eid), { method: 'PUT', body: data }).then(function(r) { return api._unwrap(r); });
    },
    removeExperience: function(id, eid) {
      return api._request('/candidates/' + encodeURIComponent(id) + '/experiences/' + encodeURIComponent(eid), { method: 'DELETE' }).then(function(r) { return api._unwrap(r); });
    },
    // 教育背景
    listEducations: function(id) {
      return api._request('/candidates/' + encodeURIComponent(id) + '/educations').then(function(r) { return api._unwrap(r); });
    },
    createEducation: function(id, data) {
      return api._request('/candidates/' + encodeURIComponent(id) + '/educations', { method: 'POST', body: data }).then(function(r) { return api._unwrap(r); });
    },
    updateEducation: function(id, eid, data) {
      return api._request('/candidates/' + encodeURIComponent(id) + '/educations/' + encodeURIComponent(eid), { method: 'PUT', body: data }).then(function(r) { return api._unwrap(r); });
    },
    removeEducation: function(id, eid) {
      return api._request('/candidates/' + encodeURIComponent(id) + '/educations/' + encodeURIComponent(eid), { method: 'DELETE' }).then(function(r) { return api._unwrap(r); });
    },
    // 联系记录
    listContacts: function(id) {
      return api._request('/candidates/' + encodeURIComponent(id) + '/contacts').then(function(r) { return api._unwrap(r); });
    },
    createContact: function(id, data) {
      return api._request('/candidates/' + encodeURIComponent(id) + '/contacts', { method: 'POST', body: data }).then(function(r) { return api._unwrap(r); });
    },
    updateContact: function(id, cid, data) {
      return api._request('/candidates/' + encodeURIComponent(id) + '/contacts/' + encodeURIComponent(cid), { method: 'PUT', body: data }).then(function(r) { return api._unwrap(r); });
    },
    removeContact: function(id, cid) {
      return api._request('/candidates/' + encodeURIComponent(id) + '/contacts/' + encodeURIComponent(cid), { method: 'DELETE' }).then(function(r) { return api._unwrap(r); });
    }
  });

  api.jobs = makeNs({
    list: function(params) {
      params = params || {};
      var qs = buildQuery({
        keyword: params.keyword, status: params.status,
        city: params.city, industry: params.industry,
        owner_only: params.owner_only, includeDeleted: params.includeDeleted,
        page: params.page, pageSize: params.pageSize
      });
      return api._request('/jobs' + qs).then(function(r) { return api._unwrap(r); });
    },
    get: function(id) {
      return api._request('/jobs/' + encodeURIComponent(id)).then(function(r) { return api._unwrap(r); });
    },
    create: function(data) {
      return api._request('/jobs', { method: 'POST', body: data }).then(function(r) { return api._unwrap(r); });
    },
    update: function(id, data) {
      return api._request('/jobs/' + encodeURIComponent(id), { method: 'PUT', body: data }).then(function(r) { return api._unwrap(r); });
    },
    remove: function(id) {
      return api._request('/jobs/' + encodeURIComponent(id), { method: 'DELETE' }).then(function(r) { return api._unwrap(r); });
    },
    lookup: function(keyword) {
      var qs = buildQuery({ keyword: keyword });
      return api._request('/jobs/lookup' + qs).then(function(r) { return api._unwrap(r); });
    },
    syncFromPlatform: function() {
      return api._request('/jobs/sync-from-platform').then(function(r) { return api._unwrap(r); });
    }
  });

  api.candidates = makeNs({
    list: function(params) {
      params = params || {};
      var qs = buildQuery({
        keyword: params.keyword, status: params.status,
        city: params.city, source_channel: params.source_channel,
        years_min: params.years_min, years_max: params.years_max,
        education_level: params.education_level, industry: params.industry,
        salary_min: params.salary_min, salary_max: params.salary_max,
        tag: params.tag, has_recommendation: params.has_recommendation,
        sort: params.sort, includeDeleted: params.includeDeleted,
        page: params.page, pageSize: params.pageSize
      });
      return api._request('/candidates' + qs).then(function(r) { return api._unwrap(r); });
    },
    get: function(id) { return api._request('/candidates/' + encodeURIComponent(id)).then(function(r) { return api._unwrap(r); }); },
    create: function(data) { return api._request('/candidates', { method: 'POST', body: data }).then(function(r) { return api._unwrap(r); }); },
    update: function(id, data) { return api._request('/candidates/' + encodeURIComponent(id), { method: 'PUT', body: data }).then(function(r) { return api._unwrap(r); }); },
    remove: function(id) { return api._request('/candidates/' + encodeURIComponent(id), { method: 'DELETE' }).then(function(r) { return api._unwrap(r); }); },
    checkEmail: function(email, excludeId) {
      var qs = buildQuery({ email: email, id: excludeId });
      return api._request('/candidates/check-email' + qs).then(function(r) { return api._unwrap(r); });
    },
    updateTags: function(id, data) {
      return api._request('/candidates/' + encodeURIComponent(id) + '/tags', { method: 'PUT', body: data }).then(function(r) { return api._unwrap(r); });
    },
    listExperiences: function(id) { return api._request('/candidates/' + encodeURIComponent(id) + '/experiences').then(function(r) { return api._unwrap(r); }); },
    createExperience: function(id, data) { return api._request('/candidates/' + encodeURIComponent(id) + '/experiences', { method: 'POST', body: data }).then(function(r) { return api._unwrap(r); }); },
    updateExperience: function(id, eid, data) { return api._request('/candidates/' + encodeURIComponent(id) + '/experiences/' + encodeURIComponent(eid), { method: 'PUT', body: data }).then(function(r) { return api._unwrap(r); }); },
    removeExperience: function(id, eid) { return api._request('/candidates/' + encodeURIComponent(id) + '/experiences/' + encodeURIComponent(eid), { method: 'DELETE' }).then(function(r) { return api._unwrap(r); }); },
    listEducations: function(id) { return api._request('/candidates/' + encodeURIComponent(id) + '/educations').then(function(r) { return api._unwrap(r); }); },
    createEducation: function(id, data) { return api._request('/candidates/' + encodeURIComponent(id) + '/educations', { method: 'POST', body: data }).then(function(r) { return api._unwrap(r); }); },
    updateEducation: function(id, eid, data) { return api._request('/candidates/' + encodeURIComponent(id) + '/educations/' + encodeURIComponent(eid), { method: 'PUT', body: data }).then(function(r) { return api._unwrap(r); }); },
    removeEducation: function(id, eid) { return api._request('/candidates/' + encodeURIComponent(id) + '/educations/' + encodeURIComponent(eid), { method: 'DELETE' }).then(function(r) { return api._unwrap(r); }); },
    listContacts: function(id) { return api._request('/candidates/' + encodeURIComponent(id) + '/contacts').then(function(r) { return api._unwrap(r); }); },
    createContact: function(id, data) { return api._request('/candidates/' + encodeURIComponent(id) + '/contacts', { method: 'POST', body: data }).then(function(r) { return api._unwrap(r); }); },
    updateContact: function(id, cid, data) { return api._request('/candidates/' + encodeURIComponent(id) + '/contacts/' + encodeURIComponent(cid), { method: 'PUT', body: data }).then(function(r) { return api._unwrap(r); }); },
    removeContact: function(id, cid) { return api._request('/candidates/' + encodeURIComponent(id) + '/contacts/' + encodeURIComponent(cid), { method: 'DELETE' }).then(function(r) { return api._unwrap(r); }); },
    batchAction: function(action, ids, params) {
      return api._request('/candidates/batch', { method: 'POST', body: { action: action, ids: ids, params: params || {} } }).then(function(r) { return api._unwrap(r); });
    }
  });

  api.recommendations = makeNs({
    list: function(params) {
      params = params || {};
      var qs = buildQuery({
        candidate_id: params.candidate_id, status: params.status, job_id: params.job_id,
        page: params.page, pageSize: params.pageSize
      });
      return api._request('/recommendations' + qs).then(function(r) { return api._unwrap(r); });
    },
    get: function(id) {
      return api._request('/recommendations/' + encodeURIComponent(id)).then(function(r) { return api._unwrap(r); });
    },
    create: function(data) {
      return api._request('/recommendations', { method: 'POST', body: data }).then(function(r) { return api._unwrap(r); });
    },
    update: function(id, data) {
      return api._request('/recommendations/' + encodeURIComponent(id), { method: 'PUT', body: data }).then(function(r) { return api._unwrap(r); });
    },
    remove: function(id) {
      return api._request('/recommendations/' + encodeURIComponent(id), { method: 'DELETE' }).then(function(r) { return api._unwrap(r); });
    },
    changeStatus: function(id, data) {
      return api._request('/recommendations/' + encodeURIComponent(id) + '/status', { method: 'POST', body: data }).then(function(r) { return api._unwrap(r); });
    },
    overdue: function() {
      return api._request('/recommendations/overdue').then(function(r) { return api._unwrap(r); });
    },
    scanOverdue: function() {
      return api._request('/recommendations/scan-overdue', { method: 'POST' }).then(function(r) { return api._unwrap(r); });
    }
  });

  api.interviews = makeNs({
    list: function(params) {
      params = params || {};
      var qs = buildQuery({ keyword: params.keyword, status: params.status, from: params.from, to: params.to, page: params.page, pageSize: params.pageSize });
      return api._request('/interviews' + qs).then(function(r) { return api._unwrap(r); });
    },
    get: function(id) {
      return api._request('/interviews/' + encodeURIComponent(id)).then(function(r) { return api._unwrap(r); });
    },
    create: function(data) {
      return api._request('/interviews', { method: 'POST', body: data }).then(function(r) { return api._unwrap(r); });
    },
    update: function(id, data) {
      return api._request('/interviews/' + encodeURIComponent(id), { method: 'PUT', body: data }).then(function(r) { return api._unwrap(r); });
    },
    remove: function(id) {
      return api._request('/interviews/' + encodeURIComponent(id), { method: 'DELETE' }).then(function(r) { return api._unwrap(r); });
    }
  });

  api.imports = {
    template: function() {
      return fetch('/api/v1/imports/template', { headers: { 'Authorization': 'Bearer ' + (window.Auth.getToken ? window.Auth.getToken() : '') } }).then(function(r) { return r.blob(); });
    },
    preview: function(file) {
      var fd = new FormData();
      fd.append('file', file);
      return api._request('/imports/preview', { method: 'POST', body: fd, isFormData: true }).then(function(r) { return api._unwrap(r); });
    },
    commit: function(file, mapping, skipDuplicates) {
      var fd = new FormData();
      fd.append('file', file);
      fd.append('mapping', JSON.stringify(mapping || {}));
      fd.append('skipDuplicates', skipDuplicates !== false ? 'true' : 'false');
      return api._request('/imports/commit', { method: 'POST', body: fd, isFormData: true }).then(function(r) { return api._unwrap(r); });
    }
  };

  api.tags = makeNs({
    list: function(params) {
      params = params || {};
      var qs = buildQuery({ keyword: params.keyword });
      return api._request('/tags' + qs).then(function(r) { return api._unwrap(r); });
    },
    candidates: function(name) {
      return api._request('/tags/' + encodeURIComponent(name) + '/candidates').then(function(r) { return api._unwrap(r); });
    },
    rename: function(oldName, newName) {
      return api._request('/tags/' + encodeURIComponent(oldName) + '/rename', { method: 'PUT', body: { new_name: newName } }).then(function(r) { return api._unwrap(r); });
    },
    remove: function(name) {
      return api._request('/tags/' + encodeURIComponent(name), { method: 'DELETE' }).then(function(r) { return api._unwrap(r); });
    },
    merge: function(from, to) {
      return api._request('/tags/merge', { method: 'POST', body: { from: from, to: to } }).then(function(r) { return api._unwrap(r); });
    }
  });

  api.reports = makeNs({
    kpi: function() {
      return api._request('/reports/kpi').then(function(r) { return api._unwrap(r); });
    },
    funnel: function(days) {
      var qs = buildQuery({ days: days });
      return api._request('/reports/funnel' + qs).then(function(r) { return api._unwrap(r); });
    },
    consultantPerformance: function(days) {
      var qs = buildQuery({ days: days });
      return api._request('/reports/consultant-performance' + qs).then(function(r) { return api._unwrap(r); });
    },
    statusDistribution: function() {
      return api._request('/reports/status-distribution').then(function(r) { return api._unwrap(r); });
    }
  });

  api.tasks = makeNs({
    list: function(params) {
      params = params || {};
      var qs = buildQuery({ status: params.status, priority: params.priority, page: params.page, pageSize: params.pageSize });
      return api._request('/tasks' + qs).then(function(r) { return api._unwrap(r); });
    },
    create: function(data) {
      return api._request('/tasks', { method: 'POST', body: data }).then(function(r) { return api._unwrap(r); });
    },
    update: function(id, data) {
      return api._request('/tasks/' + encodeURIComponent(id), { method: 'PUT', body: data }).then(function(r) { return api._unwrap(r); });
    },
    remove: function(id) {
      return api._request('/tasks/' + encodeURIComponent(id), { method: 'DELETE' }).then(function(r) { return api._unwrap(r); });
    }
  });

  api.clients = makeNs({
    list: function(params) {
      params = params || {};
      var qs = buildQuery({ keyword: params.keyword, page: params.page, pageSize: params.pageSize, includeDeleted: params.includeDeleted });
      return api._request('/clients' + qs).then(function(r) { return api._unwrap(r); });
    },
    get: function(id) {
      return api._request('/clients/' + encodeURIComponent(id)).then(function(r) { return api._unwrap(r); });
    },
    create: function(data) {
      return api._request('/clients', { method: 'POST', body: data }).then(function(r) { return api._unwrap(r); });
    },
    update: function(id, data) {
      return api._request('/clients/' + encodeURIComponent(id), { method: 'PUT', body: data }).then(function(r) { return api._unwrap(r); });
    },
    remove: function(id) {
      return api._request('/clients/' + encodeURIComponent(id), { method: 'DELETE' }).then(function(r) { return api._unwrap(r); });
    },
    lookup: function() {
      return api._request('/clients/lookup').then(function(r) { return api._unwrap(r); });
    },
    getNotes: function(id) {
      return api._request('/clients/' + encodeURIComponent(id) + '/notes').then(function(r) { return api._unwrap(r); });
    },
    addNote: function(id, data) {
      return api._request('/clients/' + encodeURIComponent(id) + '/notes', { method: 'POST', body: data }).then(function(r) { return api._unwrap(r); });
    },
    updateNote: function(id, nid, data) {
      return api._request('/clients/' + encodeURIComponent(id) + '/notes/' + encodeURIComponent(nid), { method: 'PUT', body: data }).then(function(r) { return api._unwrap(r); });
    },
    removeNote: function(id, nid) {
      return api._request('/clients/' + encodeURIComponent(id) + '/notes/' + encodeURIComponent(nid), { method: 'DELETE' }).then(function(r) { return api._unwrap(r); });
    }
  });

  api.auth = makeNs({
    login: function(username, password) {
      return api._request('/auth/login', { method: 'POST', body: { username: username, password: password }, skipAuth: true }).then(function(r) { return api._unwrap(r); });
    },
    register: function(username, password, displayName, role) {
      return api._request('/auth/register', { method: 'POST', body: { username: username, password: password, displayName: displayName, role: role } }).then(function(r) { return api._unwrap(r); });
    },
    me: function() {
      return api._request('/auth/me').then(function(r) { return api._unwrap(r); });
    },
    logout: function() {
      var promise = api._request('/auth/logout', { method: 'POST' }).then(function(r) { return api._unwrap(r); });
      if (window.Auth && typeof window.Auth.clear === 'function') {
        window.Auth.clear();
      }
      return promise;
    },
    changePassword: function(oldPassword, newPassword) {
      return api._request('/auth/change-password', { method: 'POST', body: { old_password: oldPassword, new_password: newPassword } }).then(function(r) { return api._unwrap(r); });
    }
  });

  api.users = makeNs({
    get: function(id) {
      return api._request('/auth/users/' + encodeURIComponent(id)).then(function(r) { return api._unwrap(r); });
    },
    update: function(id, data) {
      return api._request('/auth/users/' + encodeURIComponent(id), { method: 'PUT', body: data }).then(function(r) { return api._unwrap(r); });
    }
  });

  window.API = api;
})();