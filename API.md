# API 文档

> **headhunter-api-hub** 完整 REST API 文档
> Base URL：`http://localhost:3001/api/v1`
> 认证：除 `/auth/login` 外，所有端点需要以下任一：
> - `Authorization: Bearer <jwt>` （人类用户）
> - `Authorization: ApiKey <key>` （服务消费者 — v9.0-gamma+）

## 通用响应格式

**成功**：
```json
{ "ok": true, "data": {...}, "meta": { "total": 10, "page": 1, "pageSize": 20 } }
```

**失败**：
```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "资源不存在" } }
```

错误码：
- `NO_TOKEN` 401 未登录（缺 Authorization 头）
- `INVALID_TOKEN` 401 token 过期 / 错误 / 已撤销
- `UNAUTHORIZED` 401 用户被禁用
- `FORBIDDEN` 403 权限不足（role 或 scope）
- `NOT_FOUND` 404 资源不存在
- `VALIDATION_ERROR` 400 参数校验失败
- `DUPLICATE` / `CONFLICT` 409 数据冲突
- `RATE_LIMITED` 429 限流
- `INTERNAL_ERROR` 500 服务器错误

---

## 0. 鉴权（v9.0-gamma 起支持 2 种方式）

### 0.1 JWT（人类用户）

```bash
# 登录拿 token
curl -X POST $API_BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
# → { "ok":true, "data":{ "token":"eyJ...", "user":{...} } }

# 用 token
curl -H "Authorization: Bearer eyJ..." $API_BASE/candidates
```

**TTL**：默认 7 天。改密会撤销所有旧 token。

### 0.2 API Key（服务消费者）

适合 AI agent / 兄弟项目 / CI 脚本。

```bash
# 一次性签发
cd bff
node scripts/create-api-key.js "my-ai-agent" --scopes "read:candidates,read:jobs"
# → key (plain) : hha_Cls3OYsU3DXJK5DaZYLv05B8q08v-wm-c9nnvL4IL5s
# ⚠️ 现在保存！ 之后无法再查

# 用 key
curl -H "Authorization: ApiKey hha_Cls3OYsU3DXJK5DaZYLv05B8q08v-wm-c9nnvL4IL5s" \
  $API_BASE/candidates
```

**Scopes**（可选）：`read:candidates` / `write:candidates` / `read:jobs` / `*`（通配）。空 scopes = 通配。

**撤销**（SQL）：
```sql
UPDATE api_keys SET revoked_at = datetime('now') WHERE client_name = 'my-ai-agent';
```

详细协作流程见 [INTEGRATION.md](./INTEGRATION.md)。

---

## 1. 认证 (`/auth`)

### 1.1 登录
```
POST /auth/login
```
Body：`{ username, password }`
限流：15 分钟 10 次

返回：`{ token, user: { id, username, displayName, role, status, lastLoginAt, createdAt } }`

### 1.2 登出
```
POST /auth/logout
```

### 1.3 当前用户
```
GET /auth/me
```
返回：`{ id, username, displayName, role }`

### 1.4 改密
```
POST /auth/change-password
```
Body：`{ old_password, new_password }`（new_password ≥ 6 位）
副作用：所有旧 token 立即失效（`tokens_invalidated_after`）

### 1.5 创建用户（admin only）
```
POST /auth/register
```
Body：`{ username, password, displayName, role }`
role：`admin` / `consultant` / `leader` / `manager`

### 1.6 用户列表（admin only）
```
GET /auth/users
```

### 1.7 用户详情
```
GET /auth/users/:id
```
自己 / admin 可访问

### 1.8 更新用户
```
PUT /auth/users/:id
```
Body：`{ displayName }`

### 1.9 审计日志（admin only）
```
GET /auth/audit-log?action=...&userId=...
```

---

## 2. 候选人 (`/candidates`)

### 2.1 列表
```
GET /candidates?page=1&pageSize=20&keyword=张三&status=active&city=北京
```
Query：
- `keyword` 模糊匹配 name / phone / email / current_company
- `status` active / passive / placed / unavailable / blacklist
- `city` `source_channel` `education_level` `industry`
- `years_min` `years_max` `salary_min` `salary_max`
- `tag` 单 tag 匹配（精确匹配 JSON 字符串中的引号包围 tag）
- `has_recommendation` true / false
- `sort` `created_at_desc` / `salary_desc` / `years_desc`

### 2.2 创建
```
POST /candidates
```
Body：`{ name, gender, phone, email, current_position, current_company, years_of_experience, education_level, current_city, expected_salary_min, expected_salary_max, expected_position, expected_industry, expected_city, available_at, status, source_channel, source_detail, notes }`

邮箱 per-user 唯一

### 2.3 详情
```
GET /candidates/:id
```
返回：`{ ...主表, experiences[], educations[], contacts[], recommendations[] }`

### 2.4 更新
```
PUT /candidates/:id
```
Body 任意字段（合并模式）
自动写 `audit_log` (`UPDATE_candidate`)

### 2.5 软删除
```
DELETE /candidates/:id
```
**级联软删除** 5 张子表（experiences / educations / contacts / recommendations / candidate_tags）

### 2.6 邮箱查重
```
GET /candidates/check-email?email=...&id=...
```
返回：`{ available: true | false }`（编辑时排除自己：`?id=当前候选人`）

### 2.7 更新 tags
```
PUT /candidates/:id/tags
```
Body：`{ tags: [...], rating: 0-5, notes: '...' }`

### 2.8 批量操作
```
POST /candidates/batch
```
Body：`{ action, ids, params }`
- action：`tag` / `untag` / `status` / `delete`
- ids：候选人 id 数组（最多 500）
- params：
  - `tag` / `untag`：`{ tag: 'VIP' }`
  - `status`：`{ status: 'active' }`

返回：`{ success, failed, errors: [{row, error}], skippedItems }`

---

## 3. 候选人子表

### 3.1 工作经历
```
GET    /candidates/:id/experiences
POST   /candidates/:id/experiences
PUT    /candidates/:id/experiences/:eid
DELETE /candidates/:id/experiences/:eid
```

### 3.2 教育背景
```
GET    /candidates/:id/educations
POST   /candidates/:id/educations
PUT    /candidates/:id/educations/:eid
DELETE /candidates/:id/educations/:eid
```

### 3.3 联系记录
```
GET    /candidates/:id/contacts
POST   /candidates/:id/contacts
PUT    /candidates/:id/contacts/:cid
DELETE /candidates/:id/contacts/:cid
```

---

## 4. 职位 (`/jobs`)

### 4.1 列表
```
GET /jobs?page=1&pageSize=20&keyword=...&status=open
```

### 4.2 创建
```
POST /jobs
```
Body：`{ title, company, department, city, industry, salary_min, salary_max, experience_min, experience_max, education_level, description, status }`

### 4.3 详情
```
GET /jobs/:id
```

### 4.4 更新
```
PUT /jobs/:id
```

### 4.5 软删除
```
DELETE /jobs/:id
```

### 4.6 下拉
```
GET /jobs/lookup?keyword=...
```
返回：`[{ id, title, company, city }]`

### 4.7 同步远端
```
GET /jobs/sync-from-platform
```
（admin only）从 `PLATFORM_API_BASE` 拉取职位，本地已存在（`external_id` 唯一）跳过

---

## 5. 推荐 (`/recommendations`)

### 5.1 列表
```
GET /recommendations?candidate_id=...&job_id=...&status=...
```

### 5.2 详情
```
GET /recommendations/:id
```
返回：`{ ..., history: [...] }`（状态变更历史）

### 5.3 创建
```
POST /recommendations
```
Body：`{ candidate_id, job_id, recommend_method, expected_salary, notes, client_name }`
**注意**：`job_id` 关联的职位 `status !== 'closed'` 才能推荐

### 5.4 更新
```
PUT /recommendations/:id
```

### 5.5 软删除
```
DELETE /recommendations/:id
```

### 5.6 状态流转
```
POST /recommendations/:id/status
```
Body：`{ to_status, note }`
状态机：
```
recommended → pending_feedback, interviewing, rejected, withdrawn
pending_feedback → interviewing, recommended, rejected, withdrawn
interviewing → offered, rejected, withdrawn
offered → hired, rejected, withdrawn
hired → (终态)
rejected → (终态)
withdrawn → recommended
```

### 5.7 过期待跟进
```
GET /recommendations/overdue?page=1&pageSize=50
```
推荐 ≥ 3 天无反馈的记录
分页：`{ data: [], meta: { total, page, pageSize } }`

### 5.8 手动扫描
```
POST /recommendations/scan-overdue
```
（admin only）扫描 + 自动转换 + 创建跟进 task

---

## 6. 客户 (`/clients`)

### 6.1 列表
```
GET /clients?keyword=...&page=1
```

### 6.2 创建
```
POST /clients
```

### 6.3 详情
```
GET /clients/:id
```
返回 `{ ...client, notes[] }`

### 6.4 更新
```
PUT /clients/:id
```

### 6.5 软删除
```
DELETE /clients/:id
```

### 6.6 下拉
```
GET /clients/lookup
```

### 6.7 备注 CRUD
```
GET    /clients/:id/notes
POST   /clients/:id/notes
PUT    /clients/:id/notes/:nid
DELETE /clients/:id/notes/:nid
```

---

## 7. 标签 (`/tags`)

### 7.1 列出所有 tag
```
GET /tags?keyword=...
```
返回：`[{ name, count, candidate_ids[] }]`

### 7.2 tag 下的候选人
```
GET /tags/:name/candidates
```

### 7.3 改名
```
PUT /tags/:tag/rename
```
Body：`{ new_name }`

### 7.4 删除
```
DELETE /tags/:tag
```

### 7.5 合并
```
POST /tags/merge
```
Body：`{ from: ['VIP', '重点关注'], to: '高优先级' }`
**串行化保护**（mutex）防止并发覆盖

---

## 8. 报表 (`/reports`)

### 8.1 KPI
```
GET /reports/kpi
```
返回：`{ totalCandidates, monthlyRecommendations, activeInterviews, monthlyHires }`

### 8.2 漏斗
```
GET /reports/funnel?days=30
```
返回：`{ days, stages: [{ key, label, count }] }`

### 8.3 顾问 Top
```
GET /reports/consultant-performance?days=30
```

### 8.4 状态分布
```
GET /reports/status-distribution
```

---

## 9. Excel 导入 (`/imports`)

### 9.1 下载模板
```
GET /imports/template
```
返回：`candidates_template.xlsx`（18 列）

### 9.2 预览
```
POST /imports/preview
```
multipart：`file`（必填）
返回：`{ sheetName, totalRows, headers: [...], previewRows: [...], suggestedMapping: {...} }`

### 9.3 提交导入
```
POST /imports/commit
```
multipart：
- `file`
- `mapping`（JSON 字符串：`{ "姓名": "name", "邮箱": "email", ... }`）
- `skipDuplicates`（默认 true）

返回：`{ total, success, failed, skipped, errors: [{row, error}], skippedItems: [{row, name, email, reason}] }`

字段映射（默认列名）：
```
姓名 → name
手机号 → phone
邮箱 → email
当前职位 → current_position
当前公司 → current_company
工作年限 → years_of_experience
学历 → education_level (本科/硕士/博士/高中)
所在城市 → current_city
期望薪资下限(k) → expected_salary_min
期望薪资上限(k) → expected_salary_max
期望职位 → expected_position
期望行业 → expected_industry
期望城市 → expected_city
到岗时间 → available_at (立即到岗/2 周内/1 个月内/3 个月内)
求职状态 → status (活跃求职/被动考虑/已入职/暂不考虑/黑名单)
来源渠道 → source_channel
备注 → notes
```

**邮箱格式校验**：正则 `^[^\s@]+@[^\s@]+\.[^\s@]+$`

**去重规则**：
- 邮箱 per-user 唯一（重复跳过）
- 姓名+公司 软提示

**限流**：每用户 1 小时 10 次

---

## 10. 仪表盘 (`/dashboard`)

```
GET /dashboard/stats
```

## 11. 面试 (`/interviews`)

```
GET    /interviews
POST   /interviews
GET    /interviews/:id
PUT    /interviews/:id
DELETE /interviews/:id
```

## 12. 任务 (`/tasks`)

```
GET    /tasks
POST   /tasks
PUT    /tasks/:id
DELETE /tasks/:id
```

## 13. 健康检查 (`/health`)

```
GET /health
```
返回：`{ ok: true, data: { status: 'running', time, version } }`
