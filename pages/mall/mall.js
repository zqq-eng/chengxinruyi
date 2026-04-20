// pages/mall/mall.js
const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

function pad2(n) { return String(n).padStart(2, "0"); }
function monthKeyOf(d = new Date()) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
function n(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

/* =====================
 * ✅ 仅显示用：格式化
 * ===================== */
function formatSecToMinSec(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}分钟${r}秒`;
}
function formatKmToKmM(km) {
  const meters = Math.max(0, Math.floor((Number(km) || 0) * 1000));
  const k = Math.floor(meters / 1000);
  const r = meters % 1000;
  return `${k}千米${r}米`;
}

/**
 * ✅ 兼容 iOS：把各种“时长格式”转为秒
 * 支持：
 * - 数字 / "123" / "123.5"
 * - "mm:ss" / "hh:mm:ss"
 * - "15分钟" / "1小时20分30秒"
 * - "1h20m30s"
 */
function parseDurationToSec(v) {
  if (v === null || v === undefined) return 0;

  // 数字 or 数字字符串
  const num = Number(v);
  if (Number.isFinite(num)) return num;

  const s = String(v).trim();
  if (!s) return 0;

  // 形如 "hh:mm:ss" 或 "mm:ss"
  if (s.indexOf(":") !== -1) {
    const parts = s.split(":").map(p => Number(p));
    if (parts.some(x => !Number.isFinite(x))) return 0;

    if (parts.length === 2) {
      // mm:ss
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3) {
      // hh:mm:ss
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }

  // 中文：1小时20分30秒 / 15分钟 / 30秒
  if (/[小时分秒]/.test(s)) {
    let sec = 0;
    const h = s.match(/(\d+(?:\.\d+)?)\s*小时/);
    const m = s.match(/(\d+(?:\.\d+)?)\s*分/);
    const se = s.match(/(\d+(?:\.\d+)?)\s*秒/);
    if (h) sec += Number(h[1]) * 3600;
    if (m) sec += Number(m[1]) * 60;
    if (se) sec += Number(se[1]);
    return Number.isFinite(sec) ? sec : 0;
  }

  // 英文：1h20m30s / 15m / 30s
  if (/[hms]/i.test(s)) {
    let sec = 0;
    const h = s.match(/(\d+(?:\.\d+)?)\s*h/i);
    const m = s.match(/(\d+(?:\.\d+)?)\s*m/i);
    const se = s.match(/(\d+(?:\.\d+)?)\s*s/i);
    if (h) sec += Number(h[1]) * 3600;
    if (m) sec += Number(m[1]) * 60;
    if (se) sec += Number(se[1]);
    return Number.isFinite(sec) ? sec : 0;
  }

  // 兜底：取字符串里的数字（比如 "120 sec"）
  const any = s.match(/(\d+(?:\.\d+)?)/);
  if (any) {
    const val = Number(any[1]);
    return Number.isFinite(val) ? val : 0;
  }
  return 0;
}

// ✅ 从一条记录里尽可能“猜”出秒数（不改变你原逻辑，只是更兼容）
function getSecFromRecord(r) {
  // 你原本的优先级（durationSec/duration/totalSeconds/minutes/totalMinutes）
  let sec =
    parseDurationToSec(r.durationSec) ||
    parseDurationToSec(r.duration) ||
    parseDurationToSec(r.totalSeconds) ||
    0;

  // iOS 常见：durationStr / timeStr 等字符串字段
  if (!sec) {
    sec =
      parseDurationToSec(r.durationStr) ||
      parseDurationToSec(r.timeStr) ||
      parseDurationToSec(r.costTime) ||
      0;
  }

  // 原本的 minutes/totalMinutes 逻辑（可能是数字或字符串）
  if (!sec) {
    const min = parseDurationToSec(r.minutes);
    const tmin = parseDurationToSec(r.totalMinutes);
    if (min) sec = min * 60;
    else if (tmin) sec = tmin * 60;
  }

  // 保底
  sec = n(sec);

  // 容错：如果非常小但又不像秒，可能是“分钟”
  const raw = r.durationSec ?? r.duration ?? r.totalSeconds ?? r.minutes ?? r.totalMinutes;
  const rawStr = raw === undefined ? "" : String(raw);

  if (sec > 0 && sec < 20) {
    if (rawStr.indexOf(":") === -1 && !/[小时分秒hms]/i.test(rawStr)) {
      sec = sec * 60;
    }
  }

  return Math.max(0, Math.floor(sec));
}

/* =====================
 * ✅ 积分：本地存储（按 openid 隔离）
 * ===================== */
function pointsKey(openid) {
  return `user_points_v1_${openid || "local"}`;
}
function getPoints(openid) {
  const v = wx.getStorageSync(pointsKey(openid));
  const num = Number(v);
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0;
}
function setPoints(openid, val) {
  const x = Math.max(0, Math.floor(Number(val) || 0));
  wx.setStorageSync(pointsKey(openid), x);
  return x;
}

/* =====================
 * ✅ 积分兑换奖励：按 openid + monthKey 存（本月有效）
 * - bonusSec：额外可用秒数（积分兑时长）
 * - bonusKm：额外可用公里数（积分兑距离：米/1000）
 * ===================== */
function bonusKey(openid, mk) {
  return `mall_points_bonus_v1_${openid || "local"}_${mk || "unknown"}`;
}
function loadBonus(openid, mk) {
  const raw = wx.getStorageSync(bonusKey(openid, mk)) || {};
  const bonusSec = Math.max(0, Math.floor(Number(raw.bonusSec) || 0));
  const bonusKm = Math.max(0, Number((Number(raw.bonusKm) || 0).toFixed(3)));
  return { bonusSec, bonusKm };
}
function saveBonus(openid, mk, bonusSec, bonusKm) {
  const data = {
    bonusSec: Math.max(0, Math.floor(Number(bonusSec) || 0)),
    bonusKm: Math.max(0, Number((Number(bonusKm) || 0).toFixed(3)))
  };
  wx.setStorageSync(bonusKey(openid, mk), data);
  return data;
}

Page({
  data: {
    loading: true,
    tab: "time",

    monthKey: "",
    monthTotalSec: 0,
    monthTotalKm: 0,
    usedSec: 0,
    usedKm: 0,

    // ✅ 积分兑换奖励（本月）
    bonusSec: 0,
    bonusKm: 0,

    availSec: 0,
    availKm: 0,

    // ✅ 新增：只用于显示（分钟秒 / 千米米）
    availSecStr: "0分钟0秒",
    availKmStr: "0千米0米",

    itemsTime: [],
    itemsDist: [],
    itemsBoth: [],

    redeemVisible: false,
    redeemItem: null,
    formNick: "",
    formPhone: "",
    formAddr: "",
    formRemark: "",

    inboxVisible: false,
    inboxLoading: false,
    inboxUnread: 0,
    inboxList: [],

    // ✅ 积分展示 + 积分兑换弹窗
    points: 0,
    pointsExVisible: false,
    pointsExMode: "time",     // "time" | "dist"
    pointsExInput: "",
    pointsExResult: "0 秒"
  },

  onShow() {
    this.initPage();
  },

  async initPage() {
    this.setData({ loading: true });
    try {
      await this.ensureOpenid();

      const mk = monthKeyOf(new Date());
      this.setData({ monthKey: mk });

      // 1) 本月运动额度
      await this.loadMonthlyWorkout(mk);

      // 2) 本月已兑换消耗
      await this.loadMonthlyUsed(mk);

      // 3) ✅ 加载本月积分兑换奖励（本地）
      const openid = app.globalData.openid || "local";
      const b = loadBonus(openid, mk);
      this.setData({ bonusSec: b.bonusSec, bonusKm: b.bonusKm });

      // 4) 可用额度（含奖励）+ 显示字符串
      this.recalcAvail();

      // 5) 商品：默认固定商品永远存在 + 云端商品追加/覆盖
      await this.loadGoodsCloudMergeDefault();

      // 6) 收件箱未读
      await this.refreshInboxUnread();

      // ✅ 显示积分
      this.setData({ points: getPoints(openid) });
    } catch (e) {
      console.error("initPage error", e);
      wx.showToast({ title: "商城加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async ensureOpenid() {
    if (app.globalData.openid) return;
    const r = await wx.cloud.callFunction({ name: "login" });
    const openid = r && r.result && r.result.openid;
    if (!openid) throw new Error("login 云函数未返回 openid");
    app.globalData.openid = openid;
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab) return;
    this.setData({ tab });
  },

  /* =====================
   * 本月运动额度：
   * A) workout
   * B) sport_daily
   * C) workout_checkins
   * ===================== */
  async loadMonthlyWorkout(mk) {
    const openid = app.globalData.openid;

    const [y, m] = mk.split("-").map(x => Number(x));
    const startDate = new Date(y, m - 1, 1, 0, 0, 0);
    const endDate = new Date(y, m, 1, 0, 0, 0); // 下月1号（开区间）
    const startStr = toDateStr(startDate);
    const endStr = toDateStr(new Date(endDate.getTime() - 86400000));

    let totalSec = 0;
    let totalKm = 0;

    const whereUser = _.or([{ openid }, { _openid: openid }]);
    const whereMonth = _.or([
      { dateStr: _.gte(startStr).and(_.lte(endStr)) },
      { createdAt: _.gte(startDate).and(_.lt(endDate)) },
      { createTime: _.gte(startDate).and(_.lt(endDate)) }
    ]);

    // ========= A) workout =========
    try {
      let all = [];
      let skip = 0;
      const pageSize = 200;

      while (true) {
        const res = await db.collection("workout")
          .where(_.and([whereUser, whereMonth]))
          .orderBy("dateStr", "asc")
          .skip(skip)
          .limit(pageSize)
          .get();

        const arr = res.data || [];
        all = all.concat(arr);
        if (arr.length < pageSize) break;
        skip += pageSize;
        if (skip > 5000) break;
      }

      if (all.length) {
        all.forEach(w => {
          const sec = getSecFromRecord(w);

          let km =
            n(w.distanceKm) ||
            n(w.totalDistanceKm) ||
            n(w.distance) ||
            0;

          if (km > 2000) km = km / 1000;

          totalSec += sec;
          totalKm += km;
        });

        this.setData({
          monthTotalSec: Math.floor(totalSec),
          monthTotalKm: Number(totalKm.toFixed(2))
        });
        return;
      }
    } catch (e) { }

    // ========= B) sport_daily =========
    try {
      let all = [];
      let skip = 0;
      const pageSize = 200;

      while (true) {
        const res = await db.collection("sport_daily")
          .where(_.and([whereUser, whereMonth]))
          .orderBy("dateStr", "asc")
          .skip(skip)
          .limit(pageSize)
          .get();

        const arr = res.data || [];
        all = all.concat(arr);
        if (arr.length < pageSize) break;
        skip += pageSize;
        if (skip > 5000) break;
      }

      if (all.length) {
        all.forEach(day => {
          const sec = getSecFromRecord(day);
          totalSec += sec;

          let km = 0;
          if (day.distanceKm !== undefined && day.distanceKm !== null && day.distanceKm !== "") {
            km = n(day.distanceKm);
          } else if (day.totalDistanceKm !== undefined) {
            km = n(day.totalDistanceKm);
          } else if (day.distance !== undefined && day.distance !== null) {
            km = n(day.distance);
            if (km > 2000) km = km / 1000;
          }
          totalKm += km;
        });

        this.setData({
          monthTotalSec: Math.floor(totalSec),
          monthTotalKm: Number(totalKm.toFixed(2))
        });
        return;
      }
    } catch (e) { }

    // ========= C) workout_checkins =========
    try {
      let all = [];
      let skip = 0;
      const pageSize = 200;

      while (true) {
        const res = await db.collection("workout_checkins")
          .where(_.and([whereUser, whereMonth]))
          .orderBy("dateStr", "asc")
          .skip(skip)
          .limit(pageSize)
          .get();

        const arr = res.data || [];
        all = all.concat(arr);
        if (arr.length < pageSize) break;
        skip += pageSize;
        if (skip > 5000) break;
      }

      if (all.length) {
        all.forEach(r => {
          const sec = getSecFromRecord(r);
          totalSec += sec;

          let km =
            n(r.distanceKm) ||
            n(r.totalDistanceKm) ||
            n(r.distance) ||
            0;

          if (km > 2000) km = km / 1000;
          totalKm += km;
        });

        this.setData({
          monthTotalSec: Math.floor(totalSec),
          monthTotalKm: Number(totalKm.toFixed(2))
        });
        return;
      }
    } catch (e) { }

    this.setData({ monthTotalSec: 0, monthTotalKm: 0 });
  },

  /* =====================
   * 本月已兑换消耗：mall_orders（驳回不计）
   * ===================== */
  async loadMonthlyUsed(mk) {
    const openid = app.globalData.openid;
    const pageSize = 200;

    try {
      let all = [];
      let skip = 0;

      while (true) {
        const res = await db.collection("mall_orders")
          .where({
            _openid: openid,
            monthKey: mk,
            status: _.neq("rejected")
          })
          .orderBy("createdAt", "desc")
          .skip(skip)
          .limit(pageSize)
          .get();

        const arr = res.data || [];
        all = all.concat(arr);
        if (arr.length < pageSize) break;
        skip += pageSize;
        if (skip > 5000) break;
      }

      let usedSec = 0;
      let usedKm = 0;
      all.forEach(o => {
        usedSec += n(o.costSec);
        usedKm += n(o.costKm);
      });

      this.setData({
        usedSec: Math.floor(usedSec),
        usedKm: Number(usedKm.toFixed(2))
      });
    } catch (e) {
      const msg = (e && e.errMsg) || "";
      if (msg.includes("collection not exists") || msg.includes("Db or Table not exist") || (e && e.errCode === -502005)) {
        this.setData({ usedSec: 0, usedKm: 0 });
        return;
      }
      console.error("loadMonthlyUsed error", e);
      this.setData({ usedSec: 0, usedKm: 0 });
    }
  },

  // ✅ 可用额度 = 本月运动额度 + 积分兑换奖励 - 已兑换消耗
  recalcAvail() {
    const bonusSec = Math.max(0, Math.floor(n(this.data.bonusSec)));
    const bonusKm = Math.max(0, Number(n(this.data.bonusKm).toFixed(3)));

    const totalSec = Math.floor(n(this.data.monthTotalSec) + bonusSec);
    const totalKm = Number((n(this.data.monthTotalKm) + bonusKm).toFixed(3));

    const availSec = Math.max(0, Math.floor(totalSec - n(this.data.usedSec)));
    const availKm = Math.max(0, Number((totalKm - n(this.data.usedKm)).toFixed(3)));

    this.setData({
      availSec,
      availKm,
      // ✅ 你要的显示格式
      availSecStr: formatSecToMinSec(availSec),
      availKmStr: formatKmToKmM(availKm)
    });
  },

  /* =====================
   * 商品：默认固定商品永远存在 + 云端商品覆盖
   * ===================== */
  async loadGoodsCloudMergeDefault() {
    const cloudList = await this.tryLoadGoodsFromCloud();
    const localList = this.defaultGoods();

    const map = new Map();
    (localList || []).forEach(g => map.set(g.id, g));
    (cloudList || []).forEach(g => map.set(g.id, g));

    const merged = Array.from(map.values());
    this.applyGoods(merged);
  },

  async tryLoadGoodsFromCloud() {
    try {
      const res = await db.collection("mall_goods")
        .where({ active: true })
        .orderBy("sort", "asc")
        .orderBy("updatedAt", "desc")
        .limit(200)
        .get();

      const arr = res.data || [];
      if (!arr.length) return [];

      return arr.map(g => {
        const type = g.type || "time";
        const costSec = n(g.costSec);
        const costKm = n(g.costKm);

        if (type === "time" && costSec < 60) return null;
        if (type === "dist" && costKm < 1) return null;
        if (type === "both" && (costSec < 60 || costKm < 1)) return null;

        return {
          id: g._id,
          title: String(g.title || ""),
          subtitle: String(g.subtitle || ""),
          type,
          tag: String(g.tag || ""),
          costSec: type === "dist" ? 0 : costSec,
          costKm: type === "time" ? 0 : costKm,
          sort: n(g.sort) || 10
        };
      }).filter(Boolean);
    } catch (e) {
      const msg = (e && e.errMsg) || "";
      if (msg.includes("collection not exists") || msg.includes("Db or Table not exist") || (e && e.errCode === -502005)) {
        return [];
      }
      console.error("tryLoadGoodsFromCloud error", e);
      return [];
    }
  },

  applyGoods(list) {
    const time = [];
    const dist = [];
    const both = [];

    (list || []).forEach(g => {
      if (g.type === "time") time.push(g);
      else if (g.type === "dist") dist.push(g);
      else both.push(g);
    });

    const sortFn = (a, b) => {
      const sa = n(a.sort);
      const sb = n(b.sort);
      if (sa !== sb) return sa - sb;
      return String(a.title || "").localeCompare(String(b.title || ""));
    };

    this.setData({
      itemsTime: time.sort(sortFn),
      itemsDist: dist.sort(sortFn),
      itemsBoth: both.sort(sortFn)
    });
  },

  defaultGoods() {
    return [
      { id: "d_time_1", title: "校园订餐 5 元券", subtitle: "50 分钟运动奖励", type: "time", tag: "时长兑换", costSec: 50 * 60, costKm: 0, sort: 10 },
      { id: "d_time_2", title: "校园订餐 10 元券", subtitle: "80 分钟运动奖励", type: "time", tag: "时长兑换", costSec: 80 * 60, costKm: 0, sort: 20 },
      { id: "d_time_3", title: "奶茶 / 饮品兑换券", subtitle: "100 分钟运动奖励", type: "time", tag: "时长兑换", costSec: 100 * 60, costKm: 0, sort: 30 },

      { id: "d_dist_1", title: "运动毛巾", subtitle: "50 km 跑步奖励", type: "dist", tag: "距离兑换", costSec: 0, costKm: 50, sort: 110 },
      { id: "d_dist_2", title: "运动水杯", subtitle: "80 km 跑步奖励", type: "dist", tag: "距离兑换", costSec: 0, costKm: 80, sort: 120 },
      { id: "d_dist_3", title: "护腕 / 运动袜", subtitle: "100 km 跑步奖励", type: "dist", tag: "距离兑换", costSec: 0, costKm: 100, sort: 130 },

      { id: "d_both_1", title: "小公仔盲盒", subtitle: "60 分钟 + 60 km", type: "both", tag: "双条件", costSec: 60 * 60, costKm: 60, sort: 210 },
      { id: "d_both_2", title: "运动装备福袋", subtitle: "90 分钟 + 90 km", type: "both", tag: "双条件", costSec: 90 * 60, costKm: 90, sort: 220 },
      { id: "d_both_3", title: "校园周边套装", subtitle: "120 分钟 + 120 km", type: "both", tag: "双条件", costSec: 120 * 60, costKm: 120, sort: 230 }
    ];
  },

  /* =====================
   * ✅ 积分兑换（即时生效，不走审核）
   * ===================== */
  openPointsExchange(e) {
    const mode = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.mode) || "time";
    const openid = app.globalData.openid || "local";

    const points = getPoints(openid);
    const result = mode === "dist" ? "0 m（0.000 km）" : "0 秒（0 分钟）";

    this.setData({
      points,
      pointsExVisible: true,
      pointsExMode: mode === "dist" ? "dist" : "time",
      pointsExInput: "",
      pointsExResult: result
    });
  },

  closePointsExchange() {
    this.setData({ pointsExVisible: false });
  },

  onPointsExInput(e) {
    const v = (e && e.detail && e.detail.value) ? String(e.detail.value) : "";
    const p = Math.max(0, Math.floor(Number(v) || 0));
    const mode = this.data.pointsExMode;

    let result = "0 秒（0 分钟）";
    if (mode === "dist") {
      const km = Number((p / 1000).toFixed(3));
      result = `${p} m（${km} km）`;
    } else {
      const min = Math.floor(p / 60);
      result = `${p} 秒（${min} 分钟）`;
    }

    this.setData({ pointsExInput: v, pointsExResult: result });
  },

  async submitPointsExchange() {
    try {
      await this.ensureOpenid();

      const openid = app.globalData.openid || "local";
      const mk = this.data.monthKey;

      const have = getPoints(openid);
      const use = Math.max(0, Math.floor(Number(this.data.pointsExInput) || 0));

      if (!use) return wx.showToast({ title: "请输入要使用的积分", icon: "none" });
      if (use > have) return wx.showToast({ title: "积分不足", icon: "none" });

      const mode = this.data.pointsExMode;

      // 1) 扣积分
      const left = setPoints(openid, have - use);

      // 2) 增加本月奖励额度（本地持久化）
      let bonusSec = Math.max(0, Math.floor(n(this.data.bonusSec)));
      let bonusKm = Math.max(0, Number(n(this.data.bonusKm).toFixed(3)));

      if (mode === "dist") {
        // 1积分=1m => km = m/1000
        bonusKm = Number((bonusKm + use / 1000).toFixed(3));
      } else {
        // 1积分=1秒
        bonusSec = bonusSec + use;
      }

      const saved = saveBonus(openid, mk, bonusSec, bonusKm);

      // 3) 刷新展示 + 可用额度
      this.setData({
        points: left,
        bonusSec: saved.bonusSec,
        bonusKm: saved.bonusKm
      });
      this.recalcAvail();

      // 4) 关闭弹窗
      this.closePointsExchange();

      wx.showToast({ title: "兑换成功", icon: "success" });
    } catch (e) {
      console.error("submitPointsExchange error", e);
      wx.showToast({ title: "兑换失败，请稍后重试", icon: "none" });
    }
  },

  /* =====================
   * 商品兑换弹窗
   * ===================== */
  openRedeem(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;

    const all = [...this.data.itemsTime, ...this.data.itemsDist, ...this.data.itemsBoth];
    const item = all.find(x => x.id === id);
    if (!item) return;

    if (!this.canRedeem(item)) return;

    this.setData({
      redeemVisible: true,
      redeemItem: item,
      formNick: "",
      formPhone: "",
      formAddr: "",
      formRemark: ""
    });
  },

  closeRedeem() {
    this.setData({ redeemVisible: false, redeemItem: null });
  },

  stopTap() { },

  onNick(e) { this.setData({ formNick: e.detail.value }); },
  onPhone(e) { this.setData({ formPhone: e.detail.value }); },
  onAddr(e) { this.setData({ formAddr: e.detail.value }); },
  onRemark(e) { this.setData({ formRemark: e.detail.value }); },

  canRedeem(item) {
    const secNeed = n(item.costSec);
    const kmNeed = n(item.costKm);

    if (item.type === "time" && secNeed < 60) {
      wx.showToast({ title: "该商品时长不合法", icon: "none" });
      return false;
    }
    if (item.type === "dist" && kmNeed < 1) {
      wx.showToast({ title: "该商品距离不合法", icon: "none" });
      return false;
    }
    if (item.type === "both" && (secNeed < 60 || kmNeed < 1)) {
      wx.showToast({ title: "该商品兑换规则不合法", icon: "none" });
      return false;
    }

    if (secNeed > 0 && this.data.availSec < secNeed) {
      wx.showToast({ title: "可用时长不足", icon: "none" });
      return false;
    }
    if (kmNeed > 0 && this.data.availKm < kmNeed) {
      wx.showToast({ title: "可用距离不足", icon: "none" });
      return false;
    }
    return true;
  },

  async submitRedeem() {
    const item = this.data.redeemItem;
    if (!item) return;

    if (!this.canRedeem(item)) return;

    const nick = (this.data.formNick || "").trim();
    const phone = (this.data.formPhone || "").trim();
    const address = (this.data.formAddr || "").trim();
    const remark = (this.data.formRemark || "").trim();

    if (!nick) return wx.showToast({ title: "请填写昵称", icon: "none" });
    if (!phone) return wx.showToast({ title: "请填写联系方式", icon: "none" });
    if (!address) return wx.showToast({ title: "请填写地址", icon: "none" });

    try {
      wx.showLoading({ title: "提交中..." });

      await db.collection("mall_orders").add({
        data: {
          monthKey: this.data.monthKey,
          status: "pending",

          itemId: item.id,
          itemTitle: item.title,
          itemType: item.type,
          costSec: n(item.costSec),
          costKm: n(item.costKm),

          nick,
          phone,
          address,
          remark,

          openid: app.globalData.openid,

          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });

      wx.hideLoading();
      wx.showToast({ title: "已提交审核", icon: "success" });

      this.closeRedeem();

      await this.loadMonthlyUsed(this.data.monthKey);
      this.recalcAvail();
      await this.refreshInboxUnread();
    } catch (e) {
      wx.hideLoading();
      const msg = (e && e.errMsg) || "";
      if (msg.includes("collection not exists") || msg.includes("Db or Table not exist") || (e && e.errCode === -502005)) {
        wx.showToast({ title: "请先创建 mall_orders 集合", icon: "none" });
        return;
      }
      console.error("submitRedeem error", e);
      wx.showToast({ title: "提交失败，请稍后重试", icon: "none" });
    }
  },

  /* =====================
   * 收件箱
   * ===================== */
  async refreshInboxUnread() {
    try {
      await this.ensureOpenid();
      const openid = app.globalData.openid;

      const res = await db.collection("user_inbox")
        .where(_.or([{ openid, read: false }, { _openid: openid, read: false }]))
        .limit(200)
        .get();

      this.setData({ inboxUnread: (res.data || []).length });
    } catch (e) {
      const msg = (e && e.errMsg) || "";
      if (msg.includes("collection not exists") || msg.includes("Db or Table not exist") || (e && e.errCode === -502005)) {
        this.setData({ inboxUnread: 0 });
        return;
      }
      console.error("refreshInboxUnread error", e);
      this.setData({ inboxUnread: 0 });
    }
  },

  async openInbox() {
    this.setData({ inboxVisible: true, inboxLoading: true, inboxList: [] });

    try {
      await this.ensureOpenid();
      const openid = app.globalData.openid;

      const res = await db.collection("user_inbox")
        .where(_.or([{ openid }, { _openid: openid }]))
        .orderBy("createdAt", "desc")
        .limit(200)
        .get();

      const list = res.data || [];
      this.setData({ inboxLoading: false, inboxList: list });

      const unreadIds = list.filter(x => x.read === false).map(x => x._id);
      if (unreadIds.length) {
        await Promise.all(unreadIds.map(id =>
          db.collection("user_inbox").doc(id).update({ data: { read: true } }).catch(() => null)
        ));
      }

      await this.refreshInboxUnread();
    } catch (e) {
      const msg = (e && e.errMsg) || "";
      if (msg.includes("collection not exists") || msg.includes("Db or Table not exist") || (e && e.errCode === -502005)) {
        this.setData({
          inboxLoading: false,
          inboxList: [{
            _id: "local_tip",
            type: "提示",
            title: "收件箱未启用",
            content: "user_inbox 集合未创建或无权限。后续管理员审核/发货/鼓励会显示在这里。",
            createdAtStr: ""
          }]
        });
        return;
      }
      console.error("openInbox error", e);
      this.setData({ inboxLoading: false, inboxList: [] });
      wx.showToast({ title: "收件箱加载失败", icon: "none" });
    }
  },

  closeInbox() {
    this.setData({ inboxVisible: false });
  }
});
