
// pages/workout/workout.js
const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    /** 跑步统计部分 **/
    totalDays: 0,
    totalDistance: 0,
    totalMinutes: 0,
    runDistance: "",
    runMinutes: "",
    weekPlan: [
      { day: "周一", desc: "轻松慢跑 20 分钟 + 拉伸", done: false },
      { day: "周三", desc: "快走或慢跑 30 分钟", done: false },
      { day: "周五", desc: "跑步 20 分钟 + 核心训练", done: false },
      { day: "周日", desc: "散步放松，舒缓身心", done: false }
    ],

    /** 视频库部分 **/
    categories: [],            // 所有分类文档
    currentCategoryId: "",     // 当前分类 _id
    currentCategoryName: "",   // 当前分类名
    videoList: [],             // 当前分类下所有视频
    filteredVideoList: [],     // 搜索过滤后的列表
    searchKeyword: "",         // 搜索关键词
    maxCategories: 20,         // 限制分类数量
    uploading: false,          // 上传中 loading
    previewUrl: "",            // 预览播放用
    previewVisible: false
  },

  onShow() {
    this.loadRunStats();
    this.loadCategories();
  },

  /*****************  跑步统计：保留原逻辑  *****************/
  loadRunStats() {
    try {
      const logs = wx.getStorageSync("runLogs") || [];
      let days = logs.length;
      let distance = 0;
      let minutes = 0;
      logs.forEach(l => {
        distance += Number(l.distance || 0);
        minutes += Number(l.minutes || 0);
      });

      this.setData({
        totalDays: days,
        totalDistance: distance.toFixed(2),
        totalMinutes: minutes
      });
    } catch (e) {
      console.error("加载跑步统计失败", e);
    }
  },

  onRunDistanceInput(e) {
    this.setData({ runDistance: e.detail.value });
  },
  onRunMinutesInput(e) {
    this.setData({ runMinutes: e.detail.value });
  },

  saveManualRun() {
    const { runDistance, runMinutes } = this.data;
    if (!runDistance || !runMinutes) {
      wx.showToast({ title: "请填写距离和用时", icon: "none" });
      return;
    }

    const logs = wx.getStorageSync("runLogs") || [];
    logs.push({
      date: new Date().toISOString(),
      distance: Number(runDistance),
      minutes: Number(runMinutes)
    });
    wx.setStorageSync("runLogs", logs);

    wx.showToast({ title: "已保存", icon: "success" });
    this.setData({ runDistance: "", runMinutes: "" });
    this.loadRunStats();
  },

  goRun() {
    wx.navigateTo({ url: "/pages/run/run" });
  },

  goSportTrend() {
    wx.navigateTo({ url: "/pages/sportTrend/sportTrend" });
  },

  /*****************  视频库：分类 & 加载  *****************/
  async loadCategories() {
    const openid = app.globalData.openid;
    if (!openid) {
      console.warn("未获取到 openid，先登录再使用视频库");
    }

    try {
      const res = await db.collection("video_categories")
        .where({ _openid: openid })
        .orderBy("createdAt", "asc")
        .get();

      const categories = res.data || [];
      let { currentCategoryId, currentCategoryName } = this.data;

      if (!currentCategoryId && categories.length > 0) {
        currentCategoryId = categories[0]._id;
        currentCategoryName = categories[0].category;
      }

      this.setData({ categories, currentCategoryId, currentCategoryName });
      if (currentCategoryId) {
        this.refreshVideoList(currentCategoryId);
      } else {
        this.setData({
          videoList: [],
          filteredVideoList: []
        });
      }
    } catch (e) {
      console.error("加载分类失败", e);
    }
  }

  ,
  goBack() {
    wx.navigateBack({ delta: 1 });
  }
,  
  refreshVideoList(catId) {
    const { categories, searchKeyword } = this.data;
    const cat = categories.find(c => c._id === catId);
    const list = (cat && cat.videos) ? cat.videos : [];
    this.setData({ videoList: list });
    this.applySearch(searchKeyword, list);
  },

  onSelectCategory(e) {
    const { id, name } = e.currentTarget.dataset;
    this.setData({
      currentCategoryId: id,
      currentCategoryName: name
    });
    this.refreshVideoList(id);
  },

  /*****************  分类管理：新增 / 删除 / 重命名  *****************/
  addCategory() {
    const { categories, maxCategories } = this.data;
    if (categories.length >= maxCategories) {
      wx.showToast({ title: `最多创建 ${maxCategories} 个分类`, icon: "none" });
      return;
    }

    wx.showModal({
      title: "新建分类",
      editable: true,
      placeholderText: "输入分类名称，例如：瑜伽 / 热身 / 力量训练",
      success: async (res) => {
        if (!res.confirm) return;
        const name = (res.content || "").trim();
        if (!name) return;

        try {
          await db.collection("video_categories").add({
            data: {
              category: name,
              createdAt: new Date(),
              videos: []
            }
          });
          wx.showToast({ title: "分类已创建", icon: "success" });
          this.loadCategories();
        } catch (e) {
          console.error("创建分类失败", e);
          wx.showToast({ title: "创建失败", icon: "none" });
        }
      }
    });
  },

  deleteCategory(e) {
    const id = e.currentTarget.dataset.id;

    wx.showModal({
      title: "删除分类",
      content: "删除后该分类内所有视频也会被删除，确定继续？",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await db.collection("video_categories").doc(id).remove();
          wx.showToast({ title: "已删除", icon: "success" });
          this.setData({ currentCategoryId: "", currentCategoryName: "" });
          this.loadCategories();
        } catch (e) {
          console.error("删除分类失败", e);
          wx.showToast({ title: "删除失败", icon: "none" });
        }
      }
    });
  },

  renameCategory(e) {
    const id = e.currentTarget.dataset.id;
    const oldName = e.currentTarget.dataset.name;

    wx.showModal({
      title: "修改分类名称",
      editable: true,
      content: oldName,
      placeholderText: "输入新的分类名称",
      success: async (res) => {
        if (!res.confirm) return;
        const name = (res.content || "").trim();
        if (!name) return;

        try {
          await db.collection("video_categories").doc(id).update({
            data: { category: name }
          });
          wx.showToast({ title: "已修改", icon: "success" });
          // 如果正在查看这个分类，也更新当前名称
          let { currentCategoryId } = this.data;
          if (currentCategoryId === id) {
            this.setData({ currentCategoryName: name });
          }
          this.loadCategories();
        } catch (e) {
          console.error("修改分类失败", e);
          wx.showToast({ title: "修改失败", icon: "none" });
        }
      }
    });
  },

  /*****************  搜索  *****************/
  onSearchInput(e) {
    const keyword = e.detail.value.trim();
    this.setData({ searchKeyword: keyword });
    this.applySearch(keyword, this.data.videoList);
  },

  applySearch(keyword, list) {
    if (!keyword) {
      this.setData({ filteredVideoList: list });
      return;
    }
    const lower = keyword.toLowerCase();
    const results = list.filter(v =>
      (v.name || "").toLowerCase().includes(lower)
    );
    this.setData({ filteredVideoList: results });
  },

  /*****************  上传视频  *****************/
  uploadVideo() {
    const { currentCategoryId, currentCategoryName, uploading } = this.data;
    if (!currentCategoryId) {
      wx.showToast({ title: "请先选择一个分类", icon: "none" });
      return;
    }
    if (uploading) return;

    wx.chooseMedia({
      count: 1,
      mediaType: ["video"],
      sourceType: ["album", "camera"],
      success: async (res) => {
        try {
          const file = res.tempFiles[0];
          if (!file) return;

          let { tempFilePath, size, duration } = file;
          const sizeMB = size / 1024 / 1024;

          // 先判断是否超过最大限制
          if (sizeMB > 50) {
            wx.showToast({ title: "单个视频不能超过 50MB", icon: "none" });
            return;
          }

          wx.showLoading({ title: "上传中…" });
          this.setData({ uploading: true });

          // 大于 20MB 的先压缩（降清晰度）
          if (sizeMB > 20) {
            try {
              const comp = await wx.compressVideo({
                src: tempFilePath,
                quality: "low"
              });
              tempFilePath = comp.tempFilePath;
              // 压缩后的大小无法直接获得，这里保留原 sizeMB 作为参考
            } catch (err) {
              console.warn("压缩失败，使用原视频继续上传", err);
            }
          }

          // 上传到云存储
          const cloudPath = `videos/${Date.now()}_${Math.floor(Math.random() * 100000)}.mp4`;
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: tempFilePath
          });

          const fileID = uploadRes.fileID;
          const uploadTime = this.formatTime(new Date());
          const videoName = `${currentCategoryName}_${uploadTime}`;

          const newVideo = {
            fileID,
            name: videoName,
            duration: Math.round(duration || 0),
            sizeMB: Number(sizeMB.toFixed(1)),
            cover: "",          // 目前不截帧，后续可扩展
            uploadTime,
            categoryName: currentCategoryName
          };

          // 写入对应分类文档
          await db.collection("video_categories").doc(currentCategoryId).update({
            data: {
              videos: _.push([newVideo])
            }
          });

          wx.hideLoading();
          wx.showToast({ title: "上传成功", icon: "success" });
          this.setData({ uploading: false });

          // 重新加载分类 & 当前视频列表
          this.loadCategories();
        } catch (err) {
          console.error("上传视频失败", err);
          wx.hideLoading();
          this.setData({ uploading: false });
          wx.showToast({ title: "上传失败", icon: "none" });
        }
      },
      fail: () => {
        // 用户取消就什么也不做
      }
    });
  },

  /*****************  视频操作：播放 / 重命名 / 删除 / 排序 / 收藏  *****************/
  // 播放（在本页弹出一个预览层）
  playVideo(e) {
    const fileid = e.currentTarget.dataset.fileid;
    if (!fileid) return;

    wx.cloud.getTempFileURL({
      fileList: [fileid],
      success: (res) => {
        const file = res.fileList[0];
        if (file && !file.status) {
          this.setData({
            previewUrl: file.tempFileURL,
            previewVisible: true
          });
        } else {
          wx.showToast({ title: "获取播放地址失败", icon: "none" });
        }
      },
      fail: (err) => {
        console.error("获取临时视频地址失败", err);
        wx.showToast({ title: "播放失败", icon: "none" });
      }
    });
  },

  closePreview() {
    this.setData({
      previewVisible: false,
      previewUrl: ""
    });
  },

  async deleteVideo(e) {
    const { index } = e.currentTarget.dataset;
    const { currentCategoryId, categories } = this.data;

    const cat = categories.find(c => c._id === currentCategoryId);
    if (!cat) return;

    wx.showModal({
      title: "删除视频",
      content: "确定删除该视频？",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const list = cat.videos || [];
          list.splice(index, 1);

          await db.collection("video_categories").doc(currentCategoryId).update({
            data: { videos: list }
          });

          wx.showToast({ title: "已删除", icon: "success" });
          this.loadCategories();
        } catch (err) {
          console.error("删除视频失败", err);
          wx.showToast({ title: "删除失败", icon: "none" });
        }
      }
    });
  },

  async renameVideo(e) {
    const { index } = e.currentTarget.dataset;
    const { currentCategoryId, categories } = this.data;
    const cat = categories.find(c => c._id === currentCategoryId);
    if (!cat) return;

    const list = cat.videos || [];
    const oldName = list[index].name || "";

    wx.showModal({
      title: "修改视频名称",
      editable: true,
      content: oldName,
      success: async (res) => {
        if (!res.confirm) return;
        const name = (res.content || "").trim();
        if (!name) return;

        try {
          list[index].name = name;
          await db.collection("video_categories").doc(currentCategoryId).update({
            data: { videos: list }
          });

          wx.showToast({ title: "已修改", icon: "success" });
          this.loadCategories();
        } catch (err) {
          console.error("修改视频名称失败", err);
          wx.showToast({ title: "修改失败", icon: "none" });
        }
      }
    });
  },

  async moveVideoUp(e) {
    const { index } = e.currentTarget.dataset;
    const { currentCategoryId, categories } = this.data;
    if (index <= 0) return;

    const cat = categories.find(c => c._id === currentCategoryId);
    if (!cat) return;

    const arr = cat.videos || [];
    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];

    try {
      await db.collection("video_categories").doc(currentCategoryId).update({
        data: { videos: arr }
      });
      this.loadCategories();
    } catch (err) {
      console.error("上移失败", err);
    }
  },

  async moveVideoDown(e) {
    const { index } = e.currentTarget.dataset;
    const { currentCategoryId, categories } = this.data;

    const cat = categories.find(c => c._id === currentCategoryId);
    if (!cat) return;

    const arr = cat.videos || [];
    if (index >= arr.length - 1) return;

    [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];

    try {
      await db.collection("video_categories").doc(currentCategoryId).update({
        data: { videos: arr }
      });
      this.loadCategories();
    } catch (err) {
      console.error("下移失败", err);
    }
  },

  async favoriteVideo(e) {
    const item = e.currentTarget.dataset.item;
    const openid = app.globalData.openid;
    if (!openid) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }

    try {
      await db.collection("user_favorites").add({
        data: {
          _openid: openid,
          ...item,
          favoritedAt: new Date()
        }
      });
      wx.showToast({ title: "已收藏", icon: "success" });
    } catch (err) {
      console.error("收藏失败", err);
      wx.showToast({ title: "收藏失败", icon: "none" });
    }
  },

  /*****************  工具函数  *****************/
  formatTime(date) {
    const pad = n => (n < 10 ? "0" + n : n);
    const Y = date.getFullYear();
    const M = pad(date.getMonth() + 1);
    const D = pad(date.getDate());
    const h = pad(date.getHours());
    const m = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
  }
});
