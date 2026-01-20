const db = wx.cloud.database();

Page({
  data: {
    list: []
  },

  onShow() {
    this.loadList();
  },

  async loadList() {
    const res = await db.collection("redeemRequests")
      .orderBy("createdAt", "desc")
      .get();
    this.setData({ list: res.data });
  },

  async updateStatus(e) {
    const id = e.currentTarget.dataset.id;
    const status = e.currentTarget.dataset.status;

    await db.collection("redeemRequests").doc(id).update({
      data: { status }
    });

    wx.showToast({ title: "已更新", icon: "success" });
    this.loadList();
  }
});
