// pages/adminUser/adminUser.js 
const db = wx.cloud.database();

Page({
  data: {
    loading: true,
    userList: [],          // 列表数据
    sortField: 'name',     // 当前排序字段
    sortOrder: 'asc',      // asc / desc

    // 详情弹层
    showDetail: false,
    detailUser: null,

    // 导出状态
    exportLoading: false
  },

  onShow() {
    this.loadUsers();
  },

  /* =============== 一、加载用户 + 统计信息 =============== */
  async loadUsers() {
    this.setData({ loading: true });

    try {
      // 1. 所有用户基础信息（注册信息都在 users 集合）
      const usersRes = await db.collection('users').get();
      const users = usersRes.data || [];

      // 2. 体重记录次数
      const weightMap = {};
      try {
        const w = await db.collection('weights').get();
        w.data.forEach(item => {
          weightMap[item.openid] = (weightMap[item.openid] || 0) + 1;
        });
      } catch (e) {
        console.warn('weights 集合不存在，略过体重统计');
      }

      // 3. 运动记录次数
      const runMap = {};
      try {
        const r = await db.collection('runs').get();
        r.data.forEach(item => {
          runMap[item.openid] = (runMap[item.openid] || 0) + 1;
        });
      } catch (e) {
        console.warn('runs 集合不存在，略过运动统计');
      }

      // 4. 组装数据：把注册信息 + 统计信息整合到一起
      const list = users.map(u => {
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

        // 格式化时间
        let createdAtStr = '';
        if (typeof createdAt === 'string') {
          createdAtStr = createdAt;
        } else if (createdAt && createdAt.toDate) {
          // 云开发 serverDate()
          const d = createdAt.toDate();
          createdAtStr = this.formatDateTime(d);
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
          raw: u
        };
      });

      this.sortAndSet(list);
    } catch (e) {
      console.error('用户信息加载失败', e);
      this.setData({ loading: false });
      wx.showToast({ title: '用户信息加载异常', icon: 'none' });
    }
  },

  formatDateTime(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  },

  /* =============== 二、排序逻辑 =============== */
  sortAndSet(list) {
    const { sortField, sortOrder } = this.data;
    const sorted = list.slice().sort((a, b) => {
      const va = a[sortField];
      const vb = b[sortField];

      // 数字优先
      const na = Number(va);
      const nb = Number(vb);
      if (!isNaN(na) && !isNaN(nb)) {
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

  // 点击表头：切换排序字段 / 方向
  onHeaderTap(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;

    let { sortField, sortOrder } = this.data;
    if (field === sortField) {
      // 同一字段二次点击 → 翻转升/降序
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortOrder = 'asc';
    }

    this.setData({ sortField, sortOrder });
    this.sortAndSet(this.data.userList);
  },

  /* =============== 三、详情弹层 =============== */
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

  /* =============== 四、导出为 Word 表格文档（.doc） =============== */
  onExportDoc() {
    const list = this.data.userList || [];
    if (!list.length) {
      wx.showToast({ title: '暂无数据可导出', icon: 'none' });
      return;
    }

    this.setData({ exportLoading: true });
    wx.showLoading({ title: '生成文档中...', mask: true });

    try {
      // 1. 组装 HTML 表格（Word 可以直接打开）
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

      // 2. 写入小程序本地 .doc 文件
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
                  success: () => {},
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

  /* =============== 五、返回按钮 =============== */
  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  /* =============== 六、空方法：给 catchtap 用 =============== */
  noop() {
    // 什么都不做，用来阻止冒泡：catchtap="noop"
  }
});
