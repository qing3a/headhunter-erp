const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// 用 globalThis 存 DB 状态。
// 原因：vitest 4.x 在 worker 间不复用模块实例（即使 isolate: false），
// 多个模块实例化各持一份 `let db`，互相看不到对方赋值。
// globalThis 保证单进程内唯一，跨模块实例共享。
if (!globalThis.__ERP_DB_STATE__) {
  globalThis.__ERP_DB_STATE__ = { db: null, dbPath: null, sqlDbRef: null, initPromise: null };
}
const STATE = globalThis.__ERP_DB_STATE__;

async function init() {
  // 防止并发 init 竞态
  if (STATE.initPromise) return STATE.initPromise;
  STATE.initPromise = (async () => {
    const SQL = await initSqlJs();

    STATE.dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/erp.db');
    const dir = path.dirname(STATE.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(STATE.dbPath)) {
      const fileBuffer = fs.readFileSync(STATE.dbPath);
      STATE.sqlDbRef = new SQL.Database(fileBuffer);
    } else {
      STATE.sqlDbRef = new SQL.Database();
    }

    function saveDB() {
      const data = STATE.sqlDbRef.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(STATE.dbPath, buffer);
    }

    function prepare(sql) {
      return {
        get(...params) {
          const stmt = STATE.sqlDbRef.prepare(sql);
          stmt.bind(params);
          let result = null;
          if (stmt.step()) {
            result = stmt.getAsObject();
          }
          stmt.free();
          return result;
        },
        all(...params) {
          const stmt = STATE.sqlDbRef.prepare(sql);
          stmt.bind(params);
          const rows = [];
          while (stmt.step()) {
            rows.push(stmt.getAsObject());
          }
          stmt.free();
          return rows;
        },
        run(...params) {
          const stmt = STATE.sqlDbRef.prepare(sql);
          stmt.bind(params);
          stmt.step();
          const idRows = STATE.sqlDbRef.exec('SELECT last_insert_rowid() AS id');
          const lastId = idRows[0] && idRows[0].values[0] ? Number(idRows[0].values[0][0]) : 0;
          const chgRows = STATE.sqlDbRef.exec('SELECT changes() AS c');
          const changes = chgRows[0] && chgRows[0].values[0] ? Number(chgRows[0].values[0][0]) : 0;
          stmt.free();
          saveDB();
          // ===== P0-NEW-2 修复：去掉 `|| 1` 兜底 =====
          // 原 fallback 把合法 0-changes（乐观锁冲突、UPDATE WHERE 不命中）误报成 1，
          // 导致 result.changes === 0 判断失效（P0-NEW-2 乐观锁基础）。
          return { lastInsertRowid: lastId, changes: changes };
          // ===== 修复结束 =====
        },
      };
    }

    STATE.db = {
      prepare,
      exec(sql) {
        STATE.sqlDbRef.exec(sql);
        saveDB();
      },
    };

    createTables();
    await seedUsersIfNeeded();
    console.log('💾 Database initialized at', STATE.dbPath);

    // ===== v6.6 启动 monitor：检测 FTS5 可用性 =====
    try {
      const ftsCheck = STATE.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='candidates_fts'`).get();
      if (ftsCheck) {
        console.log('✅ FTS5 candidates_fts 虚拟表已就绪（sql.js 启用 FTS5）');
      } else {
        console.warn('⚠️  FTS5 不可用：候选人池 keyword 查询走 LIKE（>1k 候选人可能慢）');
        console.warn('   升级路径见 docs/fts5-upgrade.md');
      }
    } catch (e) {
      console.warn('⚠️  FTS5 检测失败:', e.message);
    }
    // ===== 监控结束 =====
  })();
  return STATE.initPromise;
}

function safeExec(sql) {
  try {
    STATE.db.exec(sql);
  } catch (err) {
    const msg = String(err.message || '');
    if (!/duplicate column|already exists/i.test(msg)) {
      console.warn('DDL warning:', msg);
    }
  }
}

function createTables() {
  STATE.db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT DEFAULT 'consultant',
      status TEXT DEFAULT 'active',
      last_login_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      detail TEXT,
      ip TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS interviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_name TEXT NOT NULL,
      job_title TEXT,
      client_name TEXT,
      interviewer TEXT,
      scheduled_at TEXT,
      type TEXT DEFAULT 'video',
      status TEXT DEFAULT 'scheduled',
      note TEXT,
      candidate_id TEXT,
      job_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS candidate_tags (
      candidate_id INTEGER PRIMARY KEY,
      tags TEXT DEFAULT '[]',
      rating INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      version INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      desc TEXT,
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'pending',
      due_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT,
      name TEXT NOT NULL,
      industry TEXT,
      city TEXT,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      website TEXT,
      notes TEXT,
      status TEXT DEFAULT 'active',
      owner_user_id INTEGER,
      source TEXT DEFAULT 'local',
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS client_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT,
      client_name TEXT,
      content TEXT,
      follow_up TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT,
      title TEXT NOT NULL,
      company TEXT,
      department TEXT,
      city TEXT,
      industry TEXT,
      salary_min INTEGER,
      salary_max INTEGER,
      experience_min INTEGER,
      experience_max INTEGER,
      education_level TEXT,
      description TEXT,
      status TEXT DEFAULT 'open',
      owner_user_id INTEGER,
      source TEXT DEFAULT 'local',
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL,
      job_id INTEGER,
      job_title TEXT,
      job_company TEXT,
      client_name TEXT,
      status TEXT DEFAULT 'recommended',
      recommend_method TEXT,
      recommend_at TEXT DEFAULT (datetime('now')),
      last_status_change_at TEXT,
      expected_salary TEXT,
      notes TEXT,
      recommend_user_id INTEGER,
      recommend_username TEXT,
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recommendation_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recommendation_id INTEGER NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_by_user_id INTEGER,
      changed_by_username TEXT,
      note TEXT,
      changed_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gender TEXT,
      phone TEXT,
      email TEXT,
      current_position TEXT,
      current_company TEXT,
      years_of_experience INTEGER DEFAULT 0,
      education_level TEXT,
      current_city TEXT,
      expected_salary_min INTEGER,
      expected_salary_max INTEGER,
      expected_position TEXT,
      expected_industry TEXT,
      expected_city TEXT,
      available_at TEXT,
      status TEXT DEFAULT 'active',
      source_channel TEXT,
      source_detail TEXT,
      notes TEXT,
      user_id INTEGER,
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS candidate_experiences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL,
      company TEXT NOT NULL,
      position TEXT,
      start_date TEXT,
      end_date TEXT,
      is_current INTEGER DEFAULT 0,
      salary TEXT,
      description TEXT,
      user_id INTEGER,
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS candidate_educations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL,
      school TEXT NOT NULL,
      major TEXT,
      degree TEXT,
      start_date TEXT,
      end_date TEXT,
      is_current INTEGER DEFAULT 0,
      user_id INTEGER,
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS candidate_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL,
      contact_type TEXT,
      contact_at TEXT,
      content TEXT,
      next_follow_up_at TEXT,
      user_id INTEGER,
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ===== v6.5 优化：候选人 FTS5 全文搜索 =====
  // sql.js 1.10+ 启用 SQLITE_ENABLE_FTS5 时支持；不支持时降级到 LIKE（路由层感知）。
  // 失败策略：try-catch 包住全部，失败时 globalThis.__FTS_AVAILABLE__ = false，不破坏现有功能。
  try {
    STATE.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS candidates_fts USING fts5(
        candidate_id UNINDEXED,
        name,
        phone,
        email,
        current_company,
        tokenize = 'unicode61 remove_diacritics 2'
      );
    `);
    // triggers: candidates INSERT/UPDATE/DELETE 同步到 FTS
    STATE.db.exec(`
      CREATE TRIGGER IF NOT EXISTS candidates_fts_ai AFTER INSERT ON candidates BEGIN
        INSERT INTO candidates_fts(candidate_id, name, phone, email, current_company)
        VALUES (NEW.id, COALESCE(NEW.name, ''), COALESCE(NEW.phone, ''), COALESCE(NEW.email, ''), COALESCE(NEW.current_company, ''));
      END;
    `);
    STATE.db.exec(`
      CREATE TRIGGER IF NOT EXISTS candidates_fts_au AFTER UPDATE ON candidates BEGIN
        UPDATE candidates_fts SET name = COALESCE(NEW.name, ''), phone = COALESCE(NEW.phone, ''),
          email = COALESCE(NEW.email, ''), current_company = COALESCE(NEW.current_company, '')
        WHERE candidate_id = NEW.id;
      END;
    `);
    STATE.db.exec(`
      CREATE TRIGGER IF NOT EXISTS candidates_fts_ad AFTER DELETE ON candidates BEGIN
        DELETE FROM candidates_fts WHERE candidate_id = OLD.id;
      END;
    `);
    // backfill（已有 candidates 数据；INSERT OR IGNORE 避免与 trigger 重复插入）
    STATE.db.exec(`INSERT OR IGNORE INTO candidates_fts(candidate_id, name, phone, email, current_company)
             SELECT id, COALESCE(name, ''), COALESCE(phone, ''), COALESCE(email, ''), COALESCE(current_company, '')
             FROM candidates`);
    globalThis.__FTS_AVAILABLE__ = true;
  } catch (e) {
    // FTS5 不支持 → 降级（不抛错，保留 LIKE + 索引方案）
    console.warn('FTS5 not available, falling back to LIKE:', e.message);
    globalThis.__FTS_AVAILABLE__ = false;
  }
  // ===== 优化结束 =====

  safeExec('ALTER TABLE interviews ADD COLUMN user_id INTEGER');
  safeExec('ALTER TABLE interviews ADD COLUMN deleted_at TEXT');
  safeExec('ALTER TABLE tasks ADD COLUMN user_id INTEGER');
  safeExec('ALTER TABLE tasks ADD COLUMN deleted_at TEXT');
  safeExec('ALTER TABLE client_notes ADD COLUMN user_id INTEGER');
  safeExec('ALTER TABLE candidate_tags ADD COLUMN user_id INTEGER');
  safeExec('ALTER TABLE candidate_tags ADD COLUMN deleted_at TEXT');

  // ===== P1-NEW-2 修复：client_notes 加 deleted_at + user_id + 索引 =====
  // 原表 client_notes 只有 id/client_id/client_name/content/follow_up/created_at，
  // 没有 deleted_at（无法软删）和 user_id（顾问 B 能查顾问 A 的备注）。
  // 这里补 ALTER（safeExec 兜底 duplicate column，老库已存在则跳过）。
  safeExec('ALTER TABLE client_notes ADD COLUMN user_id INTEGER');
  safeExec('ALTER TABLE client_notes ADD COLUMN deleted_at TEXT');
  // ===== 修复结束 =====

  // ===== P0-3 修复：user 表加 tokens_invalidated_after 列 =====
  // 用于改密后强制撤销之前签发的所有 JWT token；老库会自动添加（NULL 时跳过校验）。
  safeExec('ALTER TABLE users ADD COLUMN tokens_invalidated_after TEXT');
  // ===== 修复结束 =====

  // ===== P0-NEW-2 修复：candidate_tags 加 version 列做乐观锁 =====
  // 跨文件写入（candidates.js PUT /:id/tags + batchAction vs tags.js rename/delete/merge）
  // 仅用 withTagsLock 锁不全：绕过锁的写路径会读旧 JSON → 改 → 写 → 覆盖他人结果。
  // 改为乐观锁：SELECT version → UPDATE WHERE version = ?，version 不匹配 → 拒绝/跳过。
  safeExec('ALTER TABLE candidate_tags ADD COLUMN version INTEGER DEFAULT 0');
  // ===== 修复结束 =====

  STATE.db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_interviews_user ON interviews(user_id);
    CREATE INDEX IF NOT EXISTS idx_interviews_deleted ON interviews(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_candidate_tags_user ON candidate_tags(user_id);
    CREATE INDEX IF NOT EXISTS idx_candidate_tags_deleted ON candidate_tags(deleted_at);
    -- ===== P1-NEW-3 修复：candidate_tags 加 candidate_id 索引 =====
    -- 其他子表（experiences/educations/contacts/recs）都有 _candidate 索引，
    -- 唯独 candidate_tags 漏了；candidate_id 是 INTEGER PRIMARY KEY，但 B-tree
    -- 索引查找需要显式声明才能命中（sql.js 弱类型 WHERE 字符串不会自动走索引）
    CREATE INDEX IF NOT EXISTS idx_candidate_tags_candidate ON candidate_tags(candidate_id);
    -- ===== 修复结束 =====
    CREATE INDEX IF NOT EXISTS idx_candidates_user ON candidates(user_id);
    CREATE INDEX IF NOT EXISTS idx_candidates_deleted ON candidates(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status);
    CREATE INDEX IF NOT EXISTS idx_candidates_updated ON candidates(updated_at DESC);
    -- v2-3 (P3-16) 修复：候选人池 ?keyword 搜索支持
    -- LIKE '%k%' 不能用 B-tree 索引（通配符在左）；加 name/phone/email 等值索引
    -- + 前端关键词长度限制（候选 keyword 长度 < 2 直接拒）
    CREATE INDEX IF NOT EXISTS idx_candidates_name ON candidates(name);
    CREATE INDEX IF NOT EXISTS idx_candidates_phone ON candidates(phone);
    CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email);
    -- 修复结束
    CREATE INDEX IF NOT EXISTS idx_experiences_candidate ON candidate_experiences(candidate_id);
    CREATE INDEX IF NOT EXISTS idx_experiences_user ON candidate_experiences(user_id);
    CREATE INDEX IF NOT EXISTS idx_experiences_deleted ON candidate_experiences(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_educations_candidate ON candidate_educations(candidate_id);
    CREATE INDEX IF NOT EXISTS idx_educations_user ON candidate_educations(user_id);
    CREATE INDEX IF NOT EXISTS idx_educations_deleted ON candidate_educations(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_contacts_candidate ON candidate_contacts(candidate_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_user ON candidate_contacts(user_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_deleted ON candidate_contacts(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_clients_deleted ON clients(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
    CREATE INDEX IF NOT EXISTS idx_clients_updated ON clients(updated_at DESC);
    -- P1-NEW-2 修复：client_notes 索引
    CREATE INDEX IF NOT EXISTS idx_client_notes_client ON client_notes(client_id);
    CREATE INDEX IF NOT EXISTS idx_client_notes_deleted ON client_notes(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_client_notes_user ON client_notes(user_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_owner ON jobs(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_deleted ON jobs(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_updated ON jobs(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_rec_candidate ON recommendations(candidate_id);
    CREATE INDEX IF NOT EXISTS idx_rec_user ON recommendations(recommend_user_id);
    CREATE INDEX IF NOT EXISTS idx_rec_status ON recommendations(status);
    CREATE INDEX IF NOT EXISTS idx_rec_deleted ON recommendations(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_rec_change ON recommendations(last_status_change_at);
    -- ===== v6.5 优化：overdue 复合索引（帮助 query optimizer 走索引）=====
    -- overdue 查询常见模式：WHERE status = ? AND last_status_change_at < ?（找滞留 N 天的推荐）
    -- 和 WHERE status = ? ORDER BY recommend_at DESC（按推荐时间排序的列表）
    -- 单列索引 status 让 optimizer 候选多个；复合 (status, last_status_change_at) /
    -- (status, recommend_at) 让 WHERE + ORDER BY 一条索引覆盖，扫描次数骤降。
    CREATE INDEX IF NOT EXISTS idx_rec_status_change ON recommendations(status, last_status_change_at);
    CREATE INDEX IF NOT EXISTS idx_rec_status_recommend ON recommendations(status, recommend_at);
    -- ===== 优化结束 =====
    CREATE INDEX IF NOT EXISTS idx_rec_hist_rec ON recommendation_status_history(recommendation_id);
  `);

  // 邮箱 per-user 唯一（partial index：软删除的记录不占邮箱）
  safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_candidates_email
    ON candidates(email, user_id)
    WHERE email != '' AND deleted_at IS NULL`);
}

async function seedUsersIfNeeded() {
  const demoSeed = String(process.env.DEMO_SEED || '').toLowerCase();
  const isSeedRun = process.argv.includes('--seed');
  const enabled = ['1', 'true', 'yes', 'on'].includes(demoSeed) || isSeedRun;
  if (!enabled) return;

  const cnt = STATE.db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
  if (cnt > 0 && !isSeedRun) return;

  const adminHash = await bcrypt.hash('admin123', 10);
  const demoHash = await bcrypt.hash('demo123', 10);

  if (isSeedRun) {
    STATE.db.exec("DELETE FROM users WHERE username IN ('admin', 'demo')");
  }

  STATE.db.prepare(`
    INSERT INTO users (username, password_hash, display_name, role)
    VALUES (?, ?, ?, ?)
  `).run('admin', adminHash, '系统管理员', 'admin');

  STATE.db.prepare(`
    INSERT INTO users (username, password_hash, display_name, role)
    VALUES (?, ?, ?, ?)
  `).run('demo', demoHash, '演示顾问', 'consultant');

  console.log('👤 Demo users seeded (admin/admin123, demo/demo123)');

  const taskCnt = STATE.db.prepare('SELECT COUNT(*) as cnt FROM tasks').get().cnt;
  if (taskCnt === 0) {
    seedBusinessData();
  }
}

function seedBusinessData() {
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + 7);

  const insertTask = STATE.db.prepare(`
    INSERT INTO tasks (title, "desc", priority, due_date)
    VALUES (?, ?, ?, ?)
  `);
  insertTask.run('跟进候选人张明', '产品经理岗位面试反馈待收集', 'high', today.toISOString().slice(0, 10));
  insertTask.run('推荐候选人给字节跳动', '高级前端工程师岗位', 'medium', tomorrow.toISOString().slice(0, 10));
  insertTask.run('安排第二轮面试', '李华 / 数据分析师 / 美团', 'medium', tomorrow.toISOString().slice(0, 10));
  insertTask.run('更新候选人状态', '王芳已接受 offer', 'low', nextWeek.toISOString().slice(0, 10));
  insertTask.run('跟进客户合同续签', '腾讯合作协议即将到期', 'high', nextWeek.toISOString().slice(0, 10));
  insertTask.run('补充职位JD详情', '小红书 — 高级产品设计师', 'low', nextWeek.toISOString().slice(0, 10));

  const insertInterview = STATE.db.prepare(`
    INSERT INTO interviews (candidate_name, job_title, client_name, interviewer, scheduled_at, type, status, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertInterview.run('张明', '高级产品经理', '字节跳动', '李总监',
    new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    'video', 'scheduled', '初面，重点考察产品思维');
  insertInterview.run('王芳', '前端工程师', '阿里巴巴', '赵经理',
    new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 16),
    'onsite', 'scheduled', '技术二面');
  insertInterview.run('李伟', '数据分析师', '美团', '陈主管',
    new Date(Date.now() - 86400000).toISOString().slice(0, 16),
    'video', 'completed', '表现不错，等待结果');

  // === Demo 候选人（5 个，归属 admin） ===
  seedCandidates();

  // === Demo 职位（5 个，归属 admin） ===
  seedJobs();

  console.log('🌱 Demo business data seeded');
}

function seedJobs() {
  const jobCnt = STATE.db.prepare('SELECT COUNT(*) as cnt FROM jobs').get().cnt;
  if (jobCnt > 0) return;

  const adminId = STATE.db.prepare("SELECT id FROM users WHERE username = 'admin'").get()?.id;
  if (!adminId) return;

  const insertJob = STATE.db.prepare(`
    INSERT INTO jobs
      (title, company, department, city, industry,
       salary_min, salary_max, experience_min, experience_max, education_level,
       description, status, owner_user_id, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertJob.run('高级产品经理', '字节跳动', '产品部', '北京', '互联网',
    50, 80, 5, 10, 'bachelor',
    '负责抖音电商产品线，从 0 到 1 搭建商家成长体系', 'open', adminId, 'local');
  insertJob.run('高级前端工程师', '腾讯', 'IEG 互娱', '深圳', '游戏',
    35, 60, 3, 8, 'bachelor',
    '负责游戏平台前端开发，React/TypeScript', 'open', adminId, 'local');
  insertJob.run('数据分析师', '美团', '到店事业群', '北京', 'O2O',
    25, 45, 2, 5, 'bachelor',
    '负责到店业务数据分析，SQL + Python', 'open', adminId, 'local');
  insertJob.run('P6 高级工程师', '阿里巴巴', '淘天集团', '杭州', '电商',
    40, 70, 4, 9, 'bachelor',
    '淘宝营销活动平台开发', 'open', adminId, 'local');
  insertJob.run('高级产品设计师', '小红书', '设计中心', '上海', '社区',
    30, 50, 3, 7, 'bachelor',
    '负责小红书社区核心体验设计', 'open', adminId, 'local');

  console.log('💼 Demo jobs seeded (5 jobs)');
}

function seedCandidates() {
  const candCnt = STATE.db.prepare('SELECT COUNT(*) as cnt FROM candidates').get().cnt;
  if (candCnt > 0) return;

  const adminId = STATE.db.prepare("SELECT id FROM users WHERE username = 'admin'").get()?.id;
  if (!adminId) return;

  const insertCand = STATE.db.prepare(`
    INSERT INTO candidates
      (name, gender, phone, email,
       current_position, current_company, years_of_experience, education_level, current_city,
       expected_salary_min, expected_salary_max, expected_position, expected_industry, expected_city,
       available_at, status, source_channel, source_detail, notes, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const c1 = insertCand.run('张明', 'male', '13800138001', 'zhangming@example.com',
    '高级产品经理', '字节跳动', 8, 'master', '北京',
    50, 80, '产品总监', '互联网', '北京',
    'one_month', 'active', 'referral', '朋友推荐', '有创业经历，沟通能力强', adminId);
  const c2 = insertCand.run('李华', 'female', '13900139002', 'lihua@example.com',
    '前端工程师', '小红书', 5, 'bachelor', '上海',
    30, 50, '高级前端', '电商', '上海',
    'two_weeks', 'passive', 'linkedin', '主动沟通', '暂不主动看机会', adminId);
  const c3 = insertCand.run('王芳', 'female', '13700137003', 'wangfang@example.com',
    '技术总监', '腾讯', 12, 'phd', '深圳',
    80, 120, 'CTO', '互联网', '深圳/北京',
    'immediate', 'active', 'headhunter', '其他猎头推荐', '技术深度强，团队管理经验丰富', adminId);
  const c4 = insertCand.run('陈强', 'male', '13600136004', 'chenqiang@example.com',
    'P6 高级工程师', '阿里巴巴', 3, 'bachelor', '杭州',
    35, 55, '技术专家', '互联网', '杭州',
    'three_months', 'placed', 'website', '官网投递', '已入职新公司，暂不联系', adminId);
  const c5 = insertCand.run('刘洋', 'male', '13500135005', 'liuyang@example.com',
    '数据分析师', '美团', 2, 'bachelor', '成都',
    18, 28, '数据分析师', 'O2O', '成都',
    'one_month', 'unavailable', 'other', '招聘会', '暂时不考虑新机会', adminId);

  // 给张明加 2 段工作 + 1 段教育
  const insertExp = STATE.db.prepare(`
    INSERT INTO candidate_experiences
      (candidate_id, company, position, start_date, end_date, is_current, salary, description, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEdu = STATE.db.prepare(`
    INSERT INTO candidate_educations
      (candidate_id, school, major, degree, start_date, end_date, is_current, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertContact = STATE.db.prepare(`
    INSERT INTO candidate_contacts
      (candidate_id, contact_type, contact_at, content, next_follow_up_at, user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertExp.run(c1.lastInsertRowid, '字节跳动', '高级产品经理', '2019-03', 'present', 1, '60k/月', '负责抖音电商产品线', adminId);
  insertExp.run(c1.lastInsertRowid, '美团', '产品经理', '2016-07', '2019-02', 0, '40k/月', '外卖业务', adminId);
  insertEdu.run(c1.lastInsertRowid, '清华大学', '工业设计', 'master', '2014-09', '2016-06', 0, adminId);

  // 给王芳加 1 段教育
  insertEdu.run(c3.lastInsertRowid, '北京大学', '计算机科学', 'phd', '2010-09', '2015-06', 0, adminId);

  // 给刘洋加 2 条联系记录
  insertContact.run(c5.lastInsertRowid, 'phone', '2026-06-25 10:30', '电话沟通，候选人暂不考虑新机会', '2026-09-01', adminId);
  insertContact.run(c5.lastInsertRowid, 'wechat', '2026-06-20 15:00', '微信沟通，告知有合适机会再联系', '', adminId);

  console.log('👥 Demo candidates seeded (5 candidates with sub-records)');
}

function getDb() {
  if (!STATE.db) {
    throw new Error('Database not initialized');
  }
  return STATE.db;
}

function isReady() {
  return !!STATE.db;
}

if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
  init().then(() => {
    console.log('Seed run complete');
    process.exit(0);
  }).catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}

module.exports = { init, getDb, isReady };
