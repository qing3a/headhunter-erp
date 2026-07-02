// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('candidate-pool page', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.API = {
      candidates: {
        list: vi.fn(),
        get: vi.fn(),
        remove: vi.fn(),
        batchAction: vi.fn(),
      },
    };
    globalThis.UI = {
      showToast: vi.fn(),
      showModal: vi.fn(),
      showConfirm: vi.fn(({ onConfirm }) => onConfirm && onConfirm()),
      validateForm: vi.fn(() => true),
    };
    globalThis.Auth = {
      isLoggedIn: vi.fn(() => true),
      requireLogin: vi.fn(),
      getUser: vi.fn(() => ({ id: 1, role: 'admin' })),
    };
    globalThis.Loading = { show: vi.fn(), hide: vi.fn() };
    globalThis.Router = { navigate: vi.fn(), getParam: vi.fn() };
    globalThis.CandidateForm = { open: vi.fn() };

    // localStorage in happy-dom exists
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
        <input type="text" id="searchInput">
        <button id="newBtn">+ New</button>
        <select id="statusFilter"><option value="">All</option><option value="active">active</option></select>
        <select id="cityFilter"><option value="">All</option></select>
        <select id="educationFilter"><option value="">All</option></select>
        <input id="industryFilter">
        <input id="salaryMinFilter" type="number">
        <input id="salaryMaxFilter" type="number">
        <select id="hasRecFilter"><option value="">All</option></select>
        <select id="sortFilter"><option value="">All</option></select>
        <button id="resetFilterBtn">Reset</button>
        <select id="viewSelect"><option value="">--</option></select>
        <button id="saveViewBtn">Save</button>
        <button id="deleteViewBtn" style="display:none">Del</button>
        <span id="totalCount"></span>
        <table><thead><tr><th><input type="checkbox" id="selectAllCheck"></th></tr></thead>
          <tbody id="candidateTbody"></tbody>
        </table>
        <div id="pagination"></div>
        <div id="batchBar"><span id="batchCount">0</span><button id="selectAllPagesBtn" style="display:none;"><span id="selectAllPagesTotal">0</span></button></div>
      </div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('init: loadCandidates calls API.list + renders rows', async () => {
    globalThis.API.candidates.list.mockResolvedValue({
      ok: true,
      meta: { total: 2 },
      data: [
        { id: 1, name: 'Alice', status: 'active', rating: 4, tags: ['VIP'] },
        { id: 2, name: 'Bob', status: 'passive', rating: 3, tags: [] },
      ],
    });

    await import('../../public/pages/candidate-pool.js');
    await new Promise((r) => setTimeout(r, 50));

    expect(globalThis.API.candidates.list).toHaveBeenCalledTimes(1);
    const params = globalThis.API.candidates.list.mock.calls[0][0];
    expect(params.page).toBe(1);
    expect(params.pageSize).toBe(20);

    const tbody = document.getElementById('candidateTbody');
    expect(tbody.children.length).toBe(2);
    expect(tbody.innerHTML).toContain('Alice');
    expect(tbody.innerHTML).toContain('Bob');
    expect(document.getElementById('totalCount').textContent).toContain('2');
  });

  it('search: filter keyword → params.keyword', async () => {
    globalThis.API.candidates.list.mockResolvedValue({ ok: true, meta: { total: 0 }, data: [] });

    await import('../../public/pages/candidate-pool.js');
    await new Promise((r) => setTimeout(r, 50));

    const input = document.getElementById('searchInput');
    input.value = 'java';
    input.dispatchEvent(new Event('input'));

    // Wait > 300ms for debounce
    await new Promise((r) => setTimeout(r, 400));

    expect(globalThis.API.candidates.list).toHaveBeenCalled();
    const lastCall = globalThis.API.candidates.list.mock.calls.slice(-1)[0][0];
    expect(lastCall.keyword).toBe('java');
  });

  it('filter: status change → params.status', async () => {
    globalThis.API.candidates.list.mockResolvedValue({ ok: true, meta: { total: 0 }, data: [] });

    await import('../../public/pages/candidate-pool.js');
    await new Promise((r) => setTimeout(r, 50));

    const select = document.getElementById('statusFilter');
    select.value = 'active';
    select.dispatchEvent(new Event('change'));

    await new Promise((r) => setTimeout(r, 20));

    expect(globalThis.API.candidates.list).toHaveBeenCalled();
    const lastCall = globalThis.API.candidates.list.mock.calls.slice(-1)[0][0];
    expect(lastCall.status).toBe('active');
  });

  it('batchAction tag: triggers UI.showModal → batchAction API', async () => {
    globalThis.API.candidates.list.mockResolvedValue({
      ok: true,
      meta: { total: 1 },
      data: [{ id: 1, name: 'Alice', status: 'active', rating: 4, tags: [] }],
    });
    globalThis.API.candidates.batchAction.mockResolvedValue({ ok: true, data: { success: 1 } });

    let capturedOnConfirm;
    globalThis.UI.showModal = vi.fn(({ onConfirm }) => {
      capturedOnConfirm = onConfirm;
    });

    await import('../../public/pages/candidate-pool.js');
    await new Promise((r) => setTimeout(r, 50));

    // Click row checkbox
    const rowCheck = document.querySelector('.row-check');
    rowCheck.checked = true;
    rowCheck.dispatchEvent(new Event('change'));

    // Click batch tag button
    const batchBar = document.getElementById('batchBar');
    const tagBtn = document.createElement('button');
    tagBtn.setAttribute('data-batch', 'tag');
    batchBar.appendChild(tagBtn);
    tagBtn.click();

    expect(globalThis.UI.showModal).toHaveBeenCalled();

    // Now trigger onConfirm
    document.body.innerHTML += '<div id="batchForm"><input name="tag" value="VIP"></div>';
    if (capturedOnConfirm) capturedOnConfirm();

    await new Promise((r) => setTimeout(r, 30));

    expect(globalThis.API.candidates.batchAction).toHaveBeenCalledWith(
      'tag',
      expect.arrayContaining([1]),
      expect.objectContaining({ tag: 'VIP' })
    );
  });

  it('selectAll / clear selection toggle', async () => {
    globalThis.API.candidates.list.mockResolvedValue({
      ok: true,
      meta: { total: 2 },
      data: [
        { id: 1, name: 'Alice', status: 'active', rating: 4, tags: [] },
        { id: 2, name: 'Bob', status: 'active', rating: 4, tags: [] },
      ],
    });

    await import('../../public/pages/candidate-pool.js');
    await new Promise((r) => setTimeout(r, 50));

    const selectAll = document.getElementById('selectAllCheck');
    selectAll.checked = true;
    selectAll.dispatchEvent(new Event('change'));

    const rowChecks = document.querySelectorAll('.row-check');
    expect(rowChecks.length).toBe(2);
    rowChecks.forEach((cb) => expect(cb.checked).toBe(true));

    // Now uncheck
    selectAll.checked = false;
    selectAll.dispatchEvent(new Event('change'));
    rowChecks.forEach((cb) => expect(cb.checked).toBe(false));
  });
});