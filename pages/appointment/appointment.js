// pages/appointment/appointment.js
const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    // 咨询类型
    typeOptions: ["心理咨询", "体重管理咨询"],
    typeIndex: 0,

    // 校区 / 地点
    placeOptions: ["心理咨询室", "体重管理工作坊", "线上视频咨询"],
    placeIndex: 0,
    onBack() {
      wx.navigateBack({
        delta: 1
      });
    },
    
    // 日期与时间
    date: "",
    time: "",
    dateMin: "",
    dateMax: "",

    // 备注
    remark: "",

    // 我的预约记录
    myAppointments: [],
    statusTextMap: {
      pending: "待审核",
      accepted: "已通过",
      rejected: "已拒绝",
      finished: "已完成"
    }
  },

  onLoad() {
    // 计算日期选择范围：今天 ～ 14 天后
    const today = new Date();
    const min = this.formatDate(today);
    const maxDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    const max = this.formatDate(maxDate);

    this.setData({
      dateMin: min,
      dateMax: max,
      date: min // 默认选中今天
    });
  },

  onShow() {
    this.loadMyAppointments();
  },

  // 工具：格式化日期 yyyy-MM-dd
  formatDate(d) {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    return `${y}-${m}-${day}`;
  },

  // 选择咨询类型
  onTypeChange(e) {
    this.setData({ typeIndex: Number(e.detail.value) });
  },

  // 选择地点
  onPlaceChange(e) {
    this.setData({ placeIndex: Number(e.detail.value) });
  },

  // 选择日期
  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },

  // 选择时间
  onTimeChange(e) {
    this.setData({ time: e.detail.value });
  },

  // 备注输入
  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  // 提交预约
  async onSubmit() {
    const openid = app.globalData.openid;
    if (!openid) {
      wx.showToast({ title: "请先登录后再预约", icon: "none" });
      return;
    }

    const {
      typeOptions,
      typeIndex,
      placeOptions,
      placeIndex,
      date,
      time,
      remark
    } = this.data;

    const type = typeOptions[typeIndex];
    const place = placeOptions[placeIndex];

    if (!date || !time) {
      wx.showToast({ title: "请先选择日期和时间", icon: "none" });
      return;
    }

    try {
      await db.collection("appointments").add({
        data: {
          openid,
          type,
          place,
          date,
          time,
          remark,
          status: "pending",          // 初始状态：待审核
          createTime: db.serverDate() // 便于排序
        }
      });

      wx.showToast({ title: "预约成功", icon: "success" });

      // 清空备注，重新加载列表
      this.setData({ remark: "" });
      this.loadMyAppointments();
    } catch (e) {
      console.error("预约提交失败", e);
      wx.showToast({ title: "提交失败，请稍后重试", icon: "none" });
    }
  },

  // 加载“我的预约记录”
  async loadMyAppointments() {
    const openid = app.globalData.openid;
    if (!openid) {
      this.setData({ myAppointments: [] });
      return;
    }

    try {
      const res = await db.collection("appointments")
        .where({ openid })
        .orderBy("createTime", "desc")
        .get();

      this.setData({
        myAppointments: res.data || []
      });
    } catch (e) {
      console.error("加载预约记录失败", e);
    }
  }
});
