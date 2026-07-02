/**
 * 候选人表单 modal（共享：候选池"新建/编辑"按钮 + 详情页"编辑"按钮）
 * 用法：window.CandidateForm.open({ mode: 'create' | 'edit', candidate: {...}, onSaved: fn })
 */
(function () {
  var STATUS_OPTIONS = [
    { value: 'active', label: '活跃求职' },
    { value: 'passive', label: '被动考虑' },
    { value: 'placed', label: '已入职' },
    { value: 'unavailable', label: '暂不考虑' },
    { value: 'blacklist', label: '黑名单' }
  ];
  var EDUCATION_OPTIONS = [
    { value: '', label: '不填' },
    { value: 'highschool', label: '高中' },
    { value: 'bachelor', label: '本科' },
    { value: 'master', label: '硕士' },
    { value: 'phd', label: '博士' },
    { value: 'other', label: '其他' }
  ];
  var GENDER_OPTIONS = [
    { value: '', label: '不填' },
    { value: 'male', label: '男' },
    { value: 'female', label: '女' },
    { value: 'other', label: '其他' }
  ];
  var SOURCE_OPTIONS = [
    { value: '', label: '不填' },
    { value: 'linkedin', label: 'LinkedIn' },
    { value: 'referral', label: '朋友推荐' },
    { value: 'website', label: '官网投递' },
    { value: 'headhunter', label: '其他猎头' },
    { value: 'other', label: '其他' }
  ];
  var AVAILABLE_OPTIONS = [
    { value: 'immediate', label: '立即到岗' },
    { value: 'two_weeks', label: '2 周内' },
    { value: 'one_month', label: '1 个月内' },
    { value: 'three_months', label: '3 个月内' },
    { value: '', label: '暂未确定' }
  ];

  function buildOptions(list, selected) {
    return list.map(function (o) {
      var sel = String(o.value) === String(selected || '') ? ' selected' : '';
      return '<option value="' + escapeAttr(o.value) + '"' + sel + '>' + escapeHtml(o.label) + '</option>';
    }).join('');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function renderForm(c) {
    c = c || {};
    return '' +
      '<form id="candidateForm" class="form" autocomplete="off">' +
        '<fieldset>' +
          '<legend>基础信息</legend>' +
          '<div class="form-row">' +
            '<div class="form-group">' +
              '<label class="form-label required">姓名</label>' +
              '<input class="form-input" name="name" required value="' + escapeAttr(c.name) + '">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">性别</label>' +
              '<select class="form-select" name="gender">' + buildOptions(GENDER_OPTIONS, c.gender) + '</select>' +
            '</div>' +
          '</div>' +
          '<div class="form-row">' +
            '<div class="form-group">' +
              '<label class="form-label">手机号</label>' +
              '<input class="form-input" name="phone" data-type="phone" value="' + escapeAttr(c.phone) + '">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">邮箱</label>' +
              '<input class="form-input" name="email" type="email" id="candEmailInput" value="' + escapeAttr(c.email) + '">' +
              '<div class="form-help" id="candEmailCheck"></div>' +
            '</div>' +
          '</div>' +
        '</fieldset>' +

        '<fieldset>' +
          '<legend>当前职位</legend>' +
          '<div class="form-row">' +
            '<div class="form-group">' +
              '<label class="form-label">当前职位</label>' +
              '<input class="form-input" name="current_position" value="' + escapeAttr(c.current_position) + '">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">当前公司</label>' +
              '<input class="form-input" name="current_company" value="' + escapeAttr(c.current_company) + '">' +
            '</div>' +
          '</div>' +
          '<div class="form-row">' +
            '<div class="form-group">' +
              '<label class="form-label">工作年限</label>' +
              '<input class="form-input" name="years_of_experience" type="number" min="0" max="50" value="' + escapeAttr(c.years_of_experience) + '">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">学历</label>' +
              '<select class="form-select" name="education_level">' + buildOptions(EDUCATION_OPTIONS, c.education_level) + '</select>' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">所在城市</label>' +
              '<input class="form-input" name="current_city" value="' + escapeAttr(c.current_city) + '">' +
            '</div>' +
          '</div>' +
        '</fieldset>' +

        '<fieldset>' +
          '<legend>求职意向</legend>' +
          '<div class="form-row">' +
            '<div class="form-group">' +
              '<label class="form-label">期望职位</label>' +
              '<input class="form-input" name="expected_position" value="' + escapeAttr(c.expected_position) + '">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">期望行业</label>' +
              '<input class="form-input" name="expected_industry" value="' + escapeAttr(c.expected_industry) + '">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">期望城市</label>' +
              '<input class="form-input" name="expected_city" value="' + escapeAttr(c.expected_city) + '">' +
            '</div>' +
          '</div>' +
          '<div class="form-row">' +
            '<div class="form-group">' +
              '<label class="form-label">期望薪资（k 起步）</label>' +
              '<input class="form-input" name="expected_salary_min" type="number" min="0" value="' + escapeAttr(c.expected_salary_min) + '">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">期望薪资（k 上限）</label>' +
              '<input class="form-input" name="expected_salary_max" type="number" min="0" value="' + escapeAttr(c.expected_salary_max) + '">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">到岗时间</label>' +
              '<select class="form-select" name="available_at">' + buildOptions(AVAILABLE_OPTIONS, c.available_at) + '</select>' +
            '</div>' +
          '</div>' +
        '</fieldset>' +

        '<fieldset>' +
          '<legend>状态 / 来源</legend>' +
          '<div class="form-row">' +
            '<div class="form-group">' +
              '<label class="form-label">求职状态</label>' +
              '<select class="form-select" name="status">' + buildOptions(STATUS_OPTIONS, c.status || 'active') + '</select>' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">来源渠道</label>' +
              '<select class="form-select" name="source_channel">' + buildOptions(SOURCE_OPTIONS, c.source_channel) + '</select>' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">来源详情</label>' +
              '<input class="form-input" name="source_detail" value="' + escapeAttr(c.source_detail) + '">' +
            '</div>' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">备注</label>' +
            '<textarea class="form-textarea" name="notes" rows="3">' + escapeHtml(c.notes || '') + '</textarea>' +
          '</div>' +
        '</fieldset>' +
      '</form>';
  }

  function collectData(form) {
    var data = {};
    var fields = ['name', 'gender', 'phone', 'email',
      'current_position', 'current_company', 'years_of_experience', 'education_level', 'current_city',
      'expected_salary_min', 'expected_salary_max', 'expected_position', 'expected_industry', 'expected_city',
      'available_at', 'status', 'source_channel', 'source_detail', 'notes'];
    fields.forEach(function (f) {
      var v = form.elements[f].value;
      if (v !== '') data[f] = v;
    });
    if (data.years_of_experience !== undefined) data.years_of_experience = parseInt(data.years_of_experience) || 0;
    if (data.expected_salary_min !== undefined) data.expected_salary_min = parseInt(data.expected_salary_min) || 0;
    if (data.expected_salary_max !== undefined) data.expected_salary_max = parseInt(data.expected_salary_max) || 0;
    return data;
  }

  function attachEmailCheck(form, editId) {
    var input = form.querySelector('#candEmailInput');
    var hint = form.querySelector('#candEmailCheck');
    if (!input || !hint) return;
    var timer;
    function clear() { hint.textContent = ''; hint.className = 'form-help'; }
    input.addEventListener('input', function () { clear(); clearTimeout(timer); });
    input.addEventListener('blur', function () {
      var email = String(input.value || '').trim();
      if (!email) { clear(); return; }
      timer = setTimeout(function () {
        if (!window.API || !window.API.candidates) return;
        window.API.candidates.checkEmail(email, editId).then(function (r) {
          if (!r || !r.data) return;
          if (r.data.available) {
            hint.textContent = '✓ 邮箱可用';
            hint.className = 'form-help text-success';
          } else {
            hint.textContent = '✗ 邮箱已被使用';
            hint.className = 'form-help text-error';
          }
        });
      }, 250);
    });
  }

  function handleConfirm(mode, editId, onSaved) {
    var form = document.getElementById('candidateForm');
    if (!form) return;
    if (!window.UI || !window.UI.validateForm(form)) return;
    var data = collectData(form);
    var btn = document.querySelector('.modal.show [data-action="confirm"]');
    if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }
    var p = mode === 'edit'
      ? window.API.candidates.update(editId, data)
      : window.API.candidates.create(data);
    p.then(function (r) {
      if (r && r.ok) {
        if (window.UI && window.UI.showToast) {
          window.UI.showToast({ type: 'success', title: '成功', message: '已保存' });
        }
        // modal 已被 onConfirm 触发 close，无需再调
        if (typeof onSaved === 'function') onSaved(r.data);
      } else {
        if (btn) { btn.disabled = false; btn.textContent = '保存'; }
      }
    }).catch(function () {
      if (btn) { btn.disabled = false; btn.textContent = '保存'; }
    });
  }

  function open(options) {
    options = options || {};
    var mode = options.mode || 'create';
    var candidate = options.candidate || {};
    var onSaved = options.onSaved;

    if (!window.UI || !window.UI.showModal) {
      console.error('UI not loaded');
      return;
    }
    if (!window.API || !window.API.candidates) {
      console.error('API not loaded');
      return;
    }

    var title = mode === 'edit' ? '编辑候选人' : '新建候选人';
    var editId = mode === 'edit' ? candidate.id : null;

    var content =
      '<div class="candidate-form-wrapper">' +
        renderForm(candidate) +
      '</div>';

    var modal = window.UI.showModal({
      title: title,
      content: content,
      confirmText: '保存',
      cancelText: '取消',
      showCancel: true,
      width: 720,
      onConfirm: function () { handleConfirm(mode, editId, onSaved); }
    });

    var form = document.getElementById('candidateForm');
    if (!form) return;
    attachEmailCheck(form, editId);

    return modal;
  }

  window.CandidateForm = { open: open };
})();
