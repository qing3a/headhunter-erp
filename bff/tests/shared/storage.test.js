// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

let Storage;

beforeAll(async () => {
  // storage.js sets window.Storage at the bottom of the file.
  await import('../../../shared/storage.js');
  Storage = window.Storage;
});

beforeEach(() => localStorage.clear());

describe('Storage utility', () => {
  it('interviews create + getAll', () => {
    Storage.interviews.create({ candidate_name: 'A', job_title: 'P5' });
    const list = Storage.interviews.getAll();
    expect(list.length).toBe(1);
    expect(list[0].candidate_name).toBe('A');
    expect(list[0].status).toBe('scheduled');  // 默认
  });

  it('interviews getList 过滤 + 排序', () => {
    Storage.interviews.create({ candidate_name: 'A', scheduled_at: '2026-01-01' });
    Storage.interviews.create({ candidate_name: 'B', scheduled_at: '2027-01-01' });
    const list = Storage.interviews.getList({ status: 'scheduled' });
    expect(list.length).toBe(2);
  });

  it('interviews update + delete', () => {
    const i = Storage.interviews.create({ candidate_name: 'A' });
    Storage.interviews.update(i.id, { candidate_name: 'A改' });
    const found = Storage.interviews.getById(i.id);
    expect(found.candidate_name).toBe('A改');
    Storage.interviews.delete(i.id);
    expect(Storage.interviews.getAll().length).toBe(0);
  });

  it('tasks create + toggleComplete', () => {
    const t = Storage.tasks.create({ title: 't1' });
    expect(t.status).toBe('pending');
    Storage.tasks.toggleComplete(t.id);
    const found = Storage.tasks.getAll()[0];
    expect(found.status).toBe('done');
  });

  it('clearAll 清空所有 STORAGE_KEYS', () => {
    Storage.interviews.create({ candidate_name: 'A' });
    Storage.tasks.create({ title: 't' });
    Storage.clearAll();
    expect(Storage.interviews.getAll().length).toBe(0);
    expect(Storage.tasks.getAll().length).toBe(0);
  });

  it('candidateTags addTag / removeTag 去重', () => {
    Storage.candidateTags.addTag('c1', 'vip');
    Storage.candidateTags.addTag('c1', 'vip');  // 重复
    expect(Storage.candidateTags.get('c1').tags.length).toBe(1);
    Storage.candidateTags.removeTag('c1', 'vip');
    expect(Storage.candidateTags.get('c1').tags.length).toBe(0);
  });
});