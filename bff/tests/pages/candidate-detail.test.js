// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('candidate-detail page', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.API = {
      candidates: {
        get: vi.fn(),
        remove: vi.fn(),
        update: vi.fn(),
        listExperiences: vi.fn(),
        listEducations: vi.fn(),
        listContacts: vi.fn(),
        createExperience: vi.fn(),
        updateExperience: vi.fn(),
        removeExperience: vi.fn(),
        createEducation: vi.fn(),
        updateEducation: vi.fn(),
        removeEducation: vi.fn(),
        createContact: vi.fn(),
        updateContact: vi.fn(),
        removeContact: vi.fn(),
      },
      jobs: { lookup: vi.fn() },
      recommendations: {
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        get: vi.fn(),
        changeStatus: vi.fn(),
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
      getUser: vi.fn(() => ({ id: 1 })),
    };
    globalThis.Router = {
      navigate: vi.fn(),
      getParam: vi.fn(() => '1'),
    };
    globalThis.CandidateForm = { open: vi.fn() };

    document.body.innerHTML = `
      <div id="pageContent">
        <div id="loadingHint">Loading...</div>
        <div id="detailContainer" style="display:none;">
          <h1 id="profileName">--</h1>
          <div id="profileMeta">--</div>
          <div id="profileTags"></div>
          <div id="profileAvatar"></div>
          <span id="breadName">--</span>
          <div class="info-grid" id="basicInfo"></div>
          <div class="info-grid" id="jobIntention"></div>
          <div class="info-grid" id="sourceInfo"></div>
          <div id="notesContent"></div>
          <span class="badge" id="expCount"></span>
          <span class="badge" id="eduCount"></span>
          <span class="badge" id="contactCount"></span>
          <span class="badge" id="recCount"></span>
          <div class="sub-list" id="experienceList"></div>
          <div class="sub-list" id="educationList"></div>
          <div class="sub-list" id="contactList"></div>
          <div class="sub-list" id="recommendationList"></div>
          <div id="expMoreBar" style="display:none;"><button id="expMoreBtn">Load more</button><span id="expMoreHint"></span></div>
          <div id="eduMoreBar" style="display:none;"><button id="eduMoreBtn">Load more</button><span id="eduMoreHint"></span></div>
          <div id="contactMoreBar" style="display:none;"><button id="contactMoreBtn">Load more</button><span id="contactMoreHint"></span></div>
          <button id="editBtn">Edit</button>
          <button id="deleteBtn">Delete</button>
          <div class="tab-item" data-tab="experience"></div>
          <div class="tab-item" data-tab="education"></div>
          <div class="tab-item" data-tab="contact"></div>
          <div class="tab-item" data-tab="recommendation"></div>
          <button data-action="add-experience">+ exp</button>
          <button data-action="add-education">+ edu</button>
          <button data-action="add-contact">+ contact</button>
          <button data-action="add-recommendation">+ rec</button>
        </div>
        <div id="timelineList"></div>
      </div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('init: loads candidate detail + sub-records (exp/edu/contact)', async () => {
    globalThis.API.candidates.get.mockResolvedValue({
      ok: true,
      data: {
        id: 1,
        name: 'Alice',
        status: 'active',
        tags: ['VIP'],
        current_position: 'Engineer',
        current_company: 'Acme',
        years_of_experience: 5,
        education_level: 'bachelor',
        phone: '138',
        email: 'a@b.com',
        current_city: 'BJ',
      },
    });
    globalThis.API.candidates.listExperiences.mockResolvedValue({
      ok: true,
      data: [{ id: 100, company: 'Acme', position: 'Eng', start_date: '2020-01' }],
    });
    globalThis.API.candidates.listEducations.mockResolvedValue({
      ok: true,
      data: [{ id: 200, school: 'PKU', degree: 'bachelor' }],
    });
    globalThis.API.candidates.listContacts.mockResolvedValue({
      ok: true,
      data: [{ id: 300, contact_type: 'phone', contact_at: '2024-01-01' }],
    });

    await import('../../public/pages/candidate-detail.js');
    await new Promise((r) => setTimeout(r, 100));

    expect(globalThis.API.candidates.get).toHaveBeenCalledWith(1);
    expect(globalThis.API.candidates.listExperiences).toHaveBeenCalled();
    expect(globalThis.API.candidates.listEducations).toHaveBeenCalled();
    expect(globalThis.API.candidates.listContacts).toHaveBeenCalled();

    expect(document.getElementById('profileName').textContent).toBe('Alice');
    expect(document.getElementById('experienceList').innerHTML).toContain('Acme');
    expect(document.getElementById('educationList').innerHTML).toContain('PKU');
    expect(document.getElementById('contactList').innerHTML).toContain('2024-01-01');
    expect(document.getElementById('loadingHint').style.display).toBe('none');
  });

  it('loadSub exp: separate listExperiences call renders to experienceList', async () => {
    globalThis.API.candidates.get.mockResolvedValue({
      ok: true,
      data: { id: 1, name: 'Alice', status: 'active', tags: [] },
    });
    globalThis.API.candidates.listExperiences.mockResolvedValue({
      ok: true,
      data: [
        { id: 100, company: 'Old', position: 'p1' },
        { id: 101, company: 'New', position: 'p2' },
      ],
    });
    globalThis.API.candidates.listEducations.mockResolvedValue({ ok: true, data: [] });
    globalThis.API.candidates.listContacts.mockResolvedValue({ ok: true, data: [] });

    await import('../../public/pages/candidate-detail.js');
    await new Promise((r) => setTimeout(r, 100));

    const list = document.getElementById('experienceList');
    expect(list.innerHTML).toContain('Old');
    expect(list.innerHTML).toContain('New');
  });

  it('loadMoreSub exp: clicking expMoreBtn triggers additional listExperiences + append', async () => {
    globalThis.API.candidates.get.mockResolvedValue({
      ok: true,
      data: { id: 1, name: 'Alice', status: 'active', tags: [] },
    });
    // First call returns exactly 50 (h=50) so hasMore becomes true
    const expBatch1 = Array.from({ length: 50 }, (_, i) => ({
      id: 1000 + i,
      company: 'C' + i,
      position: 'P' + i,
    }));
    globalThis.API.candidates.listExperiences
      .mockResolvedValueOnce({ ok: true, data: expBatch1 })
      .mockResolvedValueOnce({ ok: true, data: [{ id: 9999, company: 'ExtraCo', position: 'X' }] });
    globalThis.API.candidates.listEducations.mockResolvedValue({ ok: true, data: [] });
    globalThis.API.candidates.listContacts.mockResolvedValue({ ok: true, data: [] });

    await import('../../public/pages/candidate-detail.js');
    await new Promise((r) => setTimeout(r, 100));

    // Click load more (works regardless of display state)
    document.getElementById('expMoreBtn').click();
    await new Promise((r) => setTimeout(r, 50));

    expect(globalThis.API.candidates.listExperiences).toHaveBeenCalledTimes(2);
    expect(document.getElementById('experienceList').innerHTML).toContain('ExtraCo');
  });

  it('update PUT candidate → API.update call + reload', async () => {
    globalThis.API.candidates.get.mockResolvedValue({
      ok: true,
      data: { id: 1, name: 'Alice', status: 'active', tags: [] },
    });
    globalThis.API.candidates.update.mockResolvedValue({ ok: true, data: { id: 1 } });
    globalThis.API.candidates.listExperiences.mockResolvedValue({ ok: true, data: [] });
    globalThis.API.candidates.listEducations.mockResolvedValue({ ok: true, data: [] });
    globalThis.API.candidates.listContacts.mockResolvedValue({ ok: true, data: [] });

    await import('../../public/pages/candidate-detail.js');
    await new Promise((r) => setTimeout(r, 100));

    // Open CandidateForm in edit mode (mocked)
    globalThis.CandidateForm.open.mockImplementation(({ onSaved }) => {
      // Trigger save callback (simulates saving)
      if (onSaved) onSaved();
    });

    document.getElementById('editBtn').click();
    await new Promise((r) => setTimeout(r, 30));

    expect(globalThis.CandidateForm.open).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'edit' })
    );
  });

  it('DELETE: confirm modal → API.remove + redirect', async () => {
    globalThis.API.candidates.get.mockResolvedValue({
      ok: true,
      data: { id: 1, name: 'Alice', status: 'active', tags: [] },
    });
    globalThis.API.candidates.remove.mockResolvedValue({ ok: true });
    globalThis.API.candidates.listExperiences.mockResolvedValue({ ok: true, data: [] });
    globalThis.API.candidates.listEducations.mockResolvedValue({ ok: true, data: [] });
    globalThis.API.candidates.listContacts.mockResolvedValue({ ok: true, data: [] });

    await import('../../public/pages/candidate-detail.js');
    await new Promise((r) => setTimeout(r, 100));

    document.getElementById('deleteBtn').click();
    await new Promise((r) => setTimeout(r, 30));

    expect(globalThis.UI.showConfirm).toHaveBeenCalled();
    expect(globalThis.API.candidates.remove).toHaveBeenCalledWith(1);
  });
});