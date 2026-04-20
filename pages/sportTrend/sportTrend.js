const app = getApp();

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// "mm:ss" 或 "m:ss" -> 分钟数（用于粗略计算）
function durationStrToMinutes(str) {
  if (!str) return 0;
  const s = String(str).trim();
  const parts = s.split(":").map(x => Number(x));
  if (parts.length !== 2 || parts.some(x => !Number.isFinite(x))) return 0;
  const mm = parts[0], ss = parts[1];
  return Math.max(0, Math.round(mm + ss / 60));
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 生成最近 N 天日期数组（从今天往前）
function buildLastNDays(n = 30) {
  const today = new Date();
  const arr = [];
  for (let i = 0; i < n; i++) {
    const dt = new Date(today.getTime() - i * 86400000);
    arr.push(formatDate(dt));
  }
  return arr; // [today, yesterday, ...]
}

Page({
  data: {
    loading: false,
    // 列表：按日期分组
    dayGroups: [],
    // 用于空状态提示
    empty: false
  },

  onShow() {
    this.loadDailyDetails();
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  // =========================
  // 主入口：优先 sport_daily；没有则 fallback 从 workout_checkins 聚合
  // =========================
  async loadDailyDetails() {
    this.setData({ loading: true, empty: false });

    try {
      // 确保 openid
      await this.ensureOpenid();

      const ok = await this.loadFromSportDaily();
      if (!ok) {
        await this.loadFromWorkoutCheckinsFallback();
      }

      const empty = !this.data.dayGroups || this.data.dayGroups.length === 0;
      this.setData({ empty, loading: false });
    } catch (e) {
      console.error("loadDailyDetails error:", e);
      this.setData({ loading: false, empty: true });
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },

  async ensureOpenid() {
    if (app.globalData.openid) return;
    const r = await wx.cloud.callFunction({ name: "login" });
    const openid = r && r.result && r.result.openid;
    if (!openid) throw new Error("login 云函数未返回 openid");
    app.globalData.openid = openid;
  },

  // =========================
  // 方案A：读 sport_daily（推荐）
  // =========================
  async loadFromSportDaily() {
    const db = wx.cloud.database();
    const _ = db.command;

    const dates = buildLastNDays(30);
    const start = dates[dates.length - 1];
    const end = dates[0];

    let res;
    try {
      res = await db.collection("sport_daily")
        .where({
          openid: app.globalData.openid,
          dateStr: _.gte(start).and(_.lte(end))
        })
        .orderBy("dateStr", "desc")
        .get();
    } catch (e) {
      console.warn("sport_daily 不存在或无权限/无数据：", e);
      return false;
    }

    const list = res.data || [];
    if (!list.length) return false;

    const dayGroups = list.map(day => {
      const runs = Array.isArray(day.runs) ? day.runs : [];
      const normalizedRuns = runs.map((r, idx) => {
        const distanceKm = safeNum(r.distanceKm);
        const durationSec = safeNum(r.duration);
        const minutes = safeNum(r.minutes) || (durationSec ? Math.round(durationSec / 60) : durationStrToMinutes(r.durationStr));
        const avgSpeedKmh = safeNum(r.avgSpeedKmh);
        return {
          idx: idx + 1,
          checkinId: r.checkinId || "",
          distanceKm: distanceKm ? distanceKm.toFixed(2) : "0.00",
          durationStr: r.durationStr || (durationSec ? `${String(Math.floor(durationSec / 60)).padStart(2, "0")}:${String(durationSec % 60).padStart(2, "0")}` : "--:--"),
          minutes,
          paceStr: r.paceStr || "--'--\"",
          movingPaceStr: r.movingPaceStr || "--'--\"",
          avgSpeedKmh: avgSpeedKmh ? avgSpeedKmh.toFixed(1) : "0.0"
        };
      });

      return {
        dateStr: day.dateStr,
        totalDistanceKm: safeNum(day.totalDistanceKm).toFixed(2),
        totalMinutes: safeNum(day.totalMinutes),
        runCount: safeNum(day.runCount) || normalizedRuns.length,
        runs: normalizedRuns
      };
    });

    this.setData({ dayGroups });
    return true;
  },

  // =========================
  // 方案B：fallback 从 workout_checkins(type=run) 聚合成按天
  // =========================
  async loadFromWorkoutCheckinsFallback() {
    const db = wx.cloud.database();
    const openid = app.globalData.openid;

    // 拉最近 200 条跑步（一般足够覆盖 30 天）
    const res = await db.collection("workout_checkins")
      .where({ openid, type: "run" })
      .orderBy("createTime", "desc")
      .limit(200)
      .get();

    const list = res.data || [];
    if (!list.length) {
      this.setData({ dayGroups: [] });
      return;
    }

    // 按 dateStr 分组
    const map = {};
    list.forEach(item => {
      const dateStr = item.dateStr || "";
      if (!dateStr) return;

      if (!map[dateStr]) {
        map[dateStr] = {
          dateStr,
          totalDistanceKm: 0,
          totalMinutes: 0,
          runs: []
        };
      }

      const distanceKm = safeNum(item.distanceKm || (safeNum(item.distance) / 1000));
      const durationSec = safeNum(item.duration);
      const minutes = durationSec ? Math.round(durationSec / 60) : durationStrToMinutes(item.durationStr);

      map[dateStr].totalDistanceKm += distanceKm;
      map[dateStr].totalMinutes += minutes;

      map[dateStr].runs.push({
        checkinId: item._id,
        distanceKm: distanceKm ? distanceKm.toFixed(2) : "0.00",
        durationStr: item.durationStr || "--:--",
        minutes,
        paceStr: item.paceStr || "--'--\"",
        movingPaceStr: item.movingPaceStr || "--'--\"",
        avgSpeedKmh: safeNum(item.avgSpeedKmh).toFixed(1)
      });
    });

    // 转为数组 + 排序（日期降序）
    const dayGroups = Object.keys(map)
      .sort((a, b) => (a > b ? -1 : 1))
      .slice(0, 30)
      .map(dateStr => {
        const g = map[dateStr];
        const runs = g.runs.map((r, idx) => ({
          idx: idx + 1,
          ...r
        }));
        return {
          dateStr,
          totalDistanceKm: g.totalDistanceKm.toFixed(2),
          totalMinutes: g.totalMinutes,
          runCount: runs.length,
          runs
        };
      });

    this.setData({ dayGroups });
  },

  // （可选）以后做“查看轨迹详情”可以用 checkinId 跳详情页
  onTapRunItem(e) {
    const { checkinid } = e.currentTarget.dataset;
    if (!checkinid) return;

    // 你如果以后做跑步详情页：/pages/runDetail/runDetail?checkinId=xxx
    // 目前先弹信息即可
    wx.showToast({ title: `记录ID：${checkinid}`, icon: "none" });
  }
});
