// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('candidate-import page', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.API = {
      imports: {
        preview: vi.fn(),
        commit: vi.fn(),
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
      getToken: vi.fn(() => 'fake-token'),
    };
    globalThis.Router = { navigate: vi.fn(), getParam: vi.fn() };
    globalThis.Loading = { show: vi.fn(), hide: vi.fn() };

    document.body.innerHTML = `
      <div id="pageContent">
        <input type="file" id="fileInput">
        <button id="uploadBtn">Upload</button>
        <div id="previewArea"></div>
        <button id="commitBtn" style="display:none">Commit</button>
        <button id="downloadTemplateBtn">Template</button>
        <div id="uploadArea"></div>
        <div id="fileInfo" style="display:none">
          <span id="fileName"></span>
          <span id="fileSize"></span>
          <button id="removeFileBtn">Remove</button>
        </div>
        <div id="mappingCard" style="display:none">
          <table id="mappingTable"></table>
          <input type="checkbox" id="skipDuplicates">
          <button id="cancelBtn">Cancel</button>
        </div>
        <table id="previewTable"></table>
      </div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('init: page loads without errors', async () => {
    await import('../../public/pages/candidate-import.js');
    await new Promise((r) => setTimeout(r, 50));
    // Page loaded successfully
    expect(document.getElementById('fileInput')).toBeTruthy();
  });

  it('upload: file select triggers API.imports.preview', async () => {
    globalThis.API.imports.preview.mockResolvedValue({
      ok: true,
      data: {
        headers: ['name', 'phone'],
        previewRows: [{ name: 'Alice', phone: '138' }],
        suggestedMapping: { name: 'name', phone: 'phone' },
      },
    });
    globalThis.Auth.getToken = vi.fn(() => 'fake-token');
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob()) })
    );

    await import('../../public/pages/candidate-import.js');
    await new Promise((r) => setTimeout(r, 50));

    // Simulate file selection
    const fakeFile = new Blob(['x'], { type: 'application/vnd.ms-excel' });
    fakeFile.name = 'test.xlsx';
    const fileInput = document.getElementById('fileInput');
    Object.defineProperty(fileInput, 'files', { value: [fakeFile], writable: false });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise((r) => setTimeout(r, 100));
    expect(globalThis.API.imports.preview).toHaveBeenCalled();
  });
});