// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('notifications page', () => {
  beforeEach(() => {
    vi.resetModules();
    // Capture DOMContentLoaded callbacks
    globalThis.__domReadyCallbacks = [];
    // Intercept DOMContentLoaded to prevent cross-test contamination
    document.addEventListener = function (event, cb, opts) {
      if (event === 'DOMContentLoaded' && typeof cb === 'function') {
        globalThis.__domReadyCallbacks.push(cb);
        return;
      }
      return document.__proto__.addEventListener.call(document, event, cb, opts);
    };
    globalThis.API = {
      notifications: {
        list: vi.fn(),
        markRead: vi.fn(),
        markAllRead: vi.fn(),
        remove: vi.fn(),
      },
      interviews: { list: vi.fn() },
      jobs: { list: vi.fn() },
      candidates: { list: vi.fn() },
      reports: { kpi: vi.fn(), funnel: vi.fn(), statusDistribution: vi.fn(), consultantPerformance: vi.fn() },
      tags: { list: vi.fn() },
      users: { update: vi.fn() },
      auth: { changePassword: vi.fn() },
      imports: { preview: vi.fn(), commit: vi.fn() },
      recommendations: { create: vi.fn(), list: vi.fn() },
      clients: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), addNote: vi.fn(), updateNote: vi.fn(), removeNote: vi.fn() },
      dashboard: { getStats: vi.fn() },
      tasks: { list: vi.fn() },
    };
    globalThis.UI = {
      showToast: vi.fn(),
      showModal: vi.fn(),
      showConfirm: vi.fn(({ onConfirm }) => onConfirm && onConfirm()),
    };
    globalThis.Auth = {
      isLoggedIn: vi.fn(() => true),
      requireLogin: vi.fn(),
      getUser: vi.fn(() => ({ id: 1 })),
    };

    document.body.innerHTML = `
      <div id="pageContent">
        <span id="unreadCount">0</span>
        <button id="settingsBtn">Settings</button>
        <button id="batchModeBtn">Batch</button>
        <button id="markAllReadBtn">Mark all</button>
        <input type="text" id="searchInput">
        <div id="batchActionBar" style="display: none;">
          <input type="checkbox" id="selectAllMessages">
          <span id="selectedMsgCount">0</span>
          <button id="batchMarkReadBtn">Mark</button>
          <button id="batchDeleteBtn">Delete</button>
          <button id="cancelBatchBtn">Cancel</button>
        </div>
        <div class="message-list" id="messageList">
          <div class="message-item unread" data-category="system" data-id="1">
            <span class="message-title">Test</span>
            <span class="message-time">2026-01-01</span>
            <span class="message-summary">summary</span>
            <span class="mark-read"></span>
            <span class="delete"></span>
          </div>
        </div>
        <div class="category-item" data-category="all"><span class="category-badge"></span></div>
        <div class="category-item" data-category="system"><span class="category-badge"></span></div>
        <div id="emptyState" style="display: none;"></div>
        <div id="detailModal" style="display:none">
          <span id="detailTitle"></span>
          <span id="detailTime"></span>
          <span id="detailCategory"></span>
          <div id="detailContent"></div>
          <button id="detailPrevBtn"></button>
          <button id="detailNextBtn"></button>
        </div>
        <div id="settingsModal" style="display:none">
          <input type="checkbox" data-key="email">
          <input type="checkbox" data-key="sms">
        </div>
      </div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    globalThis.__domReadyCallbacks = [];
  });

  it('init: page loads without errors', async () => {
    await import('../../public/pages/notifications.js');
    await new Promise((r) => setTimeout(r, 50));
    for (const cb of globalThis.__domReadyCallbacks) cb();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.getElementById('messageList')).toBeTruthy();
  });

  it('markAllReadBtn: click triggers UI.showToast', async () => {
    await import('../../public/pages/notifications.js');
    await new Promise((r) => setTimeout(r, 50));
    for (const cb of globalThis.__domReadyCallbacks) cb();
    await new Promise((r) => setTimeout(r, 50));

    document.getElementById('markAllReadBtn').click();
    await new Promise((r) => setTimeout(r, 30));

    expect(globalThis.UI.showToast).toHaveBeenCalled();
  });
});