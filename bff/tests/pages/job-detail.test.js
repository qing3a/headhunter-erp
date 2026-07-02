// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('job-detail page', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.API = {
      jobs: { get: vi.fn(), update: vi.fn(), remove: vi.fn() },
      recommendations: { list: vi.fn() },
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
    globalThis.Router = { navigate: vi.fn(), getParam: vi.fn(() => '1') };

    document.body.innerHTML = `
      <div id="pageContent">
        <div id="loadingHint">Loading...</div>
        <div id="detailContainer" style="display:none;">
          <h1 id="jobTitle">--</h1>
          <div id="jobMeta">--</div>
          <span class="status-pill" id="jobStatus">--</span>
          <button id="editBtn">Edit</button>
          <button id="toggleStatusBtn">--</button>
          <button id="deleteBtn">Delete</button>
          <button id="backBtn">Back</button>
          <div class="info-grid" id="basicInfo"></div>
          <div id="descSection" style="display:none;">
            <div id="descContent"></div>
          </div>
          <span id="recCount"></span>
          <div id="recList"></div>
        </div>
      </div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('init: loadJob calls API.jobs.get + renders details', async () => {
    globalThis.API.jobs.get.mockResolvedValue({
      ok: true,
      data: {
        id: 1,
        title: 'Senior Engineer',
        employer_name: 'Acme',
        status: 'open',
        city: 'BJ',
        salary_min: 30,
        salary_max: 50,
      },
    });
    globalThis.API.recommendations.list.mockResolvedValue({ ok: true, data: [] });

    await import('../../public/pages/job-detail.js');
    await new Promise((r) => setTimeout(r, 80));

    expect(globalThis.API.jobs.get).toHaveBeenCalledWith(1);
    expect(document.getElementById('jobTitle').textContent).toBe('Senior Engineer');
    expect(document.getElementById('loadingHint').style.display).toBe('none');
  });

  it('delete: click deleteBtn → showConfirm → API.remove + navigate', async () => {
    globalThis.API.jobs.get.mockResolvedValue({
      ok: true,
      data: { id: 1, title: 'X', status: 'open' },
    });
    globalThis.API.jobs.remove.mockResolvedValue({ ok: true });
    globalThis.API.recommendations.list.mockResolvedValue({ ok: true, data: [] });

    await import('../../public/pages/job-detail.js');
    await new Promise((r) => setTimeout(r, 80));

    document.getElementById('deleteBtn').click();
    await new Promise((r) => setTimeout(r, 30));

    expect(globalThis.UI.showConfirm).toHaveBeenCalled();
    expect(globalThis.API.jobs.remove).toHaveBeenCalledWith(1);
  });
});