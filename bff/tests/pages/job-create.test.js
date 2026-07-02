// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('job-create page', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.API = {
      jobs: { create: vi.fn() },
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
        <form id="jobForm">
          <input name="title" value="Engineer">
          <input name="company" value="Acme">
          <input name="city" value="BJ">
          <input name="department">
          <input name="industry">
          <input name="description">
          <select name="education_level"><option value="bachelor">Bachelor</option></select>
          <input name="salary_min" value="20">
          <input name="salary_max" value="40">
          <input name="experience_min">
          <input name="experience_max">
          <button type="button" id="cancelBtn">Cancel</button>
          <button type="submit" id="submitBtn">发布职位</button>
        </form>
      </div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('init: page loads without errors', async () => {
    await import('../../public/pages/job-create.js');
    await new Promise((r) => setTimeout(r, 50));
    expect(document.getElementById('jobForm')).toBeTruthy();
  });

  it('submit: form submit → API.jobs.create with form data', async () => {
    globalThis.API.jobs.create.mockResolvedValue({
      ok: true,
      data: { id: 99, title: 'Engineer' },
    });

    await import('../../public/pages/job-create.js');
    await new Promise((r) => setTimeout(r, 50));

    const form = document.getElementById('jobForm');
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await new Promise((r) => setTimeout(r, 80));

    expect(globalThis.API.jobs.create).toHaveBeenCalled();
    const payload = globalThis.API.jobs.create.mock.calls[0][0];
    expect(payload.title).toBe('Engineer');
    expect(payload.company).toBe('Acme');
  });

  it('cancel: click cancelBtn → Router.navigate back to job-management', async () => {
    await import('../../public/pages/job-create.js');
    await new Promise((r) => setTimeout(r, 50));

    document.getElementById('cancelBtn').click();
    expect(globalThis.Router.navigate).toHaveBeenCalledWith('job-management.html');
  });
});