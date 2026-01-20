// pages/admin_appointment/admin_appointment.js
const db = wx.cloud.database();

Page({
  data: {
    list: [],
    statusText: {
      pending: "待审核",
      accepted: "已通过",
      rejected: "已驳回",
      finished: "已完成"
    }
  },

  onShow() {
    this.loadAppointments();
  },

  async loadAppointments() {
    try {
      const res = await db.collection("appointments")
        .orderBy("createdAt", "desc")
        .get();

      this.setData({ list: res.data || [] });
    } catch (e) {
      console.error("预约加载失败", e);
      wx.showToast({ title: "数据加载异常", icon: "none" });
    }
  },

  // 修改状态
  async changeStatus(e) {
    const { id, status } = e.currentTarget.dataset;
    try {
      await db.collection("appointments").doc(id).update({
        data: { status }
      });
      wx.showToast({ title: "已更新", icon: "success" });
      this.loadAppointments();
    } catch (err) {
      console.error("更新失败", err);
      wx.showToast({ title: "更新失败", icon: "none" });
    }
  },

  // 返回按钮
  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: "/pages/profile/profile" });
    }
  }
});
