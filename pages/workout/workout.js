// pages/workout/workout.js
const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function secToMin(sec) {
  sec = safeNum(sec);
  return Math.round(sec / 60);
}

function buildSnapshotUrl(tempVideoUrl, timeSec = 1) {
  if (!tempVideoUrl) return "";
  const joiner = tempVideoUrl.includes("?") ? "&" : "?";
  return `${tempVideoUrl}${joiner}ci-process=snapshot&time=${timeSec}&format=jpg`;
}

function normalizeCloudId(fid) {
  if (!fid) return "";
  let s = String(fid).trim();
  s = s.replace(/^cloud:\\/i, "cloud://");
  s = s.replace(/cloud:\\/gi, "cloud://");
  return s;
}

Page({
  data: {
    totalDays: 0,
    totalDistance: 0,
    totalMinutes: 0,

    lastRunDate: "",
    lastRunDistanceKm: "",
    lastRunDurationStr: "",
    lastRunPaceStr: "",
    lastRunSpeed: "",

    runDistance: "",
    runMinutes: "",

    weekPlan: [
      { day: "周一", desc: "轻松慢跑 20 分钟 + 拉伸", done: false },
      { day: "周三", desc: "快走或慢跑 30 分钟", done: false },
      { day: "周五", desc: "跑步 20 分钟 + 核心训练", done: false },
      { day: "周日", desc: "散步放松，舒缓身心", done: false }
    ],

    categories: [],
    currentCategoryId: "",
    currentCategoryName: "",
    videoList: [],
    filteredVideoList: [],
    searchKeyword: "",
    maxCategories: 20,
    uploading: false,

    previewUrl: "",
    previewVisible: false,

    statsLoading: false,

    recommendCollapsed: true,
    recommendList: []
  },

  onShow() {
    this.loadRunStats();
    this.loadCategories();
    this.loadRecommendedVideos();
  },

  async loadRunStats() {
    this.setData({ statsLoading: true });

    let localCount = 0;
    let localDistance = 0;
    let localMinutes = 0;

    try {
      const logs = wx.getStorageSync("runLogs") || [];
      localCount = logs.length;
      logs.forEach(l => {
        localDistance += safeNum(l.distance || 0);
        localMinutes += safeNum(l.minutes || 0);
      });
    } catch (e) {
      console.error("加载本地跑步统计失败", e);
    }

    let cloudCount = 0;
    let cloudDistance = 0;
    let cloudMinutes = 0;
    let lastRun = null;

    try {
      const openid = app.globalData.openid;
      if (openid) {
        const res = await db.collection("workout_checkins")
          .where({ openid, type: "run" })
          .orderBy("createTime", "desc")
          .limit(100)
          .get();

        const list = res.data || [];
        cloudCount = list.length;

        list.forEach(r => {
          cloudDistance += safeNum(r.distanceKm || (safeNum(r.distance) / 1000));
          cloudMinutes += secToMin(r.duration);
        });

        if (list.length) lastRun = list[0];
      }
    } catch (e) {
      console.warn("加载云 workout_checkins 失败（可忽略）", e);
    }

    const totalCount = localCount + cloudCount;
    const totalDistance = localDistance + cloudDistance;
    const totalMinutes = localMinutes + cloudMinutes;

    let lastRunDate = "";
    let lastRunDistanceKm = "";
    let lastRunDurationStr = "";
    let lastRunPaceStr = "";
    let lastRunSpeed = "";

    if (lastRun) {
      const distKm = safeNum(lastRun.distanceKm || (safeNum(lastRun.distance) / 1000));
      const durSec = safeNum(lastRun.duration);
      const durStr = lastRun.durationStr || `${pad2(Math.floor(durSec / 60))}:${pad2(durSec % 60)}`;
      const paceStr = lastRun.paceStr || "--'--\"";
      const speed = durSec > 0 ? (distKm / (durSec / 3600)) : 0;

      lastRunDate = lastRun.dateStr || "";
      lastRunDistanceKm = distKm ? distKm.toFixed(2) : "0.00";
      lastRunDurationStr = durStr;
      lastRunPaceStr = paceStr;
      lastRunSpeed = speed ? speed.toFixed(1) : "0.0";
    }

    this.setData({
      totalDays: totalCount,
      totalDistance: totalDistance.toFixed(2),
      totalMinutes,
      lastRunDate,
      lastRunDistanceKm,
      lastRunDurationStr,
      lastRunPaceStr,
      lastRunSpeed,
      statsLoading: false
    });
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

    const dist = safeNum(runDistance);
    const mins = safeNum(runMinutes);

    if (dist <= 0 || mins <= 0) {
      wx.showToast({ title: "请输入合理的距离和用时", icon: "none" });
      return;
    }

    const logs = wx.getStorageSync("runLogs") || [];
    logs.push({
      date: new Date().toISOString(),
      distance: dist,
      minutes: mins
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

  async loadCategories() {
    const openid = app.globalData.openid;
    if (!openid) {
      console.warn("未获取到 openid，先登录再使用视频库");
      this.setData({
        categories: [],
        currentCategoryId: "",
        currentCategoryName: "",
        videoList: [],
        filteredVideoList: []
      });
      return;
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
        this.setData({ videoList: [], filteredVideoList: [] });
      }
    } catch (e) {
      console.error("加载分类失败", e);
      this.setData({ videoList: [], filteredVideoList: [] });
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  refreshVideoList(catId) {
    const { categories, searchKeyword } = this.data;
    const cat = categories.find(c => c._id === catId);
    const list = (cat && cat.videos) ? cat.videos : [];
    this.setData({ videoList: list });
    this.applySearch(searchKeyword, list);
  },

  onSelectCategory(e) {
    const { id, name } = e.currentTarget.dataset;
    this.setData({ currentCategoryId: id, currentCategoryName: name });
    this.refreshVideoList(id);
  },

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
      success: async (res) => {
        if (!res.confirm) return;
        const name = (res.content || "").trim();
        if (!name) return;

        try {
          await db.collection("video_categories").doc(id).update({
            data: { category: name }
          });
          wx.showToast({ title: "已修改", icon: "success" });

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
    const results = list.filter(v => (v.name || "").toLowerCase().includes(lower));
    this.setData({ filteredVideoList: results });
  },

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

          if (sizeMB > 50) {
            wx.showToast({ title: "单个视频不能超过 50MB", icon: "none" });
            return;
          }

          wx.showLoading({ title: "上传中…" });
          this.setData({ uploading: true });

          if (sizeMB > 20) {
            try {
              const comp = await wx.compressVideo({
                src: tempFilePath,
                quality: "low"
              });
              tempFilePath = comp.tempFilePath;
            } catch (err) {
              console.warn("压缩失败，使用原视频继续上传", err);
            }
          }

          const cloudPath = `videos/${Date.now()}_${Math.floor(Math.random() * 100000)}.mp4`;
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: tempFilePath
          });

          const fileID = uploadRes.fileID;
          const uploadTime = this.formatTime(new Date());
          const videoName = `${currentCategoryName}_${uploadTime}`;

          let cover = "";
          try {
            const tmpRes = await wx.cloud.callFunction({
              name: "get_temp_urls",
              data: { fileIDs: [fileID] }
            });
            const tempMap = (tmpRes.result && tmpRes.result.map) ? tmpRes.result.map : {};
            const tempVideoUrl = tempMap[fileID] || "";
            cover = buildSnapshotUrl(tempVideoUrl, 1);
          } catch (e) {
            console.warn("生成封面失败（可忽略）", e);
          }

          const newVideo = {
            fileID,
            name: videoName,
            duration: Math.round(duration || 0),
            sizeMB: Number(sizeMB.toFixed(1)),
            cover: cover || "",
            uploadTime,
            categoryName: currentCategoryName
          };

          await db.collection("video_categories").doc(currentCategoryId).update({
            data: { videos: _.push([newVideo]) }
          });

          wx.hideLoading();
          wx.showToast({ title: "上传成功", icon: "success" });
          this.setData({ uploading: false });
          this.loadCategories();
        } catch (err) {
          console.error("上传视频失败", err);
          wx.hideLoading();
          this.setData({ uploading: false });
          wx.showToast({ title: "上传失败", icon: "none" });
        }
      }
    });
  },

  async getTempUrlMap(fileIDs = []) {
    const ids = Array.from(
      new Set(
        (fileIDs || [])
          .map(normalizeCloudId)
          .filter(Boolean)
      )
    );

    if (!ids.length) return {};

    try {
      const res = await wx.cloud.callFunction({
        name: "get_temp_urls",
        data: { fileIDs: ids }
      });

      return (res.result && res.result.map) ? res.result.map : {};
    } catch (e) {
      console.error("通过云函数获取临时地址失败", e);
      return {};
    }
  },

  playRecommend(e) {
    const playUrl = e.currentTarget.dataset.playurl;
    const fileid = e.currentTarget.dataset.fileid;

    if (playUrl) {
      this.setData({ previewUrl: playUrl, previewVisible: true });
      return;
    }

    if (fileid) {
      this.playVideo({ currentTarget: { dataset: { fileid } } });
      return;
    }

    wx.showToast({ title: "播放地址为空", icon: "none" });
  },

  async playVideo(e) {
    const fileid = normalizeCloudId(e.currentTarget.dataset.fileid);
    if (!fileid) {
      wx.showToast({ title: "fileID为空", icon: "none" });
      return;
    }

    console.log("准备播放:", fileid);

    const tempMap = await this.getTempUrlMap([fileid]);
    const playUrl = tempMap[fileid] || "";

    if (playUrl) {
      this.setData({
        previewUrl: playUrl,
        previewVisible: true
      });
    } else {
      wx.showToast({ title: "获取播放地址失败", icon: "none" });
    }
  },

  closePreview() {
    this.setData({ previewVisible: false, previewUrl: "" });
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
        data: { _openid: openid, ...item, favoritedAt: new Date() }
      });
      wx.showToast({ title: "已收藏", icon: "success" });
    } catch (err) {
      console.error("收藏失败", err);
      wx.showToast({ title: "收藏失败", icon: "none" });
    }
  },

  toggleRecommend() {
    this.setData({ recommendCollapsed: !this.data.recommendCollapsed });
  },

  async loadRecommendedVideos() {
    try {
      const res = await db.collection("recommended_videos")
        .where({ enabled: true })
        .orderBy("order", "asc")
        .limit(30)
        .get();

      const list = res.data || [];
      console.log("recommended_videos 原始数据：", list);

      const rawIds = [];
      list.forEach(v => {
        const cover = normalizeCloudId(v.cover);
        const fileID = normalizeCloudId(v.fileID);

        if (cover && cover.startsWith("cloud://")) rawIds.push(cover);
        if (fileID && fileID.startsWith("cloud://")) rawIds.push(fileID);
      });

      const fileIDs = Array.from(new Set(rawIds));
      console.log("需要转换临时地址的 fileIDs：", fileIDs);

      const idMap = await this.getTempUrlMap(fileIDs);
      console.log("最终 idMap：", idMap);

      const recommendList = list.map(v => {
        const cover = normalizeCloudId(v.cover || "");
        const fileID = normalizeCloudId(v.fileID || "");

        return {
          _id: v._id,
          title: v.title || "专业训练推荐",
          order: typeof v.order === "number" ? v.order : 999,
          fileID,
          cover,
          coverUrl: cover.startsWith("http")
            ? cover
            : (cover ? (idMap[cover] || "") : ""),
          playUrl: fileID.startsWith("http")
            ? fileID
            : (fileID ? (idMap[fileID] || "") : ""),
          duration: safeNum(v.duration || 0),
          level: v.level || "",
          note: v.note || ""
        };
      });

      console.log("最终 recommendList：", recommendList);
      this.setData({ recommendList });
    } catch (e) {
      console.warn("加载推荐视频失败（可忽略）", e);
      this.setData({ recommendList: [] });
    }
  },

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