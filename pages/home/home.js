// pages/home/home.js
const app = getApp();

const CHECKIN_LIMIT_PER_DAY = 8; // ✅ 当日最多累加次数（你想改成 5/10 都行）

// ✅ 两次签到最小间隔：1小时
const MIN_CHECKIN_INTERVAL_MS = 60 * 60 * 1000;

// ✅ 积分本地存储 key（按 openid 隔离）
function pointsKey(openid) {
  return `user_points_v1_${openid || "local"}`;
}
function getPoints(openid) {
  const v = wx.getStorageSync(pointsKey(openid));
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}
function setPoints(openid, val) {
  const x = Math.max(0, Math.floor(Number(val) || 0));
  wx.setStorageSync(pointsKey(openid), x);
  return x;
}

Page({
  data: {
    userInfo: { name: "", height: "" },
    todayWeight: "",
    todayBMI: "",
    bmiPercent: 0,
    todayTip: "今天还没有记录体重呢，点击下面“记录体重”开始吧～",

    timePeriod: "早晨",
    currentCare: null,
    currentDiet: null,

    // ✅ 打卡（新增）
    checkinToday: 0,
    checkinTotal: 0,
    checkinLimit: CHECKIN_LIMIT_PER_DAY,

    careByTime: [
      { key: "morning", label: "早晨", items: ["起床先喝一杯温水，轻轻把身体叫醒。","做 3 分钟伸展或深呼吸，让脑袋慢慢清醒。","对镜子里的自己说一句“今天也要温柔对待自己”。"] },
      { key: "noon", label: "中午", items: ["午餐七分饱，留一点轻盈给下午的自己。","如果可以的话，午后闭目休息 10 分钟。","别忘了抬头看看窗外，让眼睛和大脑都换个场景。"] },
      { key: "afternoon", label: "下午", items: ["长时间用电脑时，每 45 分钟起身走一走。","感到烦躁时，先缓一缓，再决定要不要继续硬撑。","给自己一小块水果或坚果，而不是只靠含糖饮料。"] },
      { key: "night", label: "晚上", items: ["晚饭后可以试试轻量散步或拉伸，让身体慢慢放松。","睡前一小时减少刷手机，让大脑进入休息模式。","写一句“今天值得被记住的小事”，对今天说声辛苦啦。"] }
    ],

    dietByTime: [
      { key: "morning", label: "早晨 · 早餐推荐", items: ["燕麦片 + 鸡蛋 + 牛奶：优质蛋白 + 复合碳水，饱腹感更持久。","全麦吐司 + 酸奶 + 一个水果：简单好做，又兼顾纤维和钙。","如果赶时间：一杯无糖酸奶 + 一根香蕉，也比空腹好多啦。"] },
      { key: "noon", label: "中午 · 正餐推荐", items: ["一份主食（米饭/杂粮饭）+ 一份蛋白（鸡胸/鱼/瘦肉）+ 双份蔬菜。","尽量少选油炸、奶茶，给下午的精力留一点空间。","可以把酱料单独放，自己控制用量，避免“隐形油盐”。"] },
      { key: "afternoon", label: "下午 · 小加餐", items: ["适量坚果（10 粒左右）+ 温水，比饼干更友好。","一份水果（橙子/苹果/莓果），补充维 C 和纤维。","如果很困，可以来一小杯咖啡，但尽量不要太晚。"] },
      { key: "night", label: "晚上 · 晚餐 & 宵夜", items: ["晚餐控制主食量，多蔬菜 + 少油烹饪（清蒸、炖、焯）。","尽量在睡前 3 小时结束进食，让身体好好休息。","若真的想吃宵夜，可以选择一小杯温牛奶或无糖酸奶。"] }
    ]
  },

  onLoad() {
    const today = new Date();
    this.setData({ currentYear: today.getFullYear(), currentMonth: today.getMonth() + 1 });

    this.updateTimeBlocks();

    if (app.globalData.userInfo) {
      this.setData({ userInfo: app.globalData.userInfo });
    } else {
      this.fetchUserInfoFromDB();
    }

    this.loadTodayInfo();
    this.loadCheckinState(); // ✅ 新增
  },

  onShow() {
    if (app.globalData.userInfo) this.setData({ userInfo: app.globalData.userInfo });
    this.updateTimeBlocks();
    this.loadTodayInfo();
    this.loadCheckinState(); // ✅ 新增：确保跨天后刷新
  },

  /* ========= 时间建议 ========= */
  updateTimeBlocks() {
    const hour = new Date().getHours();
    let key = "morning", label = "早晨";

    if (hour >= 11 && hour < 14) { key = "noon"; label = "中午"; }
    else if (hour >= 14 && hour < 18) { key = "afternoon"; label = "下午"; }
    else if (hour >= 18 || hour < 5) { key = "night"; label = "晚上"; }

    const care = this.data.careByTime.find(c => c.key === key) || this.data.careByTime[0];
    const diet = this.data.dietByTime.find(d => d.key === key) || this.data.dietByTime[0];

    this.setData({ timePeriod: label, currentCare: care, currentDiet: diet });
  },

  /* ========= 用户信息 ========= */
  async fetchUserInfoFromDB() {
    const openid = app.globalData.openid;
    if (!openid) return;
    const db = wx.cloud.database();

    try {
      const res = await db.collection("users").where({ openid }).get();
      if (res.data.length) {
        const u = res.data[0];
        const name = u.nickname || u.name || "同学";
        const height = u.height || "";
        const userInfo = { name, height };
        this.setData({ userInfo });
        app.globalData.userInfo = userInfo;
      }
    } catch (e) {
      console.error("加载用户信息失败", e);
    }
  },

  /* ========= 今日体重 ========= */
  async loadTodayInfo() {
    if (!app.globalData.openid) return;
    const db = wx.cloud.database();
    const today = new Date();
    const todayStr = this.formatDate(today.getFullYear(), today.getMonth() + 1, today.getDate());

    try {
      const res = await db.collection("weights").where({
        openid: app.globalData.openid,
        date: todayStr
      }).get();

      if (res.data.length) {
        const w = res.data[0].weight;
        const height = Number(this.data.userInfo.height || 0);
        let bmi = "", percent = 0;

        if (height && w) {
          const hMeter = height / 100;
          bmi = (w / (hMeter * hMeter)).toFixed(1);
          percent = Math.max(0, Math.min(100, (bmi / 30) * 100));
        }

        this.setData({
          todayWeight: w,
          todayBMI: bmi || "",
          bmiPercent: percent,
          todayTip: "已记录今日体重，继续保持温柔的生活节奏～"
        });
      } else {
        this.setData({
          todayWeight: "",
          todayBMI: "",
          bmiPercent: 0,
          todayTip: "今天还没有记录体重呢，点击下面“记录体重”开始吧～"
        });
      }
    } catch (e) {
      console.error("加载今日体重失败", e);
    }
  },

  formatDate(year, month, day) {
    const d = new Date(year, month - 1, day);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, "0");
    const dd = d.getDate().toString().padStart(2, "0");
    return `${y}-${m}-${dd}`;
  },

  /* ========= ✅ 打卡次数（本地存储） ========= */
  loadCheckinState() {
    const key = "home_checkin_state";
    const state = wx.getStorageSync(key) || {};
    const todayStr = this.formatDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());

    // 跨天：todayCount 归零，总次数不变；撤销机会重置；间隔计时重置
    if (!state.date || state.date !== todayStr) {
      const next = {
        date: todayStr,
        todayCount: 0,
        totalCount: Number(state.totalCount || 0),
        undoUsed: false,
        lastCheckinTs: 0 // ✅ 新增：上次签到时间戳
      };
      wx.setStorageSync(key, next);
      this.setData({ checkinToday: 0, checkinTotal: next.totalCount });
      return;
    }

    this.setData({
      checkinToday: Number(state.todayCount || 0),
      checkinTotal: Number(state.totalCount || 0)
    });
  },

  tapCheckin() {
    const key = "home_checkin_state";
    const state = wx.getStorageSync(key) || {};
    const todayStr = this.formatDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());

    // 保险：跨天重置
    if (!state.date || state.date !== todayStr) {
      state.date = todayStr;
      state.todayCount = 0;
      state.totalCount = Number(state.totalCount || 0);
      state.undoUsed = false;
      state.lastCheckinTs = 0; // ✅ 新增：跨天重置间隔计时
    }

    // ✅ 新增：两次签到至少间隔 1 小时
    const nowTs = Date.now();
    const lastTs = Number(state.lastCheckinTs || 0);
    if (lastTs && (nowTs - lastTs) < MIN_CHECKIN_INTERVAL_MS) {
      const leftMs = MIN_CHECKIN_INTERVAL_MS - (nowTs - lastTs);
      const leftMin = Math.ceil(leftMs / 60000);
      wx.showToast({ title: `签到太频繁啦～请 ${leftMin} 分钟后再来`, icon: "none" });
      return;
    }

    if (Number(state.todayCount || 0) >= CHECKIN_LIMIT_PER_DAY) {
      wx.showToast({ title: `今日已达上限（${CHECKIN_LIMIT_PER_DAY}次）`, icon: "none" });
      this.setData({ checkinToday: state.todayCount, checkinTotal: state.totalCount });
      return;
    }

    state.todayCount = Number(state.todayCount || 0) + 1;
    state.totalCount = Number(state.totalCount || 0) + 1;
    state.date = todayStr;

    // ✅ 新增：记录本次签到时间戳（用于1小时间隔限制）
    state.lastCheckinTs = Date.now();

    wx.setStorageSync(key, state);
    this.setData({ checkinToday: state.todayCount, checkinTotal: state.totalCount });

    // ✅ 新增：签到成功 +1 积分（1 积分 = 1 秒 或 1 m）
    const openid = app.globalData.openid || "local";
    const cur = getPoints(openid);
    setPoints(openid, cur + 1);

    wx.showToast({ title: `打卡 +1（${state.todayCount}/${CHECKIN_LIMIT_PER_DAY}）`, icon: "success" });
  },

  // ✅ 新增：撤销一次（每天仅一次机会）
  undoCheckin() {
    const key = "home_checkin_state";
    const state = wx.getStorageSync(key) || {};
    const todayStr = this.formatDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());

    // 跨天保护
    if (!state.date || state.date !== todayStr) {
      wx.showToast({ title: "今天还没有可撤销的打卡", icon: "none" });
      this.loadCheckinState();
      return;
    }

    if (state.undoUsed) {
      wx.showToast({ title: "今日撤销机会已用完", icon: "none" });
      return;
    }

    const todayCount = Number(state.todayCount || 0);
    const totalCount = Number(state.totalCount || 0);

    if (todayCount <= 0 || totalCount <= 0) {
      wx.showToast({ title: "暂无可撤销次数", icon: "none" });
      return;
    }

    state.todayCount = todayCount - 1;
    state.totalCount = totalCount - 1;
    state.undoUsed = true;

    wx.setStorageSync(key, state);
    this.setData({ checkinToday: state.todayCount, checkinTotal: state.totalCount });

    // ✅ 新增：撤销对应 -1 积分（不小于 0）
    const openid = app.globalData.openid || "local";
    const cur = getPoints(openid);
    setPoints(openid, Math.max(0, cur - 1));

    wx.showToast({ title: "已撤销 1 次", icon: "success" });
  },

  /* ========= 跳转 ========= */
  goRecord() {
    wx.navigateTo({ url: "/pages/record/record" });
  },

  goWorkoutPlan() {
    wx.navigateTo({ url: "/pages/workout/workout" });
  },

  goDiet() {
    wx.navigateTo({ url: "/pages/workout/workout" });
  },

  // ✅ 饮食拍照记录
  goDietPhoto() {
    wx.navigateTo({ url: "/pages/dietPhoto/dietPhoto" });
  },

  // ✅ 助眠音乐
  goSleepMusic() {
    wx.navigateTo({ url: "/pages/sleepMusic/sleepMusic" });
  }
});
