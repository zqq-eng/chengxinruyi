// pages/adminSport/adminSport.js
// ✅ 本页使用“本地假数据”生成 50 个用户运动统计 + 可交互折线图（无需云数据库）
// ⚠️ 你原来的鼓励逻辑我保留了，但默认改为仅本地提示（不写库），避免你现在功能卡住

const db = wx.cloud ? wx.cloud.database() : null;

function pad2(n) { return String(n).padStart(2, "0"); }

function secToStr(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}`;
}

function formatDurationHuman(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}小时${m}分${s}秒`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

function dateToStr(d) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${y}-${m}-${dd}`;
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function randFloat(a, b, fix = 2) { return (Math.random() * (b - a) + a).toFixed(fix); }

function paceFrom(distanceKm, durationSec) {
  const dk = Math.max(0.01, Number(distanceKm) || 0.01);
  const secPerKm = durationSec / dk;
  const mm = Math.floor(secPerKm / 60);
  const ss = Math.floor(secPerKm % 60);
  return `${pad2(mm)}'${pad2(ss)}"`;
}

Page({
  data: {
    loading: true,

    // 汇总
    userStats: [],
    totalUsers: 0,
    totalRuns: 0,
    totalDistance: "0.00",
    totalDurationStr: "0秒",

    // 详情
    showDetail: false,
    detailUser: null,
    detailRuns: [],
    trendList: [],

    // 鼓励
    encourageModalVisible: false,
    encourageText: "",
    encourageTargetRun: null,

    // 图表
    chartType: "runs", // runs | duration
    chartDays: 14,
    chartLabels: [],
    chartValues: [],
    chartTooltip: null // { index, xLabel, valueText }
  },

  onShow() {
    this.loadSportStats();
  },

  onReady() {
    // 首次绘制（数据来了也会再画一次）
    this._drawTrendChart();
  },

  /* =========================
     ✅ 生成 50 个假的用户运动数据（包含指定姓名）
  ========================= */
  _generateMockData() {
    const mustNames = ["张芊芊", "吴欣雨", "陈佳", "马佳琪", "王雅宣"];

    const family = ["赵","钱","孙","李","周","吴","郑","王","冯","陈","褚","卫","蒋","沈","韩","杨","朱","秦","许","何","吕","施","张","孔","曹","严","华","金","魏","陶","姜","戚","谢","邹","喻","柏","水","窦","章","云","苏","潘","葛","奚","范","彭","郎"];
    const given = ["子涵","欣怡","思雨","语彤","若曦","梓萱","雨桐","可欣","佳怡","诗涵","梦琪","依诺","静怡","雨欣","欣妍","婉清","晨曦","雅宣","佳琪","芊芊","欣雨","佳","雨晴","书瑶","梓涵","亦菲","沐晴","语嫣","昕怡","诗琪","一诺","予安","清欢","南栀","念安","星辰","子墨","予希","嘉禾","子衿","明玥"];

    // 生成随机不重复姓名
    const nameSet = new Set(mustNames);
    while (nameSet.size < 50) {
      const n = family[randInt(0, family.length - 1)] + given[randInt(0, given.length - 1)];
      nameSet.add(n);
    }
    const names = Array.from(nameSet);

    // 生成 50 用户
    const users = names.map((name, idx) => {
      const i = idx + 1;
      return {
        openid: `mock_openid_${pad2(i)}_${randInt(1000, 9999)}`,
        account: `2026${pad2(randInt(10, 99))}${pad2(randInt(10, 99))}${pad2(i)}`, // 类似账号
        name
      };
    });

    // 生成每个用户的跑步记录
    const runsByOpenid = {}; // oid -> runs[]
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    // 最近 30 天范围
    const daysRange = 30;

    users.forEach(u => {
      const runCount = randInt(6, 40); // 每人 6~40 条
      const runs = [];

      for (let k = 0; k < runCount; k++) {
        const backDays = randInt(0, daysRange - 1);
        const d = new Date(today.getTime() - backDays * 24 * 3600 * 1000);

        // 距离 1.0 ~ 12.0km
        const distanceKm = Number(randFloat(1.0, 12.0, 2));
        // 配速大约 4'30" ~ 9'00" => 秒/公里 270~540
        const secPerKm = randInt(270, 540);
        const durationSec = Math.floor(distanceKm * secPerKm);

        const avgSpeedKmh = (distanceKm / (durationSec / 3600));
        const lastSpeedKmh = avgSpeedKmh * (randInt(90, 110) / 100);

        runs.push({
          _id: `mock_run_${u.openid}_${k}_${randInt(10000, 99999)}`,
          _openid: u.openid,
          type: "run",
          dateStr: dateToStr(d),
          distanceKm: distanceKm.toFixed(2),
          duration: durationSec,
          durationStr: secToStr(durationSec),
          paceStr: paceFrom(distanceKm, durationSec),
          movingPaceStr: paceFrom(distanceKm, Math.floor(durationSec * randInt(92, 100) / 100)),
          avgSpeedKmh: avgSpeedKmh.toFixed(1),
          lastSpeedKmh: lastSpeedKmh.toFixed(1)
        });
      }

      // 按日期倒序
      runs.sort((a, b) => (b.dateStr > a.dateStr ? 1 : -1));
      runsByOpenid[u.openid] = runs;
    });

    return { users, runsByOpenid };
  },

  _num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  },

  _buildUserStats(mock) {
    const { users, runsByOpenid } = mock;

    let totalRuns = 0;
    let totalDistance = 0;
    let totalDurationSec = 0;

    const userStats = users.map(u => {
      const runs = runsByOpenid[u.openid] || [];
      const cnt = runs.length;

      let dist = 0;
      let dur = 0;

      runs.forEach(r => {
        dist += this._num(r.distanceKm);
        dur += this._num(r.duration);
      });

      totalRuns += cnt;
      totalDistance += dist;
      totalDurationSec += dur;

      return {
        openid: u.openid,
        account: u.account,
        name: u.name,
        runCount: cnt,
        totalDistance: dist.toFixed(2),
        totalDurationSec: dur,
        totalDurationStr: formatDurationHuman(dur),
        avgDistance: cnt ? (dist / cnt).toFixed(2) : "0.00"
      };
    });

    // 排序：次数 desc，其次里程 desc
    userStats.sort((a, b) => (b.runCount - a.runCount) || (Number(b.totalDistance) - Number(a.totalDistance)));

    return {
      userStats,
      totalUsers: userStats.length,
      totalRuns,
      totalDistance: totalDistance.toFixed(2),
      totalDurationSec,
      totalDurationStr: formatDurationHuman(totalDurationSec)
    };
  },

  _buildChartSeries(mock, days = 14, type = "runs") {
    const { runsByOpenid } = mock;
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    // labels: 从旧到新
    const labels = [];
    const statMap = {}; // dateStr -> {runs, durationSec}

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 24 * 3600 * 1000);
      const ds = dateToStr(d);
      labels.push(ds.slice(5)); // MM-DD 更紧凑
      statMap[ds] = { runs: 0, durationSec: 0 };
    }

    Object.keys(runsByOpenid).forEach(oid => {
      (runsByOpenid[oid] || []).forEach(r => {
        const ds = r.dateStr;
        if (statMap[ds]) {
          statMap[ds].runs += 1;
          statMap[ds].durationSec += this._num(r.duration);
        }
      });
    });

    const values = Object.keys(statMap).map(ds => {
      const v = statMap[ds];
      if (type === "duration") {
        // 用“分钟”显示更直观
        return Math.round((v.durationSec || 0) / 60);
      }
      return v.runs || 0;
    });

    return { labels, values };
  },

  /* =========================
     ✅ 主入口：加载统计（这里用本地假数据）
  ========================= */
  async loadSportStats() {
    this.setData({ loading: true });

    try {
      // 1) 生成假数据
      const mock = this._generateMockData();
      this._mock = mock; // 缓存到实例上，详情/图表用

      // 2) 生成表格统计
      const summary = this._buildUserStats(mock);

      // 3) 生成图表数据
      const { labels, values } = this._buildChartSeries(mock, this.data.chartDays, this.data.chartType);

      this.setData({
        loading: false,
        userStats: summary.userStats,
        totalUsers: summary.totalUsers,
        totalRuns: summary.totalRuns,
        totalDistance: summary.totalDistance,
        totalDurationStr: summary.totalDurationStr,
        chartLabels: labels,
        chartValues: values,
        chartTooltip: null
      });

      // 4) 画图
      this._drawTrendChart();
    } catch (e) {
      console.error("加载运动统计失败", e);
      this.setData({ loading: false });
      wx.showToast({ title: "运动统计加载失败", icon: "none" });
    }
  },

  /* =========================
     ✅ 点击某用户：显示详情（从 mockRuns 取）
  ========================= */
  async onRowTap(e) {
    const oid = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.openid) || "";
    if (!oid) return wx.showToast({ title: "缺少用户标识", icon: "none" });

    try {
      wx.showLoading({ title: "加载详情..." });

      const u = this.data.userStats.find(x => x.openid === oid) || { openid: oid, name: "用户" };

      const detail = (this._mock && this._mock.runsByOpenid && this._mock.runsByOpenid[oid]) ? this._mock.runsByOpenid[oid] : [];
      const detailRuns = (detail || []).map(r => ({
        _id: r._id,
        dateStr: r.dateStr,
        distanceKm: r.distanceKm,
        duration: r.duration,
        durationStr: r.durationStr,
        paceStr: r.paceStr,
        movingPaceStr: r.movingPaceStr,
        avgSpeedKmh: r.avgSpeedKmh,
        lastSpeedKmh: r.lastSpeedKmh
      }));

      const last10 = detailRuns.slice(0, 10).slice().reverse();
      const trendList = last10.map(r => ({
        dateStr: r.dateStr || "",
        distanceKm: r.distanceKm || "0.00",
        durationStr: r.durationStr || "",
        paceStr: r.paceStr || "--'--\""
      }));

      this.setData({
        showDetail: true,
        detailUser: u,
        detailRuns,
        trendList,
        encourageModalVisible: false,
        encourageText: "",
        encourageTargetRun: null
      });

      wx.hideLoading();
    } catch (err) {
      console.error("加载用户运动详情失败", err);
      wx.hideLoading();
      wx.showToast({ title: "详情加载失败", icon: "none" });
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

  stopTap() {},

  /* =========================
     ✅ 鼓励（保留 UI/逻辑，但默认仅本地提示）
  ========================= */
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

  onEncourageInput(e) {
    this.setData({ encourageText: e.detail.value });
  },

  cancelEncourage() {
    this.setData({
      encourageModalVisible: false,
      encourageText: "",
      encourageTargetRun: null
    });
  },

  async submitEncourage() {
    const text = (this.data.encourageText || "").trim();
    const run = this.data.encourageTargetRun;
    const detailUser = this.data.detailUser || {};

    if (!run) return wx.showToast({ title: "没有选中记录", icon: "none" });
    if (!text) return wx.showToast({ title: "请先写几句鼓励的话~", icon: "none" });

    // ✅ 你说现在不需要修复，所以这里默认仅做“本地成功提示”
    // 如果你后面想恢复写库：把下面 return 改成你原来的 db.collection("encourages").add(...)
    wx.showToast({ title: "已发送鼓励（模拟）", icon: "success" });
    this.setData({ encourageModalVisible: false, encourageText: "", encourageTargetRun: null });
  },

  /* =========================
     ✅ 图表：切换类型
  ========================= */
  switchChartType(e) {
    const t = (e.currentTarget.dataset && e.currentTarget.dataset.type) || "runs";
    if (t === this.data.chartType) return;

    const mock = this._mock;
    const { labels, values } = this._buildChartSeries(mock, this.data.chartDays, t);

    this.setData({
      chartType: t,
      chartLabels: labels,
      chartValues: values,
      chartTooltip: null
    });

    this._drawTrendChart();
  },

  /* =========================
     ✅ 图表：绘制折线图（可触摸 tooltip）
  ========================= */
  _drawTrendChart(highlightIndex = -1) {
    const labels = this.data.chartLabels || [];
    const values = this.data.chartValues || [];
    const tooltip = this.data.chartTooltip;

    // 没数据就清空
    const ctx = wx.createCanvasContext("trendCanvas", this);
    ctx.clearRect(0, 0, 9999, 9999);

    // 获取容器尺寸（给一个稳妥默认值）
    const W = 330; // 逻辑宽（wx canvas 会按 css 缩放）
    const H = 200;

    // 背景
    ctx.save();
    ctx.setFillStyle("rgba(255,255,255,0.95)");
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    if (!labels.length || !values.length) {
      ctx.setFillStyle("rgba(15,23,42,0.45)");
      ctx.setFontSize(12);
      ctx.fillText("暂无图表数据", 12, 24);
      ctx.draw();
      return;
    }

    const padL = 36;
    const padR = 12;
    const padT = 18;
    const padB = 28;

    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const maxV = Math.max(...values, 1);
    const minV = Math.min(...values, 0);
    const span = Math.max(1, maxV - minV);

    // 坐标轴
    ctx.setStrokeStyle("rgba(15,23,42,0.10)");
    ctx.setLineWidth(1);

    // y轴
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.stroke();

    // x轴
    ctx.beginPath();
    ctx.moveTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    // y刻度（3条）
    ctx.setFillStyle("rgba(15,23,42,0.45)");
    ctx.setFontSize(10);
    for (let i = 0; i <= 3; i++) {
      const y = padT + (plotH * i / 3);
      ctx.setStrokeStyle("rgba(15,23,42,0.06)");
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();

      const v = Math.round(maxV - (span * i / 3));
      ctx.fillText(String(v), 6, y + 3);
    }

    // 点坐标
    const n = values.length;
    const pts = values.map((v, i) => {
      const x = padL + (plotW * (n === 1 ? 0 : (i / (n - 1))));
      const y = padT + plotH - ((v - minV) / span) * plotH;
      return { x, y, v };
    });

    // 折线
    ctx.setStrokeStyle("rgba(37,99,235,0.85)");
    ctx.setLineWidth(2);
    ctx.beginPath();
    pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // 点
    pts.forEach((p, i) => {
      ctx.beginPath();
      const isHi = (i === highlightIndex) || (tooltip && tooltip.index === i);
      ctx.setFillStyle(isHi ? "rgba(34,197,94,0.95)" : "rgba(37,99,235,0.85)");
      ctx.arc(p.x, p.y, isHi ? 3.6 : 2.6, 0, Math.PI * 2);
      ctx.fill();
    });

    // x轴标签：每隔 2 个标一次
    ctx.setFillStyle("rgba(15,23,42,0.45)");
    ctx.setFontSize(10);
    for (let i = 0; i < labels.length; i++) {
      if (i % 2 !== 0 && i !== labels.length - 1) continue;
      const p = pts[i];
      const tx = clamp(p.x - 10, 0, W - 24);
      ctx.fillText(labels[i], tx, padT + plotH + 18);
    }

    // tooltip
    if (tooltip && tooltip.index >= 0) {
      const i = tooltip.index;
      const p = pts[i];
      const boxW = 140;
      const boxH = 44;
      let bx = p.x - boxW / 2;
      bx = clamp(bx, 6, W - boxW - 6);
      let by = p.y - boxH - 10;
      if (by < 6) by = p.y + 10;

      ctx.setFillStyle("rgba(15,23,42,0.80)");
      ctx.fillRect(bx, by, boxW, boxH);

      ctx.setFillStyle("#ffffff");
      ctx.setFontSize(11);
      ctx.fillText(tooltip.xLabel, bx + 10, by + 18);
      ctx.setFontSize(12);
      ctx.fillText(tooltip.valueText, bx + 10, by + 36);

      // 指示线
      ctx.setStrokeStyle("rgba(15,23,42,0.20)");
      ctx.setLineWidth(1);
      ctx.beginPath();
      ctx.moveTo(p.x, padT);
      ctx.lineTo(p.x, padT + plotH);
      ctx.stroke();
    }

    // 标题右上角单位提示
    ctx.setFillStyle("rgba(15,23,42,0.38)");
    ctx.setFontSize(10);
    const unit = this.data.chartType === "duration" ? "单位：分钟" : "单位：次数";
    ctx.fillText(unit, W - 78, 14);

    ctx.draw();
  },

  onChartTouch(e) {
    const touches = e.touches || [];
    if (!touches.length) return;

    const x = touches[0].x; // canvas 内坐标
    // 由于我们用固定逻辑宽 W=330，直接按比例映射
    // 但在小程序里 canvas 触点坐标已经是 canvas 内坐标（通常可用）
    const labels = this.data.chartLabels || [];
    const values = this.data.chartValues || [];
    if (!labels.length || !values.length) return;

    // 计算离哪个点最近
    const W = 330;
    const padL = 36;
    const padR = 12;
    const plotW = W - padL - padR;

    const n = values.length;
    const rx = clamp(x, padL, padL + plotW);
    const idxFloat = (n === 1) ? 0 : ((rx - padL) / plotW) * (n - 1);
    const idx = clamp(Math.round(idxFloat), 0, n - 1);

    const label = labels[idx];
    const v = values[idx];

    const valueText = (this.data.chartType === "duration")
      ? `总时长：${v} 分钟`
      : `总次数：${v} 次`;

    this.setData({
      chartTooltip: {
        index: idx,
        xLabel: `日期：${label}`,
        valueText
      }
    });

    this._drawTrendChart(idx);
  },

  clearChartTooltip() {
    if (!this.data.chartTooltip) return;
    this.setData({ chartTooltip: null });
    this._drawTrendChart(-1);
  },
  /* =========================
     ✅ CSV 导出（汇总 + 明细）
     - 汇总：50人表格（姓名/账号/次数/总里程/总时长/平均）
     - 明细：所有跑步记录逐条导出（姓名/账号/日期/距离/时长/配速…）
  ========================= */

  _csvEscape(v) {
    // 兼容逗号、换行、双引号
    let s = String(v ?? "");
    s = s.replace(/"/g, '""');
    if (/[",\n\r]/.test(s)) s = `"${s}"`;
    return s;
  },

  _toCSV(rows) {
    // rows: string[][]
    return rows.map(r => r.map(x => this._csvEscape(x)).join(",")).join("\n");
  },

  _writeAndOpenCSV(fileName, csvText) {
    return new Promise((resolve, reject) => {
      const fs = wx.getFileSystemManager();
      const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;

      fs.writeFile({
        filePath,
        data: "\ufeff" + csvText, // ✅ BOM，Excel 打开中文不乱码
        encoding: "utf8",
        success: () => {
          wx.openDocument({
            filePath,
            fileType: "csv",
            showMenu: true, // ✅ 右上角可“转发/用其他应用打开”
            success: () => resolve(filePath),
            fail: (e) => {
              // 某些机型 openDocument 对 csv 支持不一致：至少保存成功
              wx.showToast({ title: "已导出到本地文件，可在文件管理中查看", icon: "none" });
              resolve(filePath);
            }
          });
        },
        fail: (err) => reject(err)
      });
    });
  },

  // ✅ 导出：按用户统计（50人汇总表）
  async exportSummaryCSV() {
    try {
      const list = this.data.userStats || [];
      if (!list.length) return wx.showToast({ title: "没有可导出的数据", icon: "none" });

      const rows = [];
      rows.push(["姓名", "账号", "运动次数", "累计里程(km)", "总运动时长", "平均每次(km)"]);

      list.forEach(u => {
        rows.push([
          u.name || "",
          u.account || "",
          u.runCount ?? 0,
          u.totalDistance ?? "0.00",
          u.totalDurationStr || "",
          u.avgDistance ?? "0.00"
        ]);
      });

      // 可选：最后一行加总览
      rows.push([]);
      rows.push(["总览", "", `参与总用户=${this.data.totalUsers}`, `总里程=${this.data.totalDistance}km`, `总时长=${this.data.totalDurationStr}`, `总次数=${this.data.totalRuns}`]);

      const csv = this._toCSV(rows);
      const fileName = `运动统计_汇总_${Date.now()}.csv`;
      await this._writeAndOpenCSV(fileName, csv);

      wx.showToast({ title: "汇总已导出", icon: "success" });
    } catch (e) {
      console.error("exportSummaryCSV error", e);
      wx.showToast({ title: "导出失败", icon: "none" });
    }
  },

  // ✅ 导出：所有运动明细（每条跑步记录一行）
  async exportAllRunsCSV() {
    try {
      const mock = this._mock;
      if (!mock || !mock.runsByOpenid) return wx.showToast({ title: "暂无明细数据", icon: "none" });

      const users = (mock.users || []);
      const userMap = {};
      users.forEach(u => { userMap[u.openid] = u; });

      const rows = [];
      rows.push(["姓名", "账号", "日期", "距离(km)", "用时", "配速", "移动配速", "均速(km/h)", "末速(km/h)"]);

      let totalLines = 0;

      Object.keys(mock.runsByOpenid).forEach(oid => {
        const u = userMap[oid] || { name: "", account: "" };
        const runs = mock.runsByOpenid[oid] || [];
        runs.forEach(r => {
          rows.push([
            u.name || "",
            u.account || "",
            r.dateStr || "",
            r.distanceKm || "0.00",
            r.durationStr || "",
            r.paceStr || "",
            r.movingPaceStr || "",
            r.avgSpeedKmh || "",
            r.lastSpeedKmh || ""
          ]);
          totalLines++;
        });
      });

      if (totalLines === 0) return wx.showToast({ title: "没有可导出的明细", icon: "none" });

      const csv = this._toCSV(rows);
      const fileName = `运动统计_明细_${Date.now()}.csv`;
      await this._writeAndOpenCSV(fileName, csv);

      wx.showToast({ title: "明细已导出", icon: "success" });
    } catch (e) {
      console.error("exportAllRunsCSV error", e);
      wx.showToast({ title: "导出失败", icon: "none" });
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  }
}); 
