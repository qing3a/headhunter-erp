const UI = {
  showModal(options = {}) {
    const {
      title = '提示',
      content = '',
      confirmText = '确定',
      cancelText = '取消',
      showCancel = true,
      type = 'default',
      onConfirm = null,
      onCancel = null,
      width = null
    } = options;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';
    if (width) modal.style.maxWidth = width;

    let iconHtml = '';
    if (type === 'success') {
      iconHtml = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--state-success); width: 48px; height: 48px; margin: 0 auto 16px; display: block;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    } else if (type === 'warning') {
      iconHtml = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--state-warning); width: 48px; height: 48px; margin: 0 auto 16px; display: block;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    } else if (type === 'error') {
      iconHtml = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--state-error); width: 48px; height: 48px; margin: 0 auto 16px; display: block;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    }

    modal.innerHTML = `
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close-btn" data-action="cancel">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        ${iconHtml}
        <div class="modal-content-text">${content}</div>
      </div>
      <div class="modal-footer">
        ${showCancel ? `<button class="btn btn-secondary" data-action="cancel">${cancelText}</button>` : ''}
        <button class="btn btn-primary" data-action="confirm">${confirmText}</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add('show');
    });

    const close = (result) => {
      overlay.classList.remove('show');
      setTimeout(() => {
        overlay.remove();
      }, 200);
      if (result === 'confirm' && onConfirm) onConfirm();
      if (result === 'cancel' && onCancel) onCancel();
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('cancel');
    });

    modal.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        close(btn.dataset.action);
      });
    });

    return { close: () => close('cancel') };
  },

  showConfirm(options = {}) {
    return this.showModal({
      ...options,
      type: 'warning',
      showCancel: true
    });
  },

  showToast(options = {}) {
    const {
      type = 'info',
      title = '',
      message = '',
      duration = 3000
    } = options;

    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconPath = '';
    switch (type) {
      case 'success':
        iconPath = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>';
        break;
      case 'warning':
        iconPath = '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>';
        break;
      case 'error':
        iconPath = '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
        break;
      default:
        iconPath = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>';
    }

    toast.innerHTML = `
      <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        ${iconPath}
      </svg>
      <div class="toast-content">
        ${title ? `<div class="toast-title">${title}</div>` : ''}
        ${message ? `<div class="toast-message">${message}</div>` : ''}
      </div>
      <button class="toast-close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    const close = () => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.remove();
      }, 300);
    };

    toast.querySelector('.toast-close').addEventListener('click', close);

    if (duration > 0) {
      setTimeout(close, duration);
    }

    return { close };
  },

  showPageLoading() {
    let loading = document.querySelector('.page-loading');
    if (loading) return;

    loading = document.createElement('div');
    loading.className = 'page-loading';
    loading.innerHTML = '<div class="loading-spinner lg"></div>';
    document.body.appendChild(loading);
  },

  hidePageLoading() {
    const loading = document.querySelector('.page-loading');
    if (loading) loading.remove();
  },

  initDropdowns() {
    document.querySelectorAll('[data-dropdown-toggle]').forEach(toggle => {
      const menuId = toggle.dataset.dropdownToggle;
      const menu = document.getElementById(menuId);
      if (!menu) return;

      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = menu.classList.contains('show');
        this.closeAllDropdowns();
        if (!isOpen) {
          menu.classList.add('show');
        }
      });
    });

    document.addEventListener('click', () => {
      this.closeAllDropdowns();
    });

    document.querySelectorAll('.dropdown-menu').forEach(menu => {
      menu.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });
  },

  closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
      menu.classList.remove('show');
    });
  },

  initTabs() {
    document.querySelectorAll('.tabs').forEach(tabsContainer => {
      const tabs = tabsContainer.querySelectorAll('.tab-item');
      const tabContents = document.querySelectorAll('[data-tab-content]');

      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const targetTab = tab.dataset.tab;

          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');

          tabContents.forEach(content => {
            content.classList.remove('active');
            if (content.dataset.tabContent === targetTab) {
              content.classList.add('active');
            }
          });
        });
      });
    });
  },

  initTagInput() {
    document.querySelectorAll('.tag-input-container').forEach(container => {
      const input = container.querySelector('.tag-input');
      if (!input) return;

      const addTag = (text) => {
        text = text.trim();
        if (!text) return;

        const existingTags = container.querySelectorAll('.tag');
        for (const tag of existingTags) {
          if (tag.textContent.trim() === text) return;
        }

        const tag = document.createElement('span');
        tag.className = 'tag primary';
        tag.innerHTML = `
          ${text}
          <span class="tag-close">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </span>
        `;

        tag.querySelector('.tag-close').addEventListener('click', (e) => {
          e.stopPropagation();
          tag.remove();
        });

        container.insertBefore(tag, input);
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          addTag(input.value);
          input.value = '';
        } else if (e.key === 'Backspace' && !input.value) {
          const tags = container.querySelectorAll('.tag');
          if (tags.length > 0) {
            tags[tags.length - 1].remove();
          }
        }
      });

      input.addEventListener('blur', () => {
        if (input.value.trim()) {
          addTag(input.value);
          input.value = '';
        }
      });

      container.addEventListener('click', () => {
        input.focus();
      });
    });
  },

  initFileUpload() {
    document.querySelectorAll('.file-upload-area').forEach(area => {
      const input = area.querySelector('input[type="file"]');

      area.addEventListener('click', () => {
        if (input) input.click();
      });

      area.addEventListener('dragover', (e) => {
        e.preventDefault();
        area.classList.add('dragover');
      });

      area.addEventListener('dragleave', () => {
        area.classList.remove('dragover');
      });

      area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0 && input) {
          input.files = files;
        }
      });
    });
  },

  initLazyLoad() {
    // Lazy load images with data-src attribute
    const lazyImages = document.querySelectorAll('img[data-src]');

    if ('IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.classList.add('lazy-image', 'loaded');
            imageObserver.unobserve(img);
          }
        });
      });

      lazyImages.forEach(img => imageObserver.observe(img));
    } else {
      // Fallback for older browsers
      lazyImages.forEach(img => {
        img.src = img.dataset.src;
        img.classList.add('lazy-image', 'loaded');
      });
    }
  },

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  },

  // ===== v2-1 (P3-1) 修复：后端 datetime('now') 输出 'YYYY-MM-DD HH:MM:SS'（无时区）=====
  // 加 'Z' 让 new Date 解析为 UTC（标准 ISO 8601），前端按本地时区显示
  parseDateTime(utcStr) {
    if (!utcStr) return new Date(NaN);
    if (typeof utcStr !== 'string') return new Date(utcStr);
    // 已是 ISO 8601 格式（含 T）直接用
    if (utcStr.indexOf('T') >= 0) {
      // 没 Z 后缀就加（SQLite datetime 不带时区）
      return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(utcStr) ? utcStr : utcStr + 'Z');
    }
    // 'YYYY-MM-DD HH:MM:SS' → 替换空格为 T 并加 Z
    return new Date(utcStr.replace(' ', 'T') + 'Z');
  },

  formatDate(date, format = 'YYYY-MM-DD') {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    return format
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes);
  },

  validateForm(formElement) {
    let isValid = true;
    const errors = [];
    
    // Required fields
    formElement.querySelectorAll('[required]').forEach(input => {
      const value = input.value.trim();
      const label = input.closest('.form-group')?.querySelector('.form-label')?.textContent || input.name;
      
      if (!value) {
        isValid = false;
        errors.push(`${label} 不能为空`);
        input.classList.add('error');
        input.addEventListener('input', () => input.classList.remove('error'), { once: true });
      }
    });
    
    // Email validation
    formElement.querySelectorAll('[type="email"]').forEach(input => {
      if (input.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) {
        isValid = false;
        errors.push('邮箱格式不正确');
        input.classList.add('error');
      }
    });
    
    // Phone validation
    formElement.querySelectorAll('[data-type="phone"]').forEach(input => {
      if (input.value && !/^1[3-9]\d{9}$/.test(input.value)) {
        isValid = false;
        errors.push('手机号格式不正确');
        input.classList.add('error');
      }
    });
    
    // Password strength
    formElement.querySelectorAll('[data-type="password"]').forEach(input => {
      if (input.value && input.value.length < 6) {
        isValid = false;
        errors.push('密码至少6位');
        input.classList.add('error');
      }
    });
    
    return { isValid, errors };
  },

  showFieldError(input, message) {
    const group = input.closest('.form-group');
    if (!group) return;
    
    // Remove existing error
    group.querySelector('.form-error')?.remove();
    
    // Add error message
    const error = document.createElement('div');
    error.className = 'form-error';
    error.textContent = message;
    group.appendChild(error);
    
    // Highlight input
    input.classList.add('error');
    
    // Remove on input
    input.addEventListener('input', () => {
      error.remove();
      input.classList.remove('error');
    }, { once: true });
  },

  clearFieldErrors(form) {
    form.querySelectorAll('.form-error').forEach(el => el.remove());
    form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
  },

  getInitials(name) {
    if (!name) return '';
    return name
      .split(/\s+/)
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  UI.initDropdowns();
  UI.initTabs();
  UI.initTagInput();
  UI.initFileUpload();
  UI.initLazyLoad();
});
