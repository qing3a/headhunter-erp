/**
 * 侧边栏菜单配置（数据驱动）
 * 加新菜单只改本文件 1 处
 *
 * 字段说明：
 *   key      - 唯一 ID，对应 data-nav-key，用于 setActiveNav 激活态
 *   label    - 显示文本
 *   icon     - lucide 图标名
 *   path     - 相对当前页面的目标路径
 *   pageKey  - URL 文件名（不含 .html），用于 PAGE_TITLES 反查标题
 *   roles    - 可选，角色白名单（缺省 = 全部角色可见）
 *   group    - 'main' 主菜单 / 'system' 底部固定组
 *
 * 未来扩展点（暂未启用）：
 *   badge    - function() { return number/string; } 显示未读数
 *   children - 子菜单数组
 *   external - true 时 a 标签加 target="_blank"
 */
window.MENU_CONFIG = [
  {
    group: 'main',
    items: [
      { key: 'dashboard',     label: '工作台',      icon: 'layout-grid',    path: 'dashboard.html',             pageKey: 'dashboard' },
      { key: 'candidates',    label: '候选人库',    icon: 'users',          path: 'candidate-pool.html',       pageKey: 'candidate-pool',    alias: ['candidate-detail', 'candidate-import'] },
      { key: 'jobs',          label: '职位管理',    icon: 'briefcase',      path: 'job-management.html',       pageKey: 'job-management',    alias: ['job-detail', 'job-create'] },
      { key: 'ai-matching',   label: 'AI 智能匹配', icon: 'sparkles',       path: 'ai-matching.html',           pageKey: 'ai-matching' },
      { key: 'clients',       label: '客户管理',    icon: 'building-2',     path: 'client-management.html',     pageKey: 'client-management', alias: ['client-detail'] },
      { key: 'interviews',    label: '面试管理',    icon: 'calendar-check', path: 'interview-management.html', pageKey: 'interview-management', alias: ['interview-detail'] },
      { key: 'reports',       label: '数据报表',    icon: 'bar-chart-3',    path: 'reports.html',               pageKey: 'reports' },
      { key: 'notifications', label: '消息中心',    icon: 'bell',           path: 'notifications.html',         pageKey: 'notifications' }
    ]
  },
  {
    group: 'system',
    items: [
      { key: 'settings', label: '系统设置', icon: 'settings', path: 'settings.html', pageKey: 'settings' },
      { key: 'tags', label: '标签管理', icon: 'tag', path: 'tag-management.html', pageKey: 'tag-management' }
    ]
  }
];

/**
 * pageKey -> 页面标题（替代 layout.js 旧 PAGE_CONFIG）
 */
window.PAGE_TITLES = {
  'dashboard': '工作台',
  'candidate-pool': '候选人库',
  'candidate-detail': '候选人详情',
  'candidate-import': '导入候选人',
  'job-management': '职位管理',
  'job-detail': '职位详情',
  'job-create': '创建职位',
  'ai-matching': 'AI 智能匹配',
  'client-management': '客户管理',
  'client-detail': '客户详情',
  'interview-management': '面试管理',
  'interview-detail': '面试详情',
  'reports': '数据报表',
  'notifications': '消息中心',
  'settings': '系统设置',
  'tag-management': '标签管理'
};
