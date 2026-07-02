const STORAGE_KEYS = {
  INTERVIEWS: 'erp_interviews',
  CANDIDATE_TAGS: 'erp_candidate_tags',
  CLIENT_NOTES: 'erp_client_notes',
  TASKS: 'erp_tasks',
  SETTINGS: 'erp_settings',
};

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function readArray(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn(`读取 ${key} 失败:`, e);
    return [];
  }
}

function writeArray(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error(`写入 ${key} 失败:`, e);
    return false;
  }
}

function readMap(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn(`读取 ${key} 失败:`, e);
    return {};
  }
}

function writeMap(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error(`写入 ${key} 失败:`, e);
    return false;
  }
}

const Storage = {
  interviews: {
    getAll() {
      return readArray(STORAGE_KEYS.INTERVIEWS);
    },
    getList(opts = {}) {
      let list = readArray(STORAGE_KEYS.INTERVIEWS);
      if (opts.status) {
        list = list.filter(i => i.status === opts.status);
      }
      if (opts.keyword) {
        const kw = opts.keyword.toLowerCase();
        list = list.filter(i =>
          i.candidate_name?.toLowerCase().includes(kw) ||
          i.job_title?.toLowerCase().includes(kw) ||
          i.interviewer?.toLowerCase().includes(kw)
        );
      }
      list.sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));
      return list;
    },
    getById(id) {
      return readArray(STORAGE_KEYS.INTERVIEWS).find(i => i.id === id);
    },
    create(data) {
      const list = readArray(STORAGE_KEYS.INTERVIEWS);
      const item = {
        id: generateId(),
        status: 'scheduled',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...data,
      };
      list.unshift(item);
      writeArray(STORAGE_KEYS.INTERVIEWS, list);
      return item;
    },
    update(id, data) {
      const list = readArray(STORAGE_KEYS.INTERVIEWS);
      const idx = list.findIndex(i => i.id === id);
      if (idx === -1) return null;
      list[idx] = { ...list[idx], ...data, updated_at: new Date().toISOString() };
      writeArray(STORAGE_KEYS.INTERVIEWS, list);
      return list[idx];
    },
    delete(id) {
      const list = readArray(STORAGE_KEYS.INTERVIEWS).filter(i => i.id !== id);
      return writeArray(STORAGE_KEYS.INTERVIEWS, list);
    },
    initDemoData() {
      const existing = readArray(STORAGE_KEYS.INTERVIEWS);
      if (existing.length > 0) return;
      const demoData = [
        {
          candidate_name: '张明',
          job_title: '高级产品经理',
          client_name: '字节跳动',
          interviewer: '李总监',
          scheduled_at: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
          type: 'video',
          status: 'scheduled',
          note: '初面，重点考察产品思维',
        },
        {
          candidate_name: '王芳',
          job_title: '前端工程师',
          client_name: '阿里巴巴',
          interviewer: '赵经理',
          scheduled_at: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 16),
          type: 'onsite',
          status: 'scheduled',
          note: '技术二面',
        },
        {
          candidate_name: '李伟',
          job_title: '数据分析师',
          client_name: '美团',
          interviewer: '陈主管',
          scheduled_at: new Date(Date.now() - 86400000).toISOString().slice(0, 16),
          type: 'video',
          status: 'completed',
          note: '表现不错，等待结果',
        },
      ];
      writeArray(STORAGE_KEYS.INTERVIEWS, demoData.map(d => ({
        id: generateId(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...d,
      })));
    },
  },

  candidateTags: {
    getAll() {
      return readMap(STORAGE_KEYS.CANDIDATE_TAGS);
    },
    get(candidateId) {
      const map = readMap(STORAGE_KEYS.CANDIDATE_TAGS);
      return map[candidateId] || { tags: [], rating: 0, notes: '' };
    },
    set(candidateId, data) {
      const map = readMap(STORAGE_KEYS.CANDIDATE_TAGS);
      map[candidateId] = { ...map[candidateId], ...data };
      writeMap(STORAGE_KEYS.CANDIDATE_TAGS, map);
      return map[candidateId];
    },
    addTag(candidateId, tag) {
      const info = this.get(candidateId);
      if (!info.tags) info.tags = [];
      if (!info.tags.includes(tag)) {
        info.tags.push(tag);
        this.set(candidateId, info);
      }
      return info.tags;
    },
    removeTag(candidateId, tag) {
      const info = this.get(candidateId);
      info.tags = (info.tags || []).filter(t => t !== tag);
      this.set(candidateId, info);
      return info.tags;
    },
    setRating(candidateId, rating) {
      return this.set(candidateId, { rating });
    },
    setNotes(candidateId, notes) {
      return this.set(candidateId, { notes });
    },
  },

  clientNotes: {
    getAll() {
      return readMap(STORAGE_KEYS.CLIENT_NOTES);
    },
    get(clientId) {
      const map = readMap(STORAGE_KEYS.CLIENT_NOTES);
      return map[clientId] || { notes: [], follow_up: null };
    },
    addNote(clientId, content) {
      const info = this.get(clientId);
      if (!info.notes) info.notes = [];
      info.notes.unshift({
        id: generateId(),
        content,
        created_at: new Date().toISOString(),
      });
      const map = readMap(STORAGE_KEYS.CLIENT_NOTES);
      map[clientId] = info;
      writeMap(STORAGE_KEYS.CLIENT_NOTES, map);
      return info;
    },
    setFollowUp(clientId, date) {
      const info = this.get(clientId);
      info.follow_up = date;
      const map = readMap(STORAGE_KEYS.CLIENT_NOTES);
      map[clientId] = info;
      writeMap(STORAGE_KEYS.CLIENT_NOTES, map);
      return info;
    },
  },

  tasks: {
    getAll() {
      return readArray(STORAGE_KEYS.TASKS);
    },
    getList(opts = {}) {
      let list = readArray(STORAGE_KEYS.TASKS);
      if (opts.status) {
        list = list.filter(t => t.status === opts.status);
      }
      list.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
      return list;
    },
    create(data) {
      const list = readArray(STORAGE_KEYS.TASKS);
      const item = {
        id: generateId(),
        status: 'pending',
        created_at: new Date().toISOString(),
        ...data,
      };
      list.unshift(item);
      writeArray(STORAGE_KEYS.TASKS, list);
      return item;
    },
    update(id, data) {
      const list = readArray(STORAGE_KEYS.TASKS);
      const idx = list.findIndex(t => t.id === id);
      if (idx === -1) return null;
      list[idx] = { ...list[idx], ...data };
      writeArray(STORAGE_KEYS.TASKS, list);
      return list[idx];
    },
    toggleComplete(id) {
      const task = this.getList().find(t => t.id === id);
      if (!task) return null;
      return this.update(id, { status: task.status === 'done' ? 'pending' : 'done' });
    },
    delete(id) {
      const list = readArray(STORAGE_KEYS.TASKS).filter(t => t.id !== id);
      return writeArray(STORAGE_KEYS.TASKS, list);
    },
  },

  settings: {
    get() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        return raw ? JSON.parse(raw) : {
          theme: 'light',
          notifications_enabled: true,
        };
      } catch (e) {
        return { theme: 'light', notifications_enabled: true };
      }
    },
    set(data) {
      const current = this.get();
      const updated = { ...current, ...data };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      return updated;
    },
  },

  exportAll() {
    const result = {};
    Object.values(STORAGE_KEYS).forEach(key => {
      result[key] = localStorage.getItem(key);
    });
    return JSON.stringify(result, null, 2);
  },

  importAll(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      Object.entries(data).forEach(([key, value]) => {
        if (value !== null) {
          localStorage.setItem(key, value);
        }
      });
      return true;
    } catch (e) {
      console.error('导入失败:', e);
      return false;
    }
  },

  clearAll() {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  },
};

window.Storage = Storage;
