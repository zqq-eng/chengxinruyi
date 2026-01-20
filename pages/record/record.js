// pages/record/record.js
const app = getApp();

// 猫爪颜色（体重记录）
function getPawColorByDate(dateStr) {
  const colors = ["#ff9acb", "#ffb3d9", "#ffcce9", "#d6b5ff", "#c7bfff", "#add8ff", "#b4e1ff"];
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = dateStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// 运动等级 → 图标
function getSportIcon(level) {
  if (level === 1) return "🐾";
  if (level === 2) return "🐾🐾";
  if (level === 3) return "✨🐾✨";
  return "";
}

Page({
  data: {
    userInfo: {},

    currentYear: 0,
    currentMonth: 0,
    weekNames: ["日", "一", "二", "三", "四", "五", "六"],
    days: [],

    selectedDate: "",
    inputWeight: "",
    inputNote: "",

    // 当天运动详情
    sportInfo: null
  },

  onLoad() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;

    this.setData({ currentYear: year, currentMonth: month });

    this.generateCalendar(year, month);
  },

  // -------------------------------------------------------
  // 日历生成
  // -------------------------------------------------------
  async generateCalendar(year, month) {
    const firstDay = new Date(year, month - 1, 1);
    const startWeek = firstDay.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const prevDays = new Date(year, month - 1, 0).getDate();

    const cells = [];

    // 上月补齐
    for (let i = 0; i < startWeek; i++) {
      const day = prevDays - startWeek + 1 + i;
      const dateStr = this.formatDate(year, month - 1, day);
      cells.push({ date: dateStr, day, inMonth: false, hasRecord: false });
    }

    // 本月日期
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = this.formatDate(year, month, d);
      cells.push({
        date: dateStr,
        day: d,
        inMonth: true,
        hasRecord: false,
        sportLevel: 0
      });
    }

    // 下月补齐
    while (cells.length < 42) {
      const day = cells.length - (startWeek + daysInMonth) + 1;
      const dateStr = this.formatDate(year, month + 1, day);
      cells.push({ date: dateStr, day, inMonth: false, hasRecord: false });
    }

    this.setData({ days: cells });

    await this.loadMonthWeight(year, month);
    await this.loadMonthSport(year, month);
  },

  // 日期格式化
  formatDate(y, m, d) {
    if (m <= 0) {
      y -= 1;
      m = 12;
    }
    if (m >= 13) {
      y += 1;
      m = 1;
    }
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  },

  // -------------------------------------------------------
  // 加载体重记录
  // -------------------------------------------------------
  async loadMonthWeight(year, month) {
    const db = wx.cloud.database();
    const _ = db.command;
    const mStr = String(month).padStart(2, "0");

    const res = await db
      .collection("weights")
      .where({
        openid: app.globalData.openid,
        date: _.gte(`${year}-${mStr}-01`).and(_.lte(`${year}-${mStr}-31`))
      })
      .get();

    const weightMap = {};
    res.data.forEach(r => (weightMap[r.date] = r.weight));

    const days = this.data.days.map(d => {
      if (weightMap[d.date]) {
        d.hasRecord = true;
        d.weight = weightMap[d.date];
        d.pawColor = getPawColorByDate(d.date);
      }
      return d;
    });

    this.setData({ days });
  },

  // -------------------------------------------------------
  // 加载运动记录（runs）
  // -------------------------------------------------------
  async loadMonthSport(year, month) {
    const db = wx.cloud.database();
    const _ = db.command;
    const mStr = String(month).padStart(2, "0");

    const res = await db
      .collection("runs")
      .where({
        openid: app.globalData.openid,
        dateStr: _.gte(`${year}-${mStr}-01`).and(_.lte(`${year}-${mStr}-31`))
      })
      .get();

    const sportMap = {};
    res.data.forEach(run => {
      // 运动等级：自动计算
      let level = 0;
      const km = Number(run.distanceKm || 0);
      if (km >= 5) level = 3;
      else if (km >= 1) level = 2;
      else if (km > 0) level = 1;

      sportMap[run.dateStr] = { ...run, level };
    });

    const days = this.data.days.map(d => {
      if (sportMap[d.date]) {
        d.sportLevel = sportMap[d.date].level;
        d.sportIcon = getSportIcon(d.sportLevel);
        d.sportData = sportMap[d.date];
      }
      return d;
    });

    this.setData({ days });
  },

  // -------------------------------------------------------
  // 点击日历格
  // -------------------------------------------------------
  onDayTap(e) {
    const date = e.currentTarget.dataset.date;
    const item = this.data.days.find(d => d.date === date);

    this.setData({
      selectedDate: date,
      inputWeight: item.weight || "",
      inputNote: item.note || "",
      sportInfo: item.sportData || null
    });
  },

  // 输入
  onWeightInput(e) {
    this.setData({ inputWeight: e.detail.value });
  },
  onNoteInput(e) {
    this.setData({ inputNote: e.detail.value });
  },

  // 保存体重
  async onSaveRecord() {
    if (!this.data.selectedDate) {
      wx.showToast({ title: "请先选择日期", icon: "none" });
      return;
    }

    const db = wx.cloud.database();
    await db.collection("weights").doc(this.data.selectedDate + "_" + app.globalData.openid).set({
      data: {
        openid: app.globalData.openid,
        date: this.data.selectedDate,
        weight: Number(this.data.inputWeight || 0),
        note: this.data.inputNote || "",
        updatedAt: db.serverDate()
      }
    });

    wx.showToast({ title: "已保存", icon: "success" });

    // 刷新日历
    this.generateCalendar(this.data.currentYear, this.data.currentMonth);
  },

  // 上月
  prevMonth() {
    let y = this.data.currentYear;
    let m = this.data.currentMonth - 1;
    if (m <= 0) {
      y -= 1;
      m = 12;
    }
    this.setData({ currentYear: y, currentMonth: m });
    this.generateCalendar(y, m);
  },
// 返回按钮
goBack() {
  wx.navigateBack({ delta: 1 });
},
  // 下月
  nextMonth() {
    let y = this.data.currentYear;
    let m = this.data.currentMonth + 1;
    if (m >= 13) {
      y += 1;
      m = 1;
    }
    this.setData({ currentYear: y, currentMonth: m });
    this.generateCalendar(y, m);
  }
});
