const http = require('http');

function request(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : '';
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    };
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    
    const options = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers
    };
    
    const req = http.request(options, res => {
      let result = '';
      res.on('data', chunk => result += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(result));
        } catch (e) {
          console.log('Raw response:', result);
          reject(e);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  try {
    // 1. 登录
    console.log('=== 1. 登录 ===');
    const loginResult = await request('POST', '/api/v1/auth/login', {
      username: 'admin',
      password: 'admin123'
    });
    console.log('登录结果:', loginResult.ok ? '成功' : '失败');
    const token = loginResult.data.token;
    
    // 2. 创建候选人
    console.log('\n=== 2. 创建候选人 ===');
    const candidate = await request('POST', '/api/v1/candidates', {
      name: '李思远',
      gender: '男',
      phone: '13812345678',
      email: 'lisiyuan@example.com',
      current_position: '高级前端工程师',
      current_company: '字节跳动',
      years_of_experience: 6,
      education_level: '本科',
      current_city: '北京',
      expected_salary_min: 35000,
      expected_salary_max: 45000,
      expected_position: '前端技术专家',
      expected_industry: '互联网',
      expected_city: '北京',
      available_at: '2026-08-01',
      status: 'active',
      source_channel: 'boss直聘',
      source_detail: '主动投递',
      notes: '技术能力强，有大型项目经验，沟通顺畅，对薪资有一定要求。'
    }, token);
    console.log('创建结果:', candidate.ok ? '成功' : '失败');
    if (candidate.ok) {
      console.log('候选人ID:', candidate.data.id);
      console.log('姓名:', candidate.data.name);
      console.log('当前职位:', candidate.data.current_position);
      console.log('当前公司:', candidate.data.current_company);
      const candidateId = candidate.data.id;
      
      // 3. 添加工作经历
      console.log('\n=== 3. 添加工作经历 ===');
      
      const exp1 = await request('POST', `/api/v1/candidates/${candidateId}/experiences`, {
        company: '字节跳动',
        position: '高级前端工程师',
        start_date: '2023-03',
        end_date: '',
        is_current: true,
        salary: '35K-14薪',
        description: '负责抖音电商前端架构设计与核心功能开发，主导微前端改造项目，将首屏加载时间优化40%。带领5人小组完成多个大型营销活动页面开发。'
      }, token);
      console.log('工作经历1:', exp1.ok ? '添加成功' : '失败');
      
      const exp2 = await request('POST', `/api/v1/candidates/${candidateId}/experiences`, {
        company: '阿里巴巴',
        position: '前端工程师',
        start_date: '2020-07',
        end_date: '2023-02',
        is_current: false,
        salary: '25K-16薪',
        description: '参与淘宝商家后台系统开发，负责商品管理模块。使用React+TypeScript技术栈，推动团队代码规范建设。'
      }, token);
      console.log('工作经历2:', exp2.ok ? '添加成功' : '失败');
      
      // 4. 添加教育背景
      console.log('\n=== 4. 添加教育背景 ===');
      const edu = await request('POST', `/api/v1/candidates/${candidateId}/educations`, {
        school: '北京邮电大学',
        major: '计算机科学与技术',
        degree: '本科',
        start_date: '2016-09',
        end_date: '2020-06',
        is_current: false
      }, token);
      console.log('教育背景:', edu.ok ? '添加成功' : '失败');
      
      // 5. 添加标签和评分
      console.log('\n=== 5. 添加标签和评分 ===');
      const tags = await request('PUT', `/api/v1/candidates/${candidateId}/tags`, {
        tags: ['React', 'TypeScript', '微前端', '性能优化', '架构设计', '带团队经验'],
        rating: 4,
        notes: '技术扎实，有大厂背景，适合中高级前端岗位。薪资期望略高，但能力匹配。'
      }, token);
      console.log('标签评分:', tags.ok ? '添加成功' : '失败');
      
      // 6. 查询完整信息验证
      console.log('\n=== 6. 查询完整信息验证 ===');
      const detail = await request('GET', `/api/v1/candidates/${candidateId}`, null, token);
      if (detail.ok) {
        console.log('✅ 候选人档案创建完成！');
        console.log('\n基本信息:');
        console.log('  姓名:', detail.data.name);
        console.log('  性别:', detail.data.gender);
        console.log('  手机:', detail.data.phone);
        console.log('  邮箱:', detail.data.email);
        console.log('  当前职位:', detail.data.current_position);
        console.log('  当前公司:', detail.data.current_company);
        console.log('  工作年限:', detail.data.years_of_experience, '年');
        console.log('  学历:', detail.data.education_level);
        console.log('  所在城市:', detail.data.current_city);
        console.log('  期望薪资:', detail.data.expected_salary_min, '-', detail.data.expected_salary_max);
        console.log('  来源:', detail.data.source_channel);
        console.log('  状态:', detail.data.status);
        console.log('\n工作经历 (', detail.data.experiences.length, '份):');
        detail.data.experiences.forEach((exp, i) => {
          console.log(`  ${i+1}. ${exp.company} - ${exp.position}`);
          console.log(`     ${exp.start_date} ~ ${exp.is_current ? '至今' : exp.end_date}`);
        });
        console.log('\n教育背景 (', detail.data.educations.length, '份):');
        detail.data.educations.forEach((edu, i) => {
          console.log(`  ${i+1}. ${edu.school} - ${edu.major} (${edu.degree})`);
          console.log(`     ${edu.start_date} ~ ${edu.end_date}`);
        });
        console.log('\n标签 (', detail.data.tags.length, '个):');
        console.log(' ', detail.data.tags.join(', '));
        console.log('\n评分:', detail.data.rating, '/ 5');
      }
    }
    
  } catch (e) {
    console.error('出错了:', e.message);
    console.error(e.stack);
  }
}

main();
