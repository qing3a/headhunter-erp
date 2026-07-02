// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('dashboard page', () => {
  beforeEach(() => {
    globalThis.API = {
      dashboard: { getStats: vi.fn() },
      tasks: { list: vi.fn() },
    };
    globalThis.UI = { showToast: vi.fn() };
    globalThis.Auth = {
      isLoggedIn: vi.fn(() => true),
      requireLogin: vi.fn(),
      getUser: vi.fn(() => ({ id: 1, role: 'admin', username: 'admin' })),
    };
    globalThis.Loading = { show: vi.fn(), hide: vi.fn() };
    globalThis.Router = { navigate: vi.fn(), getParam: vi.fn() };

    document.body.innerHTML = `
      <div id="pageContent">
        <section class="grid grid-cols-4 gap-4 mb-6" id="kpiSection">
          <p data-kpi="total_candidates">--</p>
          <p data-kpi="today_new_users">--</p>
          <p data-kpi="open_jobs">--</p>
          <p data-kpi="total_recommendations">--</p>
          <p data-kpi-sub="today_new_recommendations">--</p>
        </section>
        <div class="flex flex-col gap-3" id="taskList"></div>
        <div class="flex flex-col gap-4" id="recentRecommendations"></div>
      </div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  beforeEach(() => {
    vi.resetModules();
  });

  it('init: calls getStats + renders KPIs', async () => {
    globalThis.API.dashboard.getStats.mockResolvedValue({
      ok: true,
      data: {
        total_candidates: 100,
        today_new_users: 5,
        open_jobs: 3,
        total_recommendations: 20,
        total_jobs: 3,
        interviews_count: 10,
        pending_tasks: 4,
        completed_tasks: 12,
        recent_interviews: [],
        recent_tasks: [],
      },
    });
    globalThis.API.tasks.list.mockResolvedValue({ ok: true, data: [] });

    await import('../../public/pages/dashboard.js');

    await new Promise((r) => setTimeout(r, 80));

    expect(globalThis.API.dashboard.getStats).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-kpi="total_candidates"]').textContent).toContain('100');
    expect(document.querySelector('[data-kpi="open_jobs"]').textContent).toContain('3');
  });

  it('init: calls tasks.list + renders task list', async () => {
    globalThis.API.dashboard.getStats.mockResolvedValue({
      ok: true,
      data: {
        total_candidates: 0,
        open_jobs: 0,
        total_recommendations: 0,
        interviews_count: 0,
        pending_tasks: 0,
        completed_tasks: 0,
      },
    });
    globalThis.API.tasks.list.mockResolvedValue({
      ok: true,
      data: [{ id: 1, title: 'A', description: 'd', priority: 'high' }],
    });

    await import('../../public/pages/dashboard.js');
    await new Promise((r) => setTimeout(r, 80));

    expect(globalThis.API.tasks.list).toHaveBeenCalledTimes(1);
    expect(globalThis.API.tasks.list).toHaveBeenCalledWith({ pageSize: 20 });
    expect(document.getElementById('taskList').innerHTML).toContain('A');
  });

  it('error handling: getStats fail → toast', async () => {
    globalThis.API.dashboard.getStats.mockResolvedValue({
      ok: false,
      error: { message: 'boom' },
    });
    globalThis.API.tasks.list.mockResolvedValue({ ok: true, data: [] });

    await import('../../public/pages/dashboard.js');
    await new Promise((r) => setTimeout(r, 80));

    expect(globalThis.UI.showToast).toHaveBeenCalled();
    const calls = globalThis.UI.showToast.mock.calls;
    const errorCall = calls.find((c) => c[0]?.type === 'error');
    expect(errorCall).toBeDefined();
  });
});