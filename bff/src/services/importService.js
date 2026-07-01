const ExcelJS = require('exceljs');
const { getDb } = require('../db/init');

/**
 * 字段映射 schema（Excel 列名 → 候选人字段）
 * 中文列名（兼容常见 Excel 表头）+ 英文 key
 */
const FIELD_MAP = {
  '姓名': 'name', 'name': 'name', '姓名 ': 'name',
  '性别': 'gender', 'gender': 'gender',
  '手机号': 'phone', '手机': 'phone', 'phone': 'phone', 'tel': 'phone', 'mobile': 'phone',
  '邮箱': 'email', 'email': 'email', '邮件': 'email',
  '当前职位': 'current_position', '职位': 'current_position', 'position': 'current_position',
  '当前公司': 'current_company', '公司': 'current_company', 'company': 'current_company',
  '工作年限': 'years_of_experience', '年限': 'years_of_experience', 'years': 'years_of_experience',
  '学历': 'education_level', 'education': 'education_level',
  '所在城市': 'current_city', '城市': 'current_city', 'city': 'current_city',
  '期望薪资下限': 'expected_salary_min', 'salary_min': 'expected_salary_min',
  '期望薪资上限': 'expected_salary_max', 'salary_max': 'expected_salary_max',
  '期望职位': 'expected_position', 'expected_position': 'expected_position',
  '期望行业': 'expected_industry', 'industry': 'expected_industry',
  '期望城市': 'expected_city',
  '到岗时间': 'available_at', 'available': 'available_at',
  '求职状态': 'status', 'status': 'status',
  '来源渠道': 'source_channel', 'source': 'source_channel',
  '来源详情': 'source_detail',
  '备注': 'notes', 'notes': 'notes'
};

const EDU_MAP = {
  '高中': 'highschool', '高中及以下': 'highschool', '中专': 'highschool',
  '本科': 'bachelor', '大专': 'bachelor',
  '硕士': 'master', '研究生': 'master',
  '博士': 'phd', '博士生': 'phd'
};

const STATUS_MAP = {
  '活跃求职': 'active', '在职': 'active', '看机会': 'active',
  '被动考虑': 'passive', '暂不': 'passive',
  '已入职': 'placed',
  '暂不考虑': 'unavailable', '不考虑': 'unavailable',
  '黑名单': 'blacklist'
};

/**
 * 解析上传的 Excel，返回 sheet 头 + 前 N 行预览
 */
async function parsePreview(buffer, previewRows) {
  previewRows = previewRows || 5;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Excel 无有效 sheet');

  const headerRow = sheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: false }, function (cell, colNumber) {
    headers.push({ col: colNumber, name: String(cell.value || '').trim() });
  });
  if (!headers.length) throw new Error('Excel 第一行无表头');

  const rows = [];
  const lastRow = Math.min(sheet.rowCount, previewRows + 1); // +1 for header
  for (let r = 2; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    if (!row.hasValues) continue;
    const obj = {};
    headers.forEach(function (h) {
      const cell = row.getCell(h.col);
      obj[h.name] = cell.value != null ? String(cell.value).trim() : '';
    });
    rows.push(obj);
  }

  // 自动建议字段映射
  const suggestedMapping = {};
  headers.forEach(function (h) {
    const key = FIELD_MAP[h.name];
    if (key) suggestedMapping[h.name] = key;
  });

  return {
    sheetName: sheet.name,
    totalRows: sheet.rowCount - 1, // 减去表头
    headers: headers.map(function (h) { return h.name; }),
    previewRows: rows,
    suggestedMapping: suggestedMapping
  };
}

/**
 * 解析 + 批量插入候选人
 * mapping: { Excel列名: candidates字段名 }
 * skipDuplicates: 是否跳过重复（true=跳过，false=中止）
 */
async function commitImport(buffer, mapping, ownerUserId, options) {
  options = options || {};
  const db = getDb();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Excel 无有效 sheet');

  const headerRow = sheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: false }, function (cell, colNumber) {
    headers.push({ col: colNumber, name: String(cell.value || '').trim() });
  });

  const insert = db.prepare(`
    INSERT INTO candidates
      (name, gender, phone, email,
       current_position, current_company, years_of_experience, education_level, current_city,
       expected_salary_min, expected_salary_max, expected_position, expected_industry, expected_city,
       available_at, status, source_channel, source_detail, notes, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const emailExistsStmt = db.prepare(
    "SELECT id FROM candidates WHERE email = ? AND user_id = ? AND deleted_at IS NULL"
  );

  let success = 0, failed = 0, skipped = 0;
  const errors = [];
  const skippedItems = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (!row.hasValues) continue;

    // 收集 raw 数据
    const raw = {};
    headers.forEach(function (h) {
      const cell = row.getCell(h.col);
      raw[h.name] = cell.value != null ? String(cell.value).trim() : '';
    });

    // 映射到候选人字段
    const data = { name: null, gender: null, phone: null, email: null,
      current_position: null, current_company: null, years_of_experience: 0,
      education_level: null, current_city: null, expected_salary_min: null,
      expected_salary_max: null, expected_position: null, expected_industry: null,
      expected_city: null, available_at: null, status: 'active',
      source_channel: 'excel_import', source_detail: null, notes: null };

    Object.keys(mapping).forEach(function (excelCol) {
      const target = mapping[excelCol];
      if (!target || !data.hasOwnProperty(target)) return;
      let val = raw[excelCol];
      // 类型转换
      if (['years_of_experience', 'expected_salary_min', 'expected_salary_max'].indexOf(target) !== -1) {
        const n = parseInt(val);
        if (!isNaN(n)) val = n; else val = null;
      } else if (target === 'education_level' && val) {
        val = EDU_MAP[val] || (val === '本科' || val === 'bachelor' ? 'bachelor' : (val === '硕士' || val === 'master' ? 'master' : (val === '博士' || val === 'phd' ? 'phd' : null)));
      } else if (target === 'status' && val) {
        val = STATUS_MAP[val] || (['active', 'passive', 'placed', 'unavailable', 'blacklist'].indexOf(val) !== -1 ? val : 'active');
      } else if (target === 'gender' && val) {
        val = (val === '男' || val.toLowerCase() === 'male') ? 'male' : ((val === '女' || val.toLowerCase() === 'female') ? 'female' : null);
      }
      data[target] = val;
    });

    if (!data.name || !data.name.trim()) {
      failed++;
      errors.push({ row: r, error: '姓名为空' });
      continue;
    }

    // ===== P2-B4 修复：邮箱格式校验 =====
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      failed++;
      errors.push({ row: r, error: '邮箱格式错误：' + data.email });
      continue;
    }

    // 去重：邮箱
    if (data.email) {
      const exist = emailExistsStmt.get(data.email, ownerUserId);
      if (exist) {
        if (options.skipDuplicates !== false) {
          skipped++;
          skippedItems.push({ row: r, name: data.name, email: data.email, reason: '邮箱已存在' });
          continue;
        } else {
          failed++;
          errors.push({ row: r, error: '邮箱已存在：' + data.email });
          continue;
        }
      }
    }

    try {
      insert.run(
        data.name, data.gender, data.phone, data.email,
        data.current_position, data.current_company, data.years_of_experience, data.education_level, data.current_city,
        data.expected_salary_min, data.expected_salary_max, data.expected_position, data.expected_industry, data.expected_city,
        data.available_at, data.status, data.source_channel, data.source_detail, data.notes,
        ownerUserId
      );
      success++;
    } catch (e) {
      failed++;
      errors.push({ row: r, error: e.message || String(e) });
    }
  }

  return { total: success + failed + skipped, success: success, failed: failed, skipped: skipped, errors: errors.slice(0, 20), skippedItems: skippedItems.slice(0, 20) };
}

/**
 * 生成模板 .xlsx
 */
async function generateTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('候选人模板');
  sheet.columns = [
    { header: '姓名', key: 'name', width: 12 },
    { header: '性别', key: 'gender', width: 8 },
    { header: '手机号', key: 'phone', width: 15 },
    { header: '邮箱', key: 'email', width: 20 },
    { header: '当前职位', key: 'current_position', width: 15 },
    { header: '当前公司', key: 'current_company', width: 15 },
    { header: '工作年限', key: 'years_of_experience', width: 10 },
    { header: '学历', key: 'education_level', width: 10 },
    { header: '所在城市', key: 'current_city', width: 10 },
    { header: '期望薪资下限(k)', key: 'expected_salary_min', width: 12 },
    { header: '期望薪资上限(k)', key: 'expected_salary_max', width: 12 },
    { header: '期望职位', key: 'expected_position', width: 15 },
    { header: '期望行业', key: 'expected_industry', width: 12 },
    { header: '期望城市', key: 'expected_city', width: 12 },
    { header: '到岗时间', key: 'available_at', width: 12 },
    { header: '求职状态', key: 'status', width: 12 },
    { header: '来源渠道', key: 'source_channel', width: 12 },
    { header: '备注', key: 'notes', width: 20 }
  ];
  sheet.addRow({
    name: '张三', gender: '男', phone: '13800138001', email: 'zhangsan@example.com',
    current_position: '高级前端工程师', current_company: '字节跳动', years_of_experience: 5,
    education_level: '本科', current_city: '北京',
    expected_salary_min: 30, expected_salary_max: 50,
    expected_position: '前端架构师', expected_industry: '互联网', expected_city: '北京',
    available_at: '一个月内', status: '活跃求职', source_channel: 'LinkedIn', notes: '示例数据'
  });
  // 表头加粗
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

module.exports = {
  parsePreview,
  commitImport,
  generateTemplate,
  FIELD_MAP
};
