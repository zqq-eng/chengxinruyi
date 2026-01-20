// pages/adminSport/adminSport.js
const db = wx.cloud.database();

Page({
  data: {
    loading: true,

    // 每个用户的运动统计
    userStats: [],
    totalUsers: 0,
    totalRuns: 0,
    totalDistance: 0,

    // 当前选中的用户详情
    showDetail: false,
    detailUser: null,
    detailRuns: [],   // 该用户全部跑步记录（最近在前）
    trendList: [],    // 最近 10 次简要趋势

    // 发送鼓励弹窗
    encourageModalVisible: false,
    encourageText: "",
    encourageTargetRun: null   // 被鼓励的那条跑步记录
  },

  onShow() {
    this.loadSportStats();
  },

  /* ================== 一、汇总统计 ================== */
  async loadSportStats() {
    this.setData({ loading: true });

    try {
      // 1. 读取全部用户
      const usersRes = await db.collection("users").limit(200).get();
      const users = usersRes.data || [];

      // 2. 读取所有跑步记录
      let runs = [];
      try {
        const runsRes = await db.collection("runs").limit(1000).get();
        runs = runsRes.data || [];
      } catch (err) {
        console.error("runs 读取失败，仅统计用户", err);
        runs = [];
      }

      // 3. 统计每个 openid 的次数和里程
      const map = {}; // openid -> {count, distance}
      let totalDistance = 0;

      runs.forEach(r => {
        const oid = r.openid || "";
        if (!oid) return;
        const d = Number(r.distanceKm || 0);
        if (!map[oid]) {
          map[oid] = { count: 0, distance: 0 };
        }
        map[oid].count += 1;
        map[oid].distance += d;
        totalDistance += d;
      });

      const userStats = users.map(u => {
        const o = map[u.openid] || { count: 0, distance: 0 };
        return {
          openid: u.openid,
          name: u.name || u.nickname || "未命名用户",
          school: u.school || "",
          height: u.height || "",
          runCount: o.count,
          totalDistance: o.distance.toFixed(2),
          avgDistance: o.count ? (o.distance / o.count).toFixed(2) : "0.00"
        };
      });

      this.setData({
        loading: false,
        userStats,
        totalUsers: users.length,
        totalRuns: runs.length,
        totalDistance: totalDistance.toFixed(2)
      });
    } catch (e) {
      console.error("加载运动统计失败", e);
      this.setData({ loading: false });
      wx.showToast({
        title: "运动统计加载失败",
        icon: "none"
      });
    }
  },

  /* ================== 二、查看某用户详情 ================== */
  async onRowTap(e) {
    // 🔥 这里通过 data-openid 拿到用户 openid（绑定在整行上）
    const { openid } = e.currentTarget.dataset;
    if (!openid) return;

    try {
      wx.showLoading({ title: "加载详情..." });

      const res = await db.collection("runs")
        .where({ openid })
        .orderBy("dateStr", "asc")
        .get();

      const list = res.data || [];

      // 最近 10 次（从旧到新，用于趋势）
      const last10 = list.slice(-10);
      const trendList = last10.map(r => ({
        dateStr: r.dateStr || (r.startTime && r.startTime.toISOString().slice(0, 10)) || "",
        distanceKm: r.distanceKm || "0.00",
        durationStr: r.durationStr || "",
        paceStr: r.paceStr || ""
      }));

      // 当前用户基础信息
      const u = this.data.userStats.find(x => x.openid === openid) || {};

      this.setData({
        showDetail: true,
        detailUser: u,
        // 详情列表：最近在前
        detailRuns: list.reverse(),
        trendList,
        encourageModalVisible: false,
        encourageText: "",
        encourageTargetRun: null
      });

      wx.hideLoading();
    } catch (err) {
      console.error("加载用户运动详情失败", err);
      wx.hideLoading();
      wx.showToast({
        title: "详情加载失败",
        icon: "none"
      });
    }
  },

  closeDetail() {
    this.setData({
      showDetail: false,
      detailUser: null,
      detailRuns: [],
      trendList: [],
      encourageModalVisible: false,
      encourageText: "",
      encourageTargetRun: null
    });
  },

  // 用于阻止弹层内部点击冒泡到蒙层（注意 wxml 里的 catchtap="stopTap"）
  stopTap() {},

  /* ================== 三、发送鼓励 ================== */
  // 点击某条记录右侧的「鼓励 TA」
  openEncourage(e) {
    const { runid } = e.currentTarget.dataset;
    const target = this.data.detailRuns.find(r => r._id === runid);
    if (!target) return;

    this.setData({
      encourageModalVisible: true,
      encourageText: "",
      encourageTargetRun: target
    });
  },

  // 文本输入
  onEncourageInput(e) {
    this.setData({ encourageText: e.detail.value });
  },

  // 取消发送
  cancelEncourage() {
    this.setData({
      encourageModalVisible: false,
      encourageText: "",
      encourageTargetRun: null
    });
  },

  // 确认发送鼓励
  async submitEncourage() {
    const text = (this.data.encourageText || "").trim();
    const run = this.data.encourageTargetRun;
    const detailUser = this.data.detailUser || {};

    if (!run) {
      wx.showToast({ title: "没有选中记录", icon: "none" });
      return;
    }
    if (!text) {
      wx.showToast({ title: "请先写几句鼓励的话~", icon: "none" });
      return;
    }

    const openid = detailUser.openid || run.openid;
    if (!openid) {
      wx.showToast({ title: "缺少用户标识", icon: "none" });
      return;
    }

    try {
      await db.collection("encourages").add({
        data: {
          openid,                     // 被鼓励的用户
          runId: run._id,             // 对应的跑步记录
          dateStr: run.dateStr || "",
          distanceKm: run.distanceKm || "",
          durationStr: run.durationStr || "",
          paceStr: run.paceStr || "",
          message: text,              // 鼓励内容
          createdAt: db.serverDate ? db.serverDate() : new Date(),
          read: false                 // 用户端可根据此字段做已读标记
        }
      });

      wx.showToast({
        title: "已发送鼓励",
        icon: "success"
      });

      this.setData({
        encourageModalVisible: false,
        encourageText: "",
        encourageTargetRun: null
      });
    } catch (err) {
      console.error("发送鼓励失败", err);
      wx.showToast({
        title: "发送失败，请稍后再试",
        icon: "none"
      });
    }
  },

  /* ================== 四、顶部返回 ================== */
  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});
