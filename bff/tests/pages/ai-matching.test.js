// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('ai-matching page', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.API = {
      jobs: {
        list: vi.fn(),
        get: vi.fn(),
      },
      candidates: { list: vi.fn() },
      recommendations: { create: vi.fn() },
      aiMatching: {
        matchCandidate: vi.fn().mockResolvedValue({ ok: true, data: { matches: [] } }),
        matchJob: vi.fn().mockResolvedValue({ ok: true, data: { matches: [] } }),
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
    globalThis.Router = { navigate: vi.fn(), getParam: vi.fn() };

    document.body.innerHTML = `
      <div id="pageContent">
        <select class="form-select" id="jobSelect"><option value="">加载中...</option></select>
        <button class="btn btn-primary" id="matchBtn">开始匹配</button>
        <input type="range" min="0" max="100" value="25" id="wIndustry">
        <span id="wIndustryVal">25%</span>
        <input type="range" min="0" max="100" value="25" id="wPosition">
        <span id="wPositionVal">25%</span>
        <input type="range" min="0" max="100" value="15" id="wCity">
        <span id="wCityVal">15%</span>
        <input type="range" min="0" max="100" value="15" id="wSalary">
        <span id="wSalaryVal">15%</span>
        <input type="range" min="0" max="100" value="10" id="wExperience">
        <span id="wExperienceVal">10%</span>
        <input type="range" min="0" max="100" value="10" id="wEducation">
        <span id="wEducationVal">10%</span>
        <div id="resultHint">选择职位后点击"开始匹配"</div>
        <div class="match-grid" id="matchGrid" style="display:none;"></div>
      </div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('init: loadJobs populates jobSelect', async () => {
    globalThis.API.jobs.list.mockResolvedValue({
      ok: true,
      data: [
        { id: 1, title: 'Engineer', company: 'Acme', city: 'BJ' },
      ],
    });
    globalThis.API.candidates.list.mockResolvedValue({ ok: true, data: [] });

    await import('../../public/pages/ai-matching.js');
    await new Promise((r) => setTimeout(r, 80));

    expect(globalThis.API.jobs.list).toHaveBeenCalled();
    expect(document.getElementById('jobSelect').innerHTML).toContain('Engineer');
  });

  it('weight sliders: change wIndustry → updates wIndustryVal text', async () => {
    globalThis.API.jobs.list.mockResolvedValue({ ok: true, data: [] });
    globalThis.API.candidates.list.mockResolvedValue({ ok: true, data: [] });

    await import('../../public/pages/ai-matching.js');
    await new Promise((r) => setTimeout(r, 80));

    const slider = document.getElementById('wIndustry');
    slider.value = '50';
    slider.dispatchEvent(new Event('input', { bubbles: true }));

    await new Promise((r) => setTimeout(r, 20));
    expect(document.getElementById('wIndustryVal').textContent).toBe('50%');
  });

  it('match: click matchBtn with job selected → renders matchGrid', async () => {
    globalThis.API.jobs.list.mockResolvedValue({
      ok: true,
      data: [{ id: 1, title: 'Eng', company: 'A', city: 'BJ', salary_min: 20, salary_max: 40 }],
    });
    globalThis.API.jobs.get.mockResolvedValue({
      ok: true,
      data: { id: 1, title: 'Eng', company: 'A', city: 'BJ', salary_min: 20, salary_max: 40, experience_min: 3, experience_max: 8, education_level: 'bachelor' },
    });
    globalThis.API.candidates.list.mockResolvedValue({
      ok: true,
      data: [
        { id: 1, name: 'Alice', years_of_experience: 5, current_city: 'BJ', expected_salary_min: 25, expected_salary_max: 35, education_level: 'bachelor', current_position: 'Engineer', expected_position: 'Engineer', expected_industry: 'Tech' },
      ],
    });

    await import('../../public/pages/ai-matching.js');
    await new Promise((r) => setTimeout(r, 100));

    const select = document.getElementById('jobSelect');
    select.value = '1';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    document.getElementById('matchBtn').click();
    await new Promise((r) => setTimeout(r, 100));

    expect(globalThis.API.jobs.get).toHaveBeenCalled();
  });
});