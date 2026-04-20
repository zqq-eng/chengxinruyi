Page({
  data: {
    item: {
      title: "",
      source: "",
      date: "",
      summary: "",
      url: ""
    }
  },

  onLoad() {
    const item = wx.getStorageSync("knowledge_detail_item") || {};
    this.setData({ item });
  },

  copyLink() {
    const url = (this.data.item && this.data.item.url) ? this.data.item.url : "";
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: "链接已复制", icon: "success" })
    });
  }
});
