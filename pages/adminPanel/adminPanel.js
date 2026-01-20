// pages/adminPanel/adminPanel.js
const db = wx.cloud.database();

Page({
  data: {
    // 用户统计列表
    userList: []
  },

  onShow() {
    this.loadUsers();
  },

  /* =============== 一、用户统计 =============== */
  async loadUsers() {
    try {
      // 1. 先取用户基础信息
      const usersRes = await db.collection('users').get();

      // 2. 体重记录次数（可选，没有该集合时不报错）
      const weightMap = {};
      try {
        const w = await db.collection('weights').get();
        w.data.forEach(item => {
          weightMap[item.openid] = (weightMap[item.openid] || 0) + 1;
        });
      } catch (e) {
        console.warn('weights 集合不存在，略过统计');
      }

      // 3. 运动记录次数（可选，没有该集合时不报错）
      const runMap = {};
      try {
        const r = await db.collection('runs').get();
        r.data.forEach(item => {
          runMap[item.openid] = (runMap[item.openid] || 0) + 1;
        });
      } catch (e) {
        console.warn('runs 集合不存在，略过统计');
      }

      // 4. 组装到列表里
      const list = usersRes.data.map(u => ({
        ...u,
        weightCount: weightMap[u.openid] || 0,
        runCount: runMap[u.openid] || 0
      }));

      this.setData({ userList: list });
    } catch (e) {
      console.error('用户统计加载失败', e);
      wx.showToast({ title: '用户数据加载异常', icon: 'none' });
    }
  },

  /* =============== 二、其他页面入口 =============== */

  // 用户信息管理
  goUserManage() {
    wx.navigateTo({
      url: '/pages/adminUser/adminUser' // 如果你页面路径不一样，这里改成实际路径
    });
  },

  // 运动记录管理 / 运动分析
  goSportManage() {
    wx.navigateTo({
      url: '/pages/adminSport/adminSport'
    });
  },

  // 预约审核中心
  goAppointmentManage() {
    wx.navigateTo({
      url: '/pages/admin_appointment/admin_appointment'
    });
  },

  // 退出后台 -> 回到管理员登录界面
  exitAdmin() {
    wx.reLaunch({
      url: '/pages/login/login'  // 这里是你管理员登录页
    });
  }
});
