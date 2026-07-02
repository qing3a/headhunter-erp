// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('settings page', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.API = {
      users: { update: vi.fn() },
      auth: { changePassword: vi.fn() },
    };
    globalThis.UI = {
      showToast: vi.fn(),
      showModal: vi.fn(),
      showConfirm: vi.fn(({ onConfirm }) => onConfirm && onConfirm()),
    };
    globalThis.Auth = {
      isLoggedIn: vi.fn(() => true),
      requireLogin: vi.fn(),
      getUser: vi.fn(() => ({
        id: 1,
        username: 'admin',
        displayName: 'Admin User',
        email: 'admin@test.com',
      })),
      logout: vi.fn(),
    };
    globalThis.Loading = { show: vi.fn(), hide: vi.fn() };

    if (!globalThis.localStorage) {
      const memStore = new Map();
      globalThis.localStorage = {
        getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
        setItem: (k, v) => memStore.set(k, String(v)),
        removeItem: (k) => memStore.delete(k),
        clear: () => memStore.clear(),
      };
    }
    globalThis.localStorage.clear();

    document.body.innerHTML = `
      <div id="pageContent">
        <nav class="settings-nav">
          <a class="settings-nav-item" data-settings-tab="profile"></a>
          <a class="settings-nav-item" data-settings-tab="notifications"></a>
        </nav>
        <div class="settings-panel" data-settings-panel="profile">
          <form id="profileForm">
            <input placeholder="请输入姓名">
            <input placeholder="请输入邮箱">
            <input type="password">
            <button type="submit">保存</button>
          </form>
          <form id="passwordForm">
            <input type="password">
            <input type="password">
            <input type="password">
            <button type="submit">修改密码</button>
          </form>
        </div>
        <div class="settings-panel" data-settings-panel="notifications" style="display:none">
          <div class="switch"><input type="checkbox" data-key="email"></div>
          <div class="switch"><input type="checkbox" data-key="sms"></div>
          <div class="switch"><input type="checkbox" data-key="site"></div>
          <div class="switch"><input type="checkbox" data-key="interview"></div>
          <div class="switch"><input type="checkbox" data-key="candidate"></div>
          <button type="button" id="savePreferencesBtn">保存偏好</button>
        </div>
      </div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('init: loadNotifPrefs reads localStorage + toggles checkboxes', async () => {
    globalThis.localStorage.setItem(
      'erp_notification_prefs',
      JSON.stringify({ channels: { email: true, sms: false, site: true }, types: { interview: true } })
    );

    await import('../../public/pages/settings.js');
    await new Promise((r) => setTimeout(r, 50));

    const panel = document.querySelector('[data-settings-panel="notifications"]');
    const emailBox = panel.querySelector('[data-key="email"]');
    const smsBox = panel.querySelector('[data-key="sms"]');
    const siteBox = panel.querySelector('[data-key="site"]');
    expect(emailBox.checked).toBe(true);
    expect(smsBox.checked).toBe(false);
    expect(siteBox.checked).toBe(true);
  });

  it('saveNotifPrefs: click save button → write localStorage + toast', async () => {
    await import('../../public/pages/settings.js');
    await new Promise((r) => setTimeout(r, 50));

    const panel = document.querySelector('[data-settings-panel="notifications"]');
    const emailBox = panel.querySelector('[data-key="email"]');
    emailBox.checked = true;

    document.getElementById('savePreferencesBtn').click();
    await new Promise((r) => setTimeout(r, 20));

    const saved = JSON.parse(globalThis.localStorage.getItem('erp_notification_prefs'));
    expect(saved).toBeTruthy();
    expect(saved.channels.email).toBe(true);
    expect(globalThis.UI.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' })
    );
  });

  it('saveProfile: submit profile form → API.users.update', async () => {
    globalThis.API.users.update.mockResolvedValue({ ok: true, data: { id: 1 } });

    await import('../../public/pages/settings.js');
    await new Promise((r) => setTimeout(r, 50));

    const form = document.getElementById('profileForm');
    const nameInput = form.querySelector('input[placeholder="请输入姓名"]');
    nameInput.value = 'NewName';

    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));

    expect(globalThis.API.users.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ displayName: 'NewName' })
    );
  });
});