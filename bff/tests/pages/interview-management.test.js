// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('interview-management page', () => {
  beforeEach(() => {
    vi.resetModules();
    // Capture DOMContentLoaded callbacks so we can invoke them directly without polluting document
    globalThis.__domReadyCallbacks = [];
    // Intercept DOMContentLoaded to prevent cross-test contamination
    document.addEventListener = function (event, cb, opts) {
      if (event === 'DOMContentLoaded' && typeof cb === 'function') {
        globalThis.__domReadyCallbacks.push(cb);
        return;
      }
      // For all other events, use the original
      return document.__proto__.addEventListener.call(document, event, cb, opts);
    };

    globalThis.API = {
      interviews: {
        list: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      jobs: { list: vi.fn() },
      candidates: { list: vi.fn() },
      reports: { kpi: vi.fn(), funnel: vi.fn(), statusDistribution: vi.fn(), consultantPerformance: vi.fn() },
      tags: { list: vi.fn() },
      notifications: { list: vi.fn() },
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
      validateForm: vi.fn(() => true),
      showPageLoading: vi.fn(),
      hidePageLoading: vi.fn(),
      parseDateTime: vi.fn((s) => new Date(s)),
    };
    globalThis.Auth = {
      isLoggedIn: vi.fn(() => true),
      requireLogin: vi.fn(),
      getUser: vi.fn(() => ({ id: 1 })),
    };
    globalThis.Router = { navigate: vi.fn(), getParam: vi.fn(() => '1') };
    globalThis.Loading = { show: vi.fn(), hide: vi.fn() };
    globalThis.CandidateForm = { open: vi.fn() };
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob()) }));

    document.body.innerHTML = `
      <div id="pageContent">
        <input type="text" id="searchInput">
        <select id="statusFilter"></select>
        <div id="interviewTableBody"></div>
        <div id="calendarView"></div>
        <div id="interviewList"></div>
        <div id="calendarContainer"></div>
        <button id="scheduleInterviewBtn">+ Schedule</button>
        <input type="checkbox" id="selectAllCheckbox">
        <div id="monthView" style="display:block"><div id="calendarDays"></div></div>
        <div id="weekView"></div>
        <button id="prevMonth">prev</button>
        <button id="nextMonth">next</button>
        <button id="todayBtn">today</button>
        <span id="currentMonth"></span>
        <button id="calPrevMonth">cp</button>
        <button id="calNextMonth">cn</button>
        <button id="calTodayBtn">ct</button>
        <span id="calCurrentMonth"></span>
        <button class="cal-view-btn" data-cal-view="month">M</button>
        <button class="cal-view-btn" data-cal-view="week">W</button>
        <div id="dayDetailPanel">
          <span id="dayDetailTitle"></span>
          <div id="dayDetailContent"></div>
          <button id="dayDetailClose">close</button>
        </div>
      </div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    globalThis.__domReadyCallbacks = [];
  });

  it('init: page loads and calls API.interviews.list', async () => {
    globalThis.API.interviews.list.mockResolvedValue({
      ok: true,
      data: { items: [] },
    });

    await import('../../public/pages/interview-management.js');
    await new Promise((r) => setTimeout(r, 50));

    // Run DOMContentLoaded callbacks that were captured during import
    for (const cb of globalThis.__domReadyCallbacks) cb();
    await new Promise((r) => setTimeout(r, 100));

    expect(globalThis.API.interviews.list).toHaveBeenCalled();
  });

  it('list with data: renders interviews into table', async () => {
    globalThis.API.interviews.list.mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            id: 1,
            candidate_name: 'Alice',
            scheduled_at: '2026-08-01T10:00:00',
            type: 'first_round',
            status: 'scheduled',
          },
        ],
      },
    });

    await import('../../public/pages/interview-management.js');
    await new Promise((r) => setTimeout(r, 50));
    for (const cb of globalThis.__domReadyCallbacks) cb();
    await new Promise((r) => setTimeout(r, 100));

    const tbody = document.getElementById('interviewTableBody');
    expect(tbody.innerHTML).toContain('Alice');
  });
});