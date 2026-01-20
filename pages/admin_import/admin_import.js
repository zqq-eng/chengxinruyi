Page({
  data: {
    fileID: "",
    fileName: "",
    loading: false
  },

  async chooseFile() {
    const res = await wx.chooseMessageFile({
      count: 1,
      type: "file"
    });

    const file = res.tempFiles[0];
    const cloudRes = await wx.cloud.uploadFile({
      cloudPath: "uploads/" + file.name,
      filePath: file.path
    });

    this.setData({
      fileID: cloudRes.fileID,
      fileName: file.name
    });
  },

  async startImport() {
    if (!this.data.fileID) {
      wx.showToast({ title: "请先上传文件", icon: "none" });
      return;
    }

    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: "batch_import",
        data: { fileID: this.data.fileID }
      });

      this.setData({ loading: false });
      wx.showToast({ title: "导入成功", icon: "success" });
    } catch (e) {
      console.error(e);
      this.setData({ loading: false });
      wx.showToast({ title: "导入失败", icon: "none" });
    }
  }
});
