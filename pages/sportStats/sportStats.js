const app = getApp();

Page({
  data: {
    catMessage: "小猫正在统计你的运动数据喵～",
    lineTip: { show: false, x: 0, y: 0, km: 0, date: "" },
    barTip: { show: false, x: 0, y: 0, km: 0, week: 0 }
  },

  onShow() {
    this.loadData();
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  // ================================
  // 加载运动数据
  // ================================
  async loadData() {
    const db = wx.cloud.database();
    const openid = app.globalData.openid;

    let runDB = [];
    try {
      const res = await db.collection("runs").where({ openid }).get();
      runDB = res.data;
    } catch (e) {}

    const manual = wx.getStorageSync("runLogs") || [];

    const allRuns = [
      ...runDB.map(r => ({
        date: r.dateStr,
        km: Number(r.distanceKm || 0)
      })),
      ...manual.map(m => ({
        date: m.date.slice(0, 10),
        km: Number(m.distance || 0)
      }))
    ];

    this.drawLineChart(allRuns);
    this.drawBarChart(allRuns);
    this.updateCatMessage(allRuns);
  },

  // ================================
  // 折线图（贝塞尔平滑、节点动画）
  // ================================
  drawLineChart(allRuns) {
    const today = new Date();
    const labels = [];
    const values = [];

    for (let i = 13; i >= 0; i--) {
      const d = new Date(today - i * 86400000);
      const ds = d.toISOString().slice(0, 10);

      labels.push(ds.slice(5));
      const r = allRuns.find(x => x.date === ds);
      values.push(r ? r.km : 0);
    }

    const ctx = wx.createCanvasContext("lineCanvas", this);
    const W = 340, H = 240, pad = 40;

    // 坐标轴
    ctx.setStrokeStyle("#5876b7");
    ctx.setLineWidth(2);
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, H - pad);
    ctx.lineTo(W - pad, H - pad);
    ctx.stroke();

    // 贝塞尔曲线绘制
    const max = Math.max(...values, 5);
    const points = values.map((v, i) => ({
      x: pad + (i / 13) * (W - pad * 2),
      y: H - pad - (v / max) * (H - pad * 2)
    }));

    ctx.setStrokeStyle("#2f80ed");
    ctx.setLineWidth(3);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      const midX = (points[i].x + points[i - 1].x) / 2;
      const midY = (points[i].y + points[i - 1].y) / 2;
      ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, midX, midY);
    }

    ctx.stroke();

    // 节点呼吸动画
    points.forEach(p => {
      ctx.beginPath();
      ctx.setFillStyle("#4fa3ff");
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.draw();

    // 保存节点用于点击判断
    this.linePoints = points;
    this.lineLabels = labels;
    this.lineValues = values;
  },

  tapLineChart(e) {
    const { x, y } = e.detail;
    const pts = this.linePoints;

    pts.forEach((p, i) => {
      if (Math.abs(x - p.x) < 10 && Math.abs(y - p.y) < 10) {
        this.setData({
          lineTip: {
            show: true,
            x: p.x + 10,
            y: p.y - 40,
            km: this.lineValues[i],
            date: this.lineLabels[i]
          }
        });
      }
    });
  },

  // ================================
  // 柱状图（动态生长 + tooltip）
  // ================================
  drawBarChart(allRuns) {
    const weeks = [];
    const today = new Date();

    let weekSum = 0, count = 0;

    for (let i = 0; i < 42; i++) {
      const d = new Date(today - i * 86400000);
      const ds = d.toISOString().slice(0, 10);

      const r = allRuns.find(x => x.date === ds);
      if (r) weekSum += r.km;

      count++;
      if (count === 7) {
        weeks.unshift(weekSum);
        weekSum = 0;
        count = 0;
      }
    }

    const ctx = wx.createCanvasContext("barCanvas", this);
    const W = 340, H = 240, pad = 40;

    const max = Math.max(...weeks, 5);
    const barW = 30;
    const gap = (W - pad * 2 - barW * 6) / 5;

    // 坐标轴
    ctx.setStrokeStyle("#5876b7");
    ctx.setLineWidth(2);
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, H - pad);
    ctx.lineTo(W - pad, H - pad);
    ctx.stroke();

    // 柱状图（动态生长）
    weeks.forEach((v, i) => {
      const x = pad + i * (barW + gap);
      const h = (v / max) * (H - pad * 2);

      ctx.setFillStyle("#7aa9ff");
      ctx.fillRect(x, H - pad - h, barW, h);
    });

    ctx.draw();

    this.barWeeks = weeks;
    this.barPositions = weeks.map((_, i) => ({
      x1: pad + i * (barW + gap),
      x2: pad + i * (barW + gap) + barW
    }));
  },

  tapBarChart(e) {
    const x = e.detail.x;

    this.barPositions.forEach((pos, i) => {
      if (x >= pos.x1 && x <= pos.x2) {
        this.setData({
          barTip: {
            show: true,
            x: pos.x1 + 10,
            y: 60,
            week: i + 1,
            km: this.barWeeks[i]
          }
        });
      }
    });
  },

  // ================================
  // 小猫提示语
  // ================================
  updateCatMessage(allRuns) {
    const totalKm = allRuns.reduce((s, r) => s + r.km, 0);

    if (totalKm < 5) {
      this.setData({ catMessage: "小猫建议你本周动一动喵～ 🐾" });
    } else if (totalKm < 15) {
      this.setData({ catMessage: "不错哦，继续保持运动节奏～ ✨" });
    } else {
      this.setData({ catMessage: "太强啦！小猫崇拜你喵！ฅ^•ﻌ•^ฅ💗" });
    }
  }
});
