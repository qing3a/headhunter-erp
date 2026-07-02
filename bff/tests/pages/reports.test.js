// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('reports page', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.API = {
      reports: {
        kpi: vi.fn(),
        funnel: vi.fn(),
        statusDistribution: vi.fn(),
        consultantPerformance: vi.fn(),
      },
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
        <select id="daysSelect" class="days-select">
          <option value="7">7d</option>
          <option value="30" selected>30d</option>
        </select>
        <div data-kpi="totalCandidates">--</div>
        <div data-kpi="monthlyRecommendations">--</div>
        <div data-kpi="activeInterviews">--</div>
        <div data-kpi="monthlyHires">--</div>
        <h3>招聘漏斗 <span id="funnelRange"></span></h3>
        <div class="funnel" id="funnelEl"></div>
        <div class="status-grid" id="statusGrid"></div>
        <h3>顾问产能 Top <span id="consultantRange"></span></h3>
        <table><tbody id="consultantTbody"></tbody></table>
      </div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('init: calls reports.kpi + reports.funnel + statusDistribution + consultantPerformance', async () => {
    globalThis.API.reports.kpi.mockResolvedValue({
      ok: true,
      data: {
        totalCandidates: 100,
        monthlyRecommendations: 50,
        activeInterviews: 8,
        monthlyHires: 5,
      },
    });
    globalThis.API.reports.funnel.mockResolvedValue({
      ok: true,
      data: { days: 30, stages: [{ label: 'New', count: 100 }] },
    });
    globalThis.API.reports.statusDistribution.mockResolvedValue({
      ok: true,
      data: [{ status: 'active', cnt: 80 }],
    });
    globalThis.API.reports.consultantPerformance.mockResolvedValue({
      ok: true,
      data: { days: 30, consultants: [{ user_id: 1, username: 'A', total: 5, interviewing: 2, hired: 1 }] },
    });

    await import('../../public/pages/reports.js');
    await new Promise((r) => setTimeout(r, 100));

    expect(globalThis.API.reports.kpi).toHaveBeenCalled();
    expect(globalThis.API.reports.funnel).toHaveBeenCalledWith(30);
    expect(globalThis.API.reports.statusDistribution).toHaveBeenCalled();
    expect(globalThis.API.reports.consultantPerformance).toHaveBeenCalled();
    expect(document.querySelector('[data-kpi="totalCandidates"]').textContent).toBe('100');
  });

  it('renders funnel data into funnelEl', async () => {
    globalThis.API.reports.kpi.mockResolvedValue({ ok: true, data: {} });
    globalThis.API.reports.funnel.mockResolvedValue({
      ok: true,
      data: { days: 30, stages: [{ label: 'New', count: 100 }, { label: 'Interview', count: 50 }] },
    });
    globalThis.API.reports.statusDistribution.mockResolvedValue({ ok: true, data: [] });
    globalThis.API.reports.consultantPerformance.mockResolvedValue({ ok: true, data: { consultants: [] } });

    await import('../../public/pages/reports.js');
    await new Promise((r) => setTimeout(r, 100));

    const funnel = document.getElementById('funnelEl');
    expect(funnel.innerHTML).toContain('New');
    expect(funnel.innerHTML).toContain('Interview');
  });
});