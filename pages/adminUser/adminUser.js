// pages/adminUser/adminUser.js
const db = wx.cloud.database();

Page({
  data: {
    loading: true,
    userList: [],
    sortField: 'name',
    sortOrder: 'asc',

    showDetail: false,
    detailUser: null,

    exportLoading: false
  },

  onShow() {
    this.loadUsers();
  },

  /* =============== 一、分页读取全部数据 =============== */
  async getAllCollectionData(collectionName, whereObj = {}, pageSize = 100) {
    let all = [];
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const res = await db.collection(collectionName)
        .where(whereObj)
        .skip(skip)
        .limit(pageSize)
        .get();

      const list = res.data || [];
      all = all.concat(list);

      if (list.length < pageSize) {
        hasMore = false;
      } else {
        skip += pageSize;
      }
    }

    return all;
  },

  /* =============== 二、加载用户 + 统计信息 =============== */
  async loadUsers() {
    this.setData({ loading: true });

    try {
      // 1. 所有真实用户
      const users = await this.getAllCollectionData('users', {}, 100);

      // 2. 所有体重记录
      let weights = [];
      try {
        weights = await this.getAllCollectionData('weights', {}, 100);
      } catch (e) {
        console.warn('weights 集合不存在，略过体重统计', e);
      }

      // 3. 所有运动记录
      let runs = [];
      try {
        runs = await this.getAllCollectionData('runs', {}, 100);
      } catch (e) {
        console.warn('runs 集合不存在，略过运动统计', e);
      }

      // 4. 体重记录映射
      const weightMap = {};
      weights.forEach(item => {
        const openid = item.openid || item._openid || '';
        if (!openid) return;
        weightMap[openid] = (weightMap[openid] || 0) + 1;
      });

      // 5. 运动记录映射
      const runMap = {};
      runs.forEach(item => {
        const openid = item.openid || item._openid || '';
        if (!openid) return;
        runMap[openid] = (runMap[openid] || 0) + 1;
      });

      // 6. 组装真实数据
      let list = users.map(u => {
        const openid = u.openid || u._openid || '';
        const name = u.name || u.nickname || '';
        const school = u.school || '';
        const major = u.major || '';
        const gender = u.gender || '';
        const height = u.height || '';
        const targetWeight = u.targetWeight || u.target || '';
        const phone = u.phone || u.mobile || '';
        const account = u.account || '';
        const createdAt = u.createdAt || u.registerTime || u._createTime || '';

        let createdAtStr = '';
        if (typeof createdAt === 'string') {
          createdAtStr = createdAt;
        } else if (createdAt && createdAt.toDate) {
          createdAtStr = this.formatDateTime(createdAt.toDate());
        } else if (createdAt instanceof Date) {
          createdAtStr = this.formatDateTime(createdAt);
        }

        return {
          _id: u._id,
          openid,
          account,
          name,
          school,
          major,
          gender,
          height,
          targetWeight,
          phone,
          createdAtStr,
          weightCount: weightMap[openid] || 0,
          runCount: runMap[openid] || 0,
          raw: u,
          isMock: false
        };
      });

      // 7. 如果不足50个，页面端自动补齐模拟数据
      if (list.length < 50) {
        const mockCount = 50 - list.length;
        const mockList = this.generateMockUsers(mockCount, list.length + 1);
        list = list.concat(mockList);
      }

      this.sortAndSet(list);
    } catch (e) {
      console.error('用户信息加载失败', e);

      // 如果真实数据读取失败，直接生成 50 条模拟数据兜底
      const mockList = this.generateMockUsers(50, 1);
      this.sortAndSet(mockList);

      wx.showToast({
        title: '已展示本地模拟数据',
        icon: 'none'
      });
    }
  },

  /* =============== 三、生成本地模拟用户 =============== */
  generateMockUsers(count = 50, startIndex = 1) {
    const majors = [
      '计算机科学与技术',
      '软件工程',
      '网络工程',
      '数据科学与大数据技术',
      '人工智能',
      '电子信息工程',
      '通信工程',
      '数学与应用数学',
      '教育技术学',
      '物联网工程'
    ];

    const names = [
      '张晨', '李浩', '王宇', '刘洋', '陈涛', '杨帆', '赵凯', '黄鑫', '周博', '吴昊',
      '徐睿', '孙晨', '朱航', '马骁', '胡杰', '郭磊', '何俊', '高阳', '林涛', '罗浩',
      '郑凯', '梁宇', '谢鹏', '宋晨', '唐宁', '许航', '韩磊', '冯博', '邓超', '曹阳',
      '彭涛', '曾睿', '萧宇', '田野', '董浩', '袁凯', '潘杰', '于洋', '余晨', '苏航',
      '魏宁', '吕博', '蒋涛', '方宇', '杜浩', '沈睿', '姜凯', '崔洋', '程博', '任涛'
    ];

    const list = [];
    for (let i = 0; i < count; i++) {
      const idx = startIndex + i;
      const gender = idx % 2 === 0 ? '男' : '女';
      const height = gender === '男'
        ? this.randInt(168, 185)
        : this.randInt(156, 172);

      const targetWeight = gender === '男'
        ? this.randInt(58, 76)
        : this.randInt(45, 60);

      list.push({
        _id: `mock_${idx}`,
        openid: `mock_openid_${idx}`,
        account: `yau${String(idx).padStart(3, '0')}`,
        name: names[(idx - 1) % names.length] || `延大学生${idx}`,
        school: '延安大学',
        major: majors[(idx - 1) % majors.length],
        gender,
        height,
        targetWeight,
        phone: `13${this.randInt(100000000, 999999999)}`,
        createdAtStr: this.mockDateStr(idx),
        weightCount: this.randInt(4, 12),
        runCount: this.randInt(3, 10),
        raw: null,
        isMock: true
      });
    }

    return list;
  },

  randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  mockDateStr(seed) {
    const d = new Date();
    d.setDate(d.getDate() - (seed % 180));
    return this.formatDateTime(d);
  },

  formatDateTime(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  },

  /* =============== 四、排序逻辑 =============== */
  sortAndSet(list) {
    const { sortField, sortOrder } = this.data;

    const sorted = list.slice().sort((a, b) => {
      const va = a[sortField];
      const vb = b[sortField];

      const na = Number(va);
      const nb = Number(vb);

      if (!isNaN(na) && !isNaN(nb) && va !== '' && vb !== '') {
        return sortOrder === 'asc' ? na - nb : nb - na;
      }

      const sa = (va || '').toString();
      const sb = (vb || '').toString();

      if (sa === sb) return 0;
      if (sortOrder === 'asc') {
        return sa > sb ? 1 : -1;
      } else {
        return sa > sb ? -1 : 1;
      }
    });

    this.setData({
      userList: sorted,
      loading: false
    });
  },

  onHeaderTap(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;

    let { sortField, sortOrder } = this.data;
    if (field === sortField) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortOrder = 'asc';
    }

    this.setData({ sortField, sortOrder });
    this.sortAndSet(this.data.userList);
  },

  /* =============== 五、详情弹层 =============== */
  onRowTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;

    const user = this.data.userList.find(u => u._id === id);
    if (!user) return;

    this.setData({
      showDetail: true,
      detailUser: user
    });
  },

  closeDetail() {
    this.setData({
      showDetail: false,
      detailUser: null
    });
  },

  /* =============== 六、导出文档 =============== */
  onExportDoc() {
    const list = this.data.userList || [];
    if (!list.length) {
      wx.showToast({ title: '暂无数据可导出', icon: 'none' });
      return;
    }

    this.setData({ exportLoading: true });
    wx.showLoading({ title: '生成文档中...', mask: true });

    try {
      let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>用户信息导出</title>
<style>
body { font-family: "Microsoft YaHei", Arial, sans-serif; font-size: 12pt; }
h2 { text-align: center; margin: 12px 0 20px; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #666; padding: 6px 8px; text-align: center; }
th { background: #f2f2f2; font-weight: 600; }
td.left { text-align: left; }
</style>
</head>
<body>
<h2>秤心如意 · 用户信息汇总表</h2>
<table>
<thead>
<tr>
<th>序号</th>
<th>账号</th>
<th>姓名</th>
<th>学校</th>
<th>专业</th>
<th>性别</th>
<th>身高(cm)</th>
<th>目标体重(kg)</th>
<th>手机号</th>
<th>体重记录(次)</th>
<th>运动记录(次)</th>
<th>注册时间</th>
</tr>
</thead>
<tbody>
`;

      list.forEach((u, idx) => {
        html += `
<tr>
<td>${idx + 1}</td>
<td>${u.account || ''}</td>
<td class="left">${u.name || ''}</td>
<td class="left">${u.school || ''}</td>
<td class="left">${u.major || ''}</td>
<td>${u.gender || ''}</td>
<td>${u.height || ''}</td>
<td>${u.targetWeight || ''}</td>
<td>${u.phone || ''}</td>
<td>${u.weightCount || 0}</td>
<td>${u.runCount || 0}</td>
<td>${u.createdAtStr || ''}</td>
</tr>`;
      });

      html += `
</tbody>
</table>
</body>
</html>`;

      const fs = wx.getFileSystemManager();
      const filePath = `${wx.env.USER_DATA_PATH}/用户信息导出_${Date.now()}.doc`;

      fs.writeFile({
        filePath,
        data: html,
        encoding: 'utf8',
        success: () => {
          wx.hideLoading();
          this.setData({ exportLoading: false });

          wx.showModal({
            title: '导出成功',
            content: '已生成 Word 文档，点击“确定”即可预览。',
            confirmText: '打开预览',
            success: res => {
              if (res.confirm) {
                wx.openDocument({
                  filePath,
                  fileType: 'doc',
                  showMenu: true,
                  fail: err => {
                    console.error('打开文档失败', err);
                    wx.showToast({ title: '预览失败', icon: 'none' });
                  }
                });
              }
            }
          });
        },
        fail: err => {
          console.error('写入导出文件失败', err);
          wx.hideLoading();
          this.setData({ exportLoading: false });
          wx.showToast({ title: '导出失败', icon: 'none' });
        }
      });
    } catch (e) {
      console.error('导出异常', e);
      wx.hideLoading();
      this.setData({ exportLoading: false });
      wx.showToast({ title: '导出失败', icon: 'none' });
    }
  },

  /* =============== 七、返回按钮 =============== */
  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  noop() {}
});