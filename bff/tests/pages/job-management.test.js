// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('job-management page', () => {
  beforeEach(() => {
    vi.resetModules();
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
      jobs: { list: vi.fn() },
    };
    globalThis.UI = {
      showToast: vi.fn(),
      showModal: vi.fn(),
      showConfirm: vi.fn(({ onConfirm }) => onConfirm && onConfirm()),
      showPageLoading: vi.fn(),
      hidePageLoading: vi.fn(),
      parseDateTime: vi.fn((s) => new Date(s)),
    };
    globalThis.Auth = {
      isLoggedIn: vi.fn(() => true),
      requireLogin: vi.fn(),
      getUser: vi.fn(() => ({ id: 1 })),
    };
    globalThis.Router = { navigate: vi.fn(), getParam: vi.fn() };

    document.body.innerHTML = `
      <div id="pageContent">
        <input type="text" id="searchInput" placeholder="搜索...">
        <div id="statusTabs">
          <div class="filter-tab" data-status=""></div>
          <div class="filter-tab" data-status="open"></div>
        </div>
        <button id="advancedFilterBtn"></button>
        <div id="advancedFilterPanel" style="display:none"></div>
        <button id="applyFilterBtn"></button>
        <button id="closeFilterPanel"></button>
        <span id="filterCount" style="display:none">0</span>
        <span id="filterResultCount">0</span>
        <div id="dateRange" style="display:none"><input id="dateStart"><input id="dateEnd"></div>
        <input id="salaryMin" type="number"><input id="salaryMax" type="number">
        <select id="clientSelect"></select>
        <button id="resetFilterBtn"></button>
        <div id="citySelect"><div class="multi-select-trigger"></div></div>
        <div class="grid grid-cols-2 gap-5 mb-6" id="jobList"></div>
        <div id="pagination"></div>
        <div class="batch-action-bar" id="batchActionBar"><span id="selectedCount">0</span></div>
        <input type="checkbox" id="selectAllJobs">
      </div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    globalThis.__domReadyCallbacks = [];
  });

  it('init: loadJobs calls API.jobs.list + renders job list', async () => {
    globalThis.API.jobs.list.mockResolvedValue({
      ok: true,
      data: [
        { id: 1, title: 'Senior Engineer', employer_name: 'Acme', status: 'open' },
        { id: 2, title: 'PM', employer_name: 'Beta', status: 'open' },
      ],
      meta: { total: 2 },
    });

    await import('../../public/pages/job-management.js');
    await new Promise((r) => setTimeout(r, 50));
    for (const cb of globalThis.__domReadyCallbacks) cb();
    await new Promise((r) => setTimeout(r, 100));

    expect(globalThis.API.jobs.list).toHaveBeenCalled();
    expect(document.getElementById('jobList').innerHTML).toContain('Senior Engineer');
    expect(document.getElementById('jobList').innerHTML).toContain('PM');
  });

  it('search: keyword input triggers API.jobs.list with params.keyword', async () => {
    globalThis.API.jobs.list.mockResolvedValue({ ok: true, data: [], meta: { total: 0 } });

    await import('../../public/pages/job-management.js');
    await new Promise((r) => setTimeout(r, 50));
    for (const cb of globalThis.__domReadyCallbacks) cb();
    await new Promise((r) => setTimeout(r, 100));

    const input = document.getElementById('searchInput');
    input.value = 'engineer';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    await new Promise((r) => setTimeout(r, 400));

    expect(globalThis.API.jobs.list.mock.calls.length).toBeGreaterThanOrEqual(2);
    const lastCall = globalThis.API.jobs.list.mock.calls.slice(-1)[0][0];
    expect(lastCall.keyword).toBe('engineer');
  });
});