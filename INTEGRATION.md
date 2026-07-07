# INTEGRATION.md

> 协作者接入指南 — AI agent / 兄弟项目 / 自动化客户端
> 目标受众：编写代码调用 `headhunter-api-hub` 的工程师

## 0. 前置

- BFF 跑起来：`cd bff && npm start`（默认 `http://localhost:3001`）
- 知道目标 API base URL：dev `http://localhost:3001/api/v1`，prod 由运维提供
- 准备好 `JWT` 或 `API Key`（下面教怎么拿）

## 1. 鉴权：2 选 1

### 1.1 JWT（人类用户 / 短期 token）

适合：UI、交互式客户端、需要 user 上下文的场景。

```bash
# Step 1: 登录拿 token
curl -X POST $API_BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 响应
{
  "ok": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { "id": 1, "username": "admin", "role": "admin", ... }
  }
}

# Step 2: 用 token 调 API
curl -H "Authorization: Bearer $TOKEN" $API_BASE/candidates
```

**TTL**：默认 7 天。改密会撤销所有旧 token（`tokens_invalidated_after` 字段）。

### 1.2 API Key（服务消费者，AI agent / 兄弟项目）

适合：自动化客户端、CI/CD 脚本、长跑服务。

```bash
# Step 1: 一次性签发（明文 key 只显示这一次！）
cd bff
node scripts/create-api-key.js "my-ai-agent" --scopes "read:candidates,read:jobs"

# 输出
#   client_name : my-ai-agent
#   scopes      : ["read:candidates","read:jobs"]
#   id (db)     : 5
#   prefix      : hha_Cls3
#   key (plain) : hha_Cls3OYsU3DXJK5DaZYLv05B8q08v-wm-c9nnvL4IL5s
# ⚠️ 务必现在保存！ 之后无法再查

# Step 2: 用 key 调 API
curl -H "Authorization: ApiKey hha_Cls3OYsU3DXJK5DaZYLv05B8q08v-wm-c9nnvL4IL5s" \
  $API_BASE/candidates
```

**撤销**（SQL）：
```sql
UPDATE api_keys SET revoked_at = datetime('now') WHERE client_name = 'my-ai-agent';
```

**Scopes**（空格分隔，可用 `*` 通配）：
- `read:candidates` / `write:candidates`
- `read:jobs` / `write:jobs`
- `read:clients` / `write:clients`
- `read:recommendations` / `write:recommendations`
- `*`（通配所有）

不传 `--scopes` 或传空 → 等同 `*`。

**RBAC**：
- JWT 用户：由 `role`（admin/consultant）控制访问范围
- API Key 用户：scopes + 隐式 admin role（除非显式 `user_id` 字段）

---

## 2. 错误处理

所有非 2xx 响应：

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "资源不存在",
    "details": { /* 可选 */ }
  }
}
```

### 错误码速查

| Code | HTTP | 含义 |
|---|---|---|
| `NO_TOKEN` | 401 | 无 Authorization 头 |
| `INVALID_TOKEN` | 401 | JWT 过期 / 错误 / 撤销 |
| `UNAUTHORIZED` | 401 | 用户被禁用 |
| `FORBIDDEN` | 403 | 权限不足（role 或 scope）|
| `NOT_FOUND` | 404 | 资源不存在 |
| `VALIDATION_ERROR` | 400 | 参数校验失败 |
| `DUPLICATE` | 409 | 唯一索引冲突 |
| `CONFLICT` | 409 | 乐观锁冲突 |
| `RATE_LIMITED` | 429 | 限流 |
| `INTERNAL_ERROR` | 500 | 服务器错误 |

### 处理建议

```python
def call_api(method, path, **kwargs):
    r = requests.request(method, API_BASE + path, **kwargs)
    if r.status_code == 401:
        # token 过期 — 重新登录
        token = login()
        kwargs['headers']['Authorization'] = f'Bearer {token}'
        return call_api(method, path, **kwargs)
    if r.status_code == 429:
        # 限流 — 等待 Retry-After 秒
        time.sleep(int(r.headers.get('Retry-After', 60)))
        return call_api(method, path, **kwargs)
    data = r.json()
    if not data['ok']:
        raise ApiError(data['error'])
    return data['data']
```

---

## 3. 客户端代码示例

### 3.1 Python (requests)

```python
import requests

API_BASE = 'http://localhost:3001/api/v1'
API_KEY = 'hha_Cls3OYsU3DXJK5DaZYLv05B8q08v-wm-c9nnvL4IL5s'

def list_candidates(page=1, page_size=20, keyword=None):
    r = requests.get(f'{API_BASE}/candidates',
                     params={'page': page, 'pageSize': page_size, 'keyword': keyword},
                     headers={'Authorization': f'ApiKey {API_KEY}'})
    r.raise_for_status()
    return r.json()['data']

# 用
cands = list_candidates(keyword='张')
for c in cands:
    print(c['id'], c['name'])
```

### 3.2 JavaScript (fetch, ESM)

```javascript
const API_BASE = 'http://localhost:3001/api/v1';
const API_KEY = 'hha_Cls3OYsU3DXJK5DaZYLv05B8q08v-wm-c9nnvL4IL5s';

async function listCandidates({ keyword, page = 1 } = {}) {
  const qs = new URLSearchParams({ keyword, page, pageSize: 20 });
  const r = await fetch(`${API_BASE}/candidates?${qs}`, {
    headers: { Authorization: `ApiKey ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  const data = await r.json();
  if (!data.ok) throw new Error(data.error.message);
  return data.data;
}
```

### 3.3 curl

```bash
# 列出 candidate id=1 详情
curl -sS $API_BASE/candidates/1 \
  -H "Authorization: ApiKey $API_KEY"

# 创建 candidate
curl -sS -X POST $API_BASE/candidates \
  -H "Authorization: ApiKey $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"张三","phone":"13800138000","email":"zhang@test.com"}'

# 改密
curl -sS -X POST $API_BASE/auth/change-password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"old_password":"admin123","new_password":"newpass123"}'

# AI 匹配：候选人 → 职位
curl -sS -X POST $API_BASE/ai-matching/candidate/1/match \
  -H "Authorization: ApiKey $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## 4. 关键约定

### 4.1 ID 自增
candidate / job / client / recommendation / interview / task 的 ID 是 `INTEGER PRIMARY KEY AUTOINCREMENT`，新行 = 当前最大 ID + 1。

### 4.2 软删除
所有业务表都有 `deleted_at TEXT DEFAULT NULL`。`DELETE /<resource>/:id` 设为 `datetime('now')`。admin 可 `?includeDeleted=true` 查所有。

**级联软删除**：
- `DELETE /candidates/:id` → 同时软删 5 张子表（experiences / educations / contacts / recommendations / candidate_tags）
- `DELETE /clients/:id` → 同时软删 `client_notes`

### 4.3 时间格式
DB 存 `YYYY-MM-DD HH:MM:SS` (UTC)，前端用 `new Date(s + 'Z')` 显式按 UTC 解析。

### 4.4 分页
`?page=1&pageSize=20`（默认 20，max 100）。响应 meta:
```json
{ "meta": { "total": 42, "page": 1, "pageSize": 20, "hasMore": true } }
```

### 4.5 状态机（推荐）
7 状态: `recommended → pending_feedback → interviewing → offered → hired`（终态）
或 `rejected` / `withdrawn`（终态）

`POST /recommendations/:id/status` body: `{ "to_status": "interviewing", "note": "..." }`

非法跳转返回 409 CONFLICT。

---

## 5. 完整示例：AI agent 抓所有 active 候选人 → 推送

```python
import requests, time

API_BASE = 'http://localhost:3001/api/v1'
API_KEY = 'hha_Cls3OYsU3DXJK5DaZYLv05B8q08v-wm-c9nnvL4IL5s'

def fetch_all_active_candidates():
    page = 1
    while True:
        r = requests.get(f'{API_BASE}/candidates',
                         params={'page': page, 'pageSize': 100, 'status': 'active'},
                         headers={'Authorization': f'ApiKey {API_KEY}'})
        r.raise_for_status()
        data = r.json()['data']
        for c in data:
            yield c
        if not data['meta']['hasMore']:
            break
        page += 1

for c in fetch_all_active_candidates():
    # 推给 AI agent 分析
    print(f"#{c['id']} {c['name']} ({c['current_position']})")
    time.sleep(0.1)  # 避免限流
```

---

## 6. 故障排查

| 现象 | 检查 |
|---|---|
| `INVALID_TOKEN` 持续 | JWT_SECRET 是否变了 / token 是否被改密撤销 |
| `CORS` 报错（浏览器场景）| 后端 `.env` 的 `CORS_ORIGINS` 是否含前端 origin |
| `429 RATE_LIMITED` | 调慢频率；或 `scripts/create-api-key.js` 用 `--user-id 1` (admin) 跳限 |
| `NOT_FOUND` 但 resource 存在 | 检查 `?includeDeleted=true` (admin only) |
| `INTERNAL_ERROR` 看 server stdout | stderr 通常有完整 stack trace |
| Swagger UI 路径点开 404 | spec path 大小写可能跟实际路由不一致 — 报告 issue |

---

## 7. 跟其他兄弟项目的关系

| 项目 | 关系 | 状态 |
|---|---|---|
| **[headhunter-frontend](https://github.com/qing3a/headhunter-frontend)** | 浏览器 UI（本仓的 v9.0 拆分） | 独立维护 |
| **[ow-headhunter-erp](https://github.com/qing3a/ow-headhunter-erp)** | 单机猎头 ERP（自包含 BFF + UI） | 独立；可选迁移到调本仓 API |
| AI agents（Claude / Cursor / 自建） | 通过 HTTP 消费本仓 | 推荐路径 |

---

## 8. 进一步

- 看 [API.md](./API.md) 完整 60 端点
- 看 [`bff/openapi.json`](./bff/openapi.json) 机器可读 spec
- 看 Swagger UI：`http://localhost:3001/api/docs`
- 出 issue：GitHub Issues