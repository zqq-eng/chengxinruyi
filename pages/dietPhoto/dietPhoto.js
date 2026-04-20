const app = getApp();
const db = wx.cloud.database();

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

Page({
  data: {
    todayStr: "",
    todayImages: [],
    history: []
  },

  onShow() {
    const todayStr = formatDate(new Date());
    this.setData({ todayStr });
    this.loadToday();
    this.loadHistory();
  },

  async loadToday() {
    if (!app.globalData.openid) return;
    const todayStr = this.data.todayStr;

    const res = await db.collection("diet_photos")
      .where({ openid: app.globalData.openid, dateStr: todayStr })
      .limit(1)
      .get();

    if (res.data.length) {
      this.setData({ todayImages: res.data[0].images || [] });
    } else {
      this.setData({ todayImages: [] });
    }
  },

  async loadHistory() {
    if (!app.globalData.openid) return;

    const res = await db.collection("diet_photos")
      .where({ openid: app.globalData.openid })
      .orderBy("dateStr", "desc")
      .limit(30)
      .get();

    this.setData({ history: res.data.map(x => ({ dateStr: x.dateStr, images: x.images || [] })) });
  },

  chooseFromCamera() {
    this.chooseAndUpload(["camera"]);
  },

  chooseFromAlbum() {
    this.chooseAndUpload(["album"]);
  },

  chooseAndUpload(sourceType) {
    if (!app.globalData.openid) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }

    wx.chooseImage({
      count: 9,
      sizeType: ["compressed"],
      sourceType,
      success: async (res) => {
        const paths = res.tempFilePaths || [];
        if (!paths.length) return;

        wx.showLoading({ title: "上传中...", mask: true });

        try {
          const fileIDs = [];
          for (const p of paths) {
            const cloudPath = `diet/${app.globalData.openid}/${Date.now()}_${Math.floor(Math.random() * 10000)}.jpg`;
            const up = await wx.cloud.uploadFile({ cloudPath, filePath: p });
            fileIDs.push(up.fileID);
          }

          await this.upsertToday(fileIDs);
          wx.hideLoading();
          wx.showToast({ title: "已保存", icon: "success" });

          this.loadToday();
          this.loadHistory();
        } catch (e) {
          console.error(e);
          wx.hideLoading();
          wx.showToast({ title: "上传失败", icon: "none" });
        }
      }
    });
  },

  async upsertToday(newFileIDs) {
    const todayStr = this.data.todayStr;

    const res = await db.collection("diet_photos")
      .where({ openid: app.globalData.openid, dateStr: todayStr })
      .limit(1)
      .get();

    if (res.data.length) {
      const docId = res.data[0]._id;
      const old = res.data[0].images || [];
      await db.collection("diet_photos").doc(docId).update({
        data: {
          images: old.concat(newFileIDs),
          updatedAt: db.serverDate()
        }
      });
    } else {
      await db.collection("diet_photos").add({
        data: {
          openid: app.globalData.openid,
          dateStr: todayStr,
          images: newFileIDs,
          createdAt: db.serverDate()
        }
      });
    }
  },

  /* ========= ✅ 新增：删除（长按图片） ========= */

  async deleteTodayImage(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const fileID = e.currentTarget.dataset.fileid;
    const dateStr = this.data.todayStr;
    this.deleteImageByDateAndIndex(dateStr, idx, fileID);
  },

  async deleteHistoryImage(e) {
    const dateStr = e.currentTarget.dataset.date;
    const idx = Number(e.currentTarget.dataset.idx);
    const fileID = e.currentTarget.dataset.fileid;
    this.deleteImageByDateAndIndex(dateStr, idx, fileID);
  },

  async deleteImageByDateAndIndex(dateStr, idx, fileID) {
    if (!app.globalData.openid) return;

    wx.showModal({
      title: "确认删除？",
      content: "长按删除：删除后不可恢复",
      success: async (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: "删除中...", mask: true });

        try {
          // 找到当天记录
          const q = await db.collection("diet_photos")
            .where({ openid: app.globalData.openid, dateStr })
            .limit(1)
            .get();

          if (!q.data.length) {
            wx.hideLoading();
            wx.showToast({ title: "记录不存在", icon: "none" });
            return;
          }

          const doc = q.data[0];
          const docId = doc._id;
          const images = doc.images || [];

          if (idx < 0 || idx >= images.length) {
            wx.hideLoading();
            wx.showToast({ title: "图片索引错误", icon: "none" });
            return;
          }

          const targetFileID = fileID || images[idx];

          // 1) 删除云存储文件
          if (targetFileID) {
            await wx.cloud.deleteFile({ fileList: [targetFileID] });
          }

          // 2) 更新数据库：从 images 中移除该项；如果删完了就删整条记录
          const nextImages = images.filter((_, i) => i !== idx);

          if (nextImages.length === 0) {
            await db.collection("diet_photos").doc(docId).remove();
          } else {
            await db.collection("diet_photos").doc(docId).update({
              data: {
                images: nextImages,
                updatedAt: db.serverDate()
              }
            });
          }

          wx.hideLoading();
          wx.showToast({ title: "已删除", icon: "success" });
          this.loadToday();
          this.loadHistory();
        } catch (err) {
          console.error(err);
          wx.hideLoading();
          wx.showToast({ title: "删除失败", icon: "none" });
        }
      }
    });
  }
});
