// pages/xxx/xxx.js（按你给的原文件直接“完整最终版”替换）
// ✅ 目标：三张折线图支持滑动/点击某个点显示具体数据（tooltip），不卡顿；并增加高光动态折线动画
// ✅ 其他功能不动；原数据加载逻辑不动；只在“折线图绘制”这一块做增强

const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

function pad2(n) { return String(n).padStart(2, "0"); }

function toDateStr(d) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${y}-${m}-${dd}`;
}

function secToHHMMSS(totalSec) {
  totalSec = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}`;
}

function paceFrom(totalSec, totalKm) {
  const sec = Number(totalSec) || 0;
  const km = Number(totalKm) || 0;
  if (!sec || !km) return "--'--\"";
  const paceSecPerKm = sec / km;
  const mm = Math.floor(paceSecPerKm / 60);
  const ss = Math.round(paceSecPerKm % 60);
  return `${pad2(mm)}'${pad2(ss)}"`;
}

// 用于折线图：把某天映射到月内第几天
function buildMonthDays(y, mIndex) {
  const start = new Date(y, mIndex, 1);
  const end = new Date(y, mIndex + 1, 1);
  const days = [];
  for (let d = new Date(start); d < end; d = new Date(d.getTime() + 86400000)) {
    days.push(toDateStr(d));
  }
  return days;
}

Page({
  data: {
    monthLabel: "",

    // 月报概览
    runCount: 0,
    totalDistanceKm: "0.00",
    totalDurationStr: "00:00",
    avgPaceStr: "--'--\"",

    // 体重变化
    firstWeight: "--",
    lastWeight: "--",
    weightDelta: "--",
    deltaArrow: "",
    deltaClass: "delta-flat",
    weightTips: "",

    // ✅ 运动趋势：圆形卡片 + 弹层三张折线图
    trendPopupVisible: false,
    trendMonthDays: [],     // ["2026-02-01", ...]
    trendLabels: [],        // ["01","02",...]
    trendCountList: [],     // [0,1,2,...]
    trendDistList: [],      // [0.0, 1.2, ...] km
    trendDurList: [],       // [0, 35, ...] minutes
    maxCount: 1,
    maxDist: 1,
    maxDur: 1
  },

  // =========================
  // ✅（新增）图表交互&动画：内部状态（不放 data，避免 setData 造成卡顿）
  // =========================
  _charts: null,            // { [canvasId]: chartState }
  _touchTimer: null,        // 节流用
  _pendingTouch: null,      // 最新触摸事件缓存

  onShow() {
    this.loadMonthlyReport();
  },

  onHide() {
    this._stopAllChartAnims();
  },

  onUnload() {
    this._stopAllChartAnims();
  },

  async ensureOpenid() {
    if (app.globalData.openid) return;
    const r = await wx.cloud.callFunction({ name: "login" });
    const openid = r && r.result && r.result.openid;
    if (!openid) throw new Error("login 云函数未返回 openid");
    app.globalData.openid = openid;
  },

  async loadMonthlyReport() {
    wx.showLoading({ title: "生成月报中...", mask: true });

    try {
      await this.ensureOpenid();
      const openid = app.globalData.openid;

      const now = new Date();
      const y = now.getFullYear();
      const mIndex = now.getMonth(); // 0-11

      const start = new Date(y, mIndex, 1);
      const end = new Date(y, mIndex + 1, 1);

      const startStr = toDateStr(start);
      const endStr = toDateStr(new Date(end.getTime() - 86400000)); // 月末

      this.setData({
        monthLabel: `${y}年${mIndex + 1}月（${startStr} ~ ${endStr}）`
      });

      // ✅ 1) 运动数据：优先 sport_daily（按天），没有则 fallback workout_checkins 聚合
      const daily = await this._loadMonthlySportDaily(openid, startStr, endStr);

      // 月累计
      let totalSec = 0;
      let totalKm = 0;
      let runCount = 0;

      daily.forEach(d => {
        runCount += Number(d.count) || 0;
        totalKm += Number(d.distanceKm) || 0;
        totalSec += Number(d.durationSec) || 0;
      });

      this.setData({
        runCount,
        totalDistanceKm: totalKm.toFixed(2),
        totalDurationStr: secToHHMMSS(totalSec),
        avgPaceStr: paceFrom(totalSec, totalKm)
      });

      // ✅ 2) 体重数据：严格按 record.js 日历的 weights 集合（date 字段）
      const weights = await this._loadMonthlyWeightsFromRecord(openid, startStr, endStr);

      let firstWeight = "--";
      let lastWeight = "--";
      let weightDelta = "--";
      let deltaArrow = "";
      let deltaClass = "delta-flat";
      let weightTips = "";

      if (weights.length >= 1) {
        firstWeight = weights[0].weight.toFixed(1);
        lastWeight = weights[weights.length - 1].weight.toFixed(1);
        const delta = (weights[weights.length - 1].weight - weights[0].weight);

        weightDelta = (delta >= 0 ? "+" : "") + delta.toFixed(1) + " kg";

        if (delta > 0.05) {
          deltaArrow = "↑";
          deltaClass = "delta-up";
          weightTips = "本月体重略有上升，可结合运动与饮食结构做小幅调整。";
        } else if (delta < -0.05) {
          deltaArrow = "↓";
          deltaClass = "delta-down";
          weightTips = "本月体重有所下降，坚持规律作息与稳定运动很关键。";
        } else {
          deltaArrow = "→";
          deltaClass = "delta-flat";
          weightTips = "本月体重整体平稳，继续保持健康节奏～";
        }
      } else {
        weightTips = "本月暂无体重记录（可在日历记录体重后自动生成）。";
      }

      this.setData({
        firstWeight,
        lastWeight,
        weightDelta,
        deltaArrow,
        deltaClass,
        weightTips
      });

      // ✅ 3) 生成折线图数据（按月天数）
      const monthDays = buildMonthDays(y, mIndex); // ["YYYY-MM-01"...]
      const dailyMap = {};
      daily.forEach(d => { dailyMap[d.dateStr] = d; });

      const labels = monthDays.map(ds => ds.slice(8)); // "01".."31"
      const countList = monthDays.map(ds => Number((dailyMap[ds] && dailyMap[ds].count) || 0));
      const distList = monthDays.map(ds => Number((dailyMap[ds] && dailyMap[ds].distanceKm) || 0));
      const durList = monthDays.map(ds => Math.round(Number((dailyMap[ds] && dailyMap[ds].durationSec) || 0) / 60));

      this.setData({
        trendMonthDays: monthDays,
        trendLabels: labels,
        trendCountList: countList,
        trendDistList: distList,
        trendDurList: durList,
        maxCount: Math.max(...countList, 1),
        maxDist: Math.max(...distList, 1),
        maxDur: Math.max(...durList, 1)
      });

    } catch (e) {
      console.error(e);
      wx.showToast({ title: "生成月报失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  // =========================
  // ✅ 月报运动按天数据：优先 sport_daily；fallback workout_checkins 聚合
  // 返回结构：
  // [{dateStr, count, distanceKm, durationSec}]
  // =========================
  async _loadMonthlySportDaily(openid, startStr, endStr) {
    // 1) sport_daily（你前面跑步保存时已经按天写入）
    try {
      const res = await db.collection("sport_daily")
        .where({
          openid,
          dateStr: _.gte(startStr).and(_.lte(endStr))
        })
        .orderBy("dateStr", "asc")
        .limit(200)
        .get();

      const arr = res.data || [];
      if (arr.length) {
        return arr.map(day => {
          const runs = Array.isArray(day.runs) ? day.runs : [];
          let sec = 0;
          runs.forEach(r => { sec += Number(r.duration) || 0; }); // duration 是秒
          // 如果 runs 没存 duration，就用 totalMinutes * 60 兜底
          if (!sec) sec = (Number(day.totalMinutes) || 0) * 60;

          return {
            dateStr: day.dateStr,
            count: Number(day.runCount) || runs.length || 0,
            distanceKm: Number(day.totalDistanceKm) || 0,
            durationSec: sec
          };
        });
      }
    } catch (e) {
      // 没集合/没权限/没数据：继续 fallback
    }

    // 2) fallback：workout_checkins（type=run）按天聚合
    const res2 = await db.collection("workout_checkins")
      .where({
        openid,
        type: "run",
        dateStr: _.gte(startStr).and(_.lte(endStr))
      })
      .orderBy("dateStr", "asc")
      .limit(500)
      .get();

    const list = res2.data || [];
    const map = {};
    list.forEach(r => {
      const ds = r.dateStr;
      if (!ds) return;
      if (!map[ds]) map[ds] = { dateStr: ds, count: 0, distanceKm: 0, durationSec: 0 };
      map[ds].count += 1;
      map[ds].distanceKm += Number(r.distanceKm || (Number(r.distance) / 1000) || 0);
      map[ds].durationSec += Number(r.duration) || 0;
    });

    return Object.values(map).sort((a, b) => (a.dateStr > b.dateStr ? 1 : -1));
  },

  // =========================
  // ✅ 体重读取：严格对应 record.js 的 weights 集合
  // record.js 里字段是：
  // - openid
  // - date: "YYYY-MM-DD"
  // - weight: number
  // =========================
  async _loadMonthlyWeightsFromRecord(openid, startStr, endStr) {
    try {
      const res = await db.collection("weights")
        .where({
          openid,
          date: _.gte(startStr).and(_.lte(endStr))
        })
        .orderBy("date", "asc")
        .limit(200)
        .get();

      return (res.data || [])
        .map(x => ({ dateStr: x.date, weight: Number(x.weight) }))
        .filter(x => x.dateStr && !isNaN(x.weight));
    } catch (e) {
      return [];
    }
  },

  // =========================
  // ✅ 圆形卡片：打开趋势弹层并绘图
  // =========================
  openTrendPopup() {
    if (!this.data.trendMonthDays.length) {
      wx.showToast({ title: "本月暂无运动数据", icon: "none" });
      return;
    }

    // 打开弹层前先停掉旧动画，防止多次打开叠加导致卡顿
    this._stopAllChartAnims();
    this._charts = {}; // 重建缓存

    this.setData({ trendPopupVisible: true }, () => {
      // 延迟确保 canvas 渲染完
      setTimeout(() => {
        // ✅ 三张图：动画 + 可点选提示
        this.drawLineChart("cCount", this.data.trendCountList, this.data.maxCount, "次数", { animate: true });
        this.drawLineChart("cDist", this.data.trendDistList, this.data.maxDist, "km", { animate: true });
        this.drawLineChart("cDur", this.data.trendDurList, this.data.maxDur, "min", { animate: true });
      }, 60);
    });
  },

  closeTrendPopup() {
    this._stopAllChartAnims();
    this.setData({ trendPopupVisible: false });
  },

  // =========================
  // ✅（新增）Canvas 触摸：点击/滑动显示点数据（tooltip）
  // 你后续给 wxml 的 canvas 加：
  // bindtouchstart="onChartTouchStart"
  // bindtouchmove="onChartTouchMove"
  // bindtouchend="onChartTouchEnd"
  // data-cid="cCount" / "cDist" / "cDur"
  // =========================
  onChartTouchStart(e) { this._handleChartTouch(e); },
  onChartTouchMove(e) { this._handleChartTouch(e); },
  onChartTouchEnd(e)  { /* 松手不清空，保持选中更好看；如需清空可在这里调用 this._clearChartSelection */ },

  _handleChartTouch(e) {
    if (!e || !e.currentTarget || !e.currentTarget.dataset) return;
    const canvasId = e.currentTarget.dataset.cid;
    const chart = this._charts && this._charts[canvasId];
    if (!chart) return;

    // 触摸点（兼容 touches / changedTouches）
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!t) return;

    // 节流：同一帧只处理一次，避免 move 时频繁 draw 卡顿
    this._pendingTouch = { canvasId, x: t.x, y: t.y };
    if (this._touchTimer) return;

    this._touchTimer = setTimeout(() => {
      this._touchTimer = null;
      const p = this._pendingTouch;
      this._pendingTouch = null;
      if (!p) return;
      this._selectNearestPoint(p.canvasId, p.x, p.y);
    }, 16);
  },

  _selectNearestPoint(canvasId, x, y) {
    const chart = this._charts && this._charts[canvasId];
    if (!chart || !chart.points || !chart.points.length) return;

    // 只在绘图区附近响应（否则误触）
    const { padL, padR, padT, padB, W, H } = chart;
    const inX = x >= padL - 10 && x <= (W - padR + 10);
    const inY = y >= padT - 10 && y <= (H - padB + 10);
    if (!inX || !inY) return;

    // 找最近点（只按 x 就够快；再算距离更准）
    let best = -1;
    let bestDist2 = Infinity;
    for (let i = 0; i < chart.points.length; i++) {
      const p = chart.points[i];
      const dx = p.x - x;
      const dy = p.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist2) {
        bestDist2 = d2;
        best = i;
      }
    }

    // 命中半径：稍微大一点更好点
    const hitR = 14; // px
    if (best >= 0 && bestDist2 <= hitR * hitR) {
      if (chart.selectedIndex !== best) {
        chart.selectedIndex = best;
        // 立即重绘（无 setData）
        this._renderChart(chart, { progress: 1, drawTooltip: true });
      } else {
        // 已选中：只更新 tooltip（避免不必要 redraw 也可以不做）
        this._renderChart(chart, { progress: 1, drawTooltip: true });
      }
    }
  },

  _clearChartSelection(canvasId) {
    const chart = this._charts && this._charts[canvasId];
    if (!chart) return;
    chart.selectedIndex = -1;
    this._renderChart(chart, { progress: 1, drawTooltip: false });
  },

  // =========================
  // ✅ 折线图（带坐标轴 + 点）+ 高光动画 + 点选 tooltip
  // =========================
  drawLineChart(canvasId, list, max, unit, opts = {}) {
    const chart = this._buildChartState(canvasId, list, max, unit);

    // 缓存 chart（用于触摸交互）
    if (!this._charts) this._charts = {};
    this._charts[canvasId] = chart;

    // 动画：progress 0 -> 1
    if (opts.animate) {
      this._animateChart(chart);
    } else {
      this._renderChart(chart, { progress: 1, drawTooltip: true });
    }
  },

  _buildChartState(canvasId, list, max, unit) {
    // 这里维持你原来的尺寸与 padding，保证其他布局不变
    const W = 320;
    const H = 170;
    const padL = 36;
    const padR = 10;
    const padT = 18;
    const padB = 26;

    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const baseX = padL;
    const baseY = H - padB;

    const safe = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const n = (list && list.length) ? list.length : 0;
    const stepX = n > 1 ? (plotW / (n - 1)) : plotW;

    // 预计算点坐标（提升触摸/重绘性能）
    const points = [];
    for (let i = 0; i < n; i++) {
      const v = safe(list[i]);
      const x = baseX + i * stepX;
      const y = baseY - (v / max) * plotH;
      points.push({ x, y, v });
    }

    const markIdx = new Set([0, 9, 19, Math.max(0, n - 1)]);

    return {
      canvasId,
      list: list || [],
      max: Math.max(Number(max) || 1, 1),
      unit,

      W, H,
      padL, padR, padT, padB,
      plotW, plotH,
      baseX, baseY,
      stepX,
      points,
      markIdx,

      // 交互
      selectedIndex: -1,

      // 动画句柄
      _animTimer: null
    };
  },

  _animateChart(chart) {
    this._stopChartAnim(chart);

    const start = Date.now();
    const duration = 360; // ms：不宜太长，保持丝滑
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const tick = () => {
      const now = Date.now();
      const raw = (now - start) / duration;
      const t = Math.min(1, Math.max(0, raw));
      const progress = easeOutCubic(t);

      this._renderChart(chart, { progress, drawTooltip: true });

      if (t < 1) {
        chart._animTimer = setTimeout(tick, 16);
      } else {
        chart._animTimer = null;
      }
    };

    tick();
  },

  _stopChartAnim(chart) {
    if (chart && chart._animTimer) {
      clearTimeout(chart._animTimer);
      chart._animTimer = null;
    }
  },

  _stopAllChartAnims() {
    if (!this._charts) return;
    Object.keys(this._charts).forEach(cid => this._stopChartAnim(this._charts[cid]));
  },

  _renderChart(chart, { progress = 1, drawTooltip = true } = {}) {
    const ctx = wx.createCanvasContext(chart.canvasId, this);

    const {
      W, H, padL, padR, padT, padB,
      plotW, plotH, baseX, baseY,
      points, max, unit, markIdx
    } = chart;

    // 背景
    ctx.setFillStyle("#f4f8ff");
    ctx.fillRect(0, 0, W, H);

    // 标题
    ctx.setFillStyle("#1f2a44");
    ctx.setFontSize(12);
    ctx.fillText(`${unit}（随天数变化）`, padL, 14);

    // 轴
    ctx.setStrokeStyle("#9bb1dd");
    ctx.setLineWidth(1);
    ctx.beginPath();
    ctx.moveTo(baseX, padT);
    ctx.lineTo(baseX, baseY);
    ctx.lineTo(W - padR, baseY);
    ctx.stroke();

    // y刻度 + 网格线
    const steps = 4;
    ctx.setFillStyle("#3a4f82");
    ctx.setFontSize(10);
    for (let i = 0; i <= steps; i++) {
      const yVal = Math.round((max / steps) * i);
      const y = baseY - plotH * (i / steps);
      ctx.fillText(`${yVal}`, 6, y + 3);

      ctx.setStrokeStyle("#d9e3fb");
      ctx.beginPath();
      ctx.moveTo(baseX, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
    }

    // x：只标 1/10/20/月底（避免太挤）
    ctx.setFillStyle("#4d5f80");
    ctx.setFontSize(9);

    // =========================
    // ✅ 高光动态折线：先画“柔光底线”，再画“实线”
    // progress 控制绘制到第几个点（含小数插值）
    // =========================
    const n = points.length;
    if (n > 0) {
      const lastFloat = (n - 1) * progress;
      const lastIdx = Math.floor(lastFloat);
      const frac = lastFloat - lastIdx;

      // 1) 柔光底线（更“亮”的高光，shadow）
      // 小程序 canvas 支持 setShadow；不支持也不会报错（最多无阴影效果）
      try {
        ctx.setShadow(0, 0, 10, "rgba(47,128,237,0.35)");
      } catch (e) {}

      ctx.setStrokeStyle("rgba(47,128,237,0.55)");
      ctx.setLineWidth(4);
      ctx.beginPath();

      for (let i = 0; i <= lastIdx; i++) {
        const p = points[i];
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      // 插值到下一点
      if (lastIdx >= 0 && lastIdx < n - 1 && progress < 1) {
        const p0 = points[lastIdx];
        const p1 = points[lastIdx + 1];
        const ix = p0.x + (p1.x - p0.x) * frac;
        const iy = p0.y + (p1.y - p0.y) * frac;
        if (lastIdx === 0) ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(ix, iy);
      }
      ctx.stroke();

      // 关闭阴影，避免影响后续文字
      try {
        ctx.setShadow(0, 0, 0, "rgba(0,0,0,0)");
      } catch (e) {}

      // 2) 实线
      ctx.setStrokeStyle("#2f80ed");
      ctx.setLineWidth(2);
      ctx.beginPath();

      for (let i = 0; i <= lastIdx; i++) {
        const p = points[i];
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      if (lastIdx >= 0 && lastIdx < n - 1 && progress < 1) {
        const p0 = points[lastIdx];
        const p1 = points[lastIdx + 1];
        const ix = p0.x + (p1.x - p0.x) * frac;
        const iy = p0.y + (p1.y - p0.y) * frac;
        if (lastIdx === 0) ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(ix, iy);
      }
      ctx.stroke();

      // 3) 点（只画已“出现”的点）
      ctx.setFillStyle("#2f80ed");
      for (let i = 0; i <= Math.min(lastIdx, n - 1); i++) {
        const p = points[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
        ctx.fill();

        if (markIdx.has(i)) {
          const label = (this.data.trendLabels && this.data.trendLabels[i]) ? this.data.trendLabels[i] : "";
          ctx.setFillStyle("#4d5f80");
          ctx.fillText(label, p.x - 6, baseY + 14);
          ctx.setFillStyle("#2f80ed");
        }
      }

      // =========================
      // ✅ 选中点：放大 + 外圈高光 + tooltip（不走 setData，不卡）
      // =========================
      if (drawTooltip && chart.selectedIndex >= 0 && chart.selectedIndex < n) {
        const idx = chart.selectedIndex;
        const p = points[idx];

        // 选中点外圈
        ctx.setFillStyle("rgba(47,128,237,0.18)");
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fill();

        // 选中点实心
        ctx.setFillStyle("#2f80ed");
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
        ctx.fill();

        // 竖向辅助线（轻量）
        ctx.setStrokeStyle("rgba(47,128,237,0.25)");
        ctx.setLineWidth(1);
        ctx.beginPath();
        ctx.moveTo(p.x, padT);
        ctx.lineTo(p.x, baseY);
        ctx.stroke();

        // tooltip 内容：日期 + 数值
        const dateStr = (this.data.trendMonthDays && this.data.trendMonthDays[idx]) ? this.data.trendMonthDays[idx] : "";
        const valueStr = `${p.v}${unit === "次数" ? "" : " "}${unit}`;

        const text1 = dateStr ? `${dateStr}` : `Day ${idx + 1}`;
        const text2 = valueStr;

        // tooltip 尺寸估算（尽量简单，不测量文本宽度也可）
        ctx.setFontSize(10);
        const boxW = Math.max(120, (text1.length > text2.length ? text1.length : text2.length) * 6.2 + 18);
        const boxH = 38;

        // 位置：优先右上，否则左上
        let bx = p.x + 10;
        let by = p.y - boxH - 8;
        if (bx + boxW > W - 6) bx = p.x - boxW - 10;
        if (by < 6) by = p.y + 10;
        // 再兜底
        bx = Math.max(6, Math.min(bx, W - boxW - 6));
        by = Math.max(6, Math.min(by, H - boxH - 6));

        // tooltip 背板（带一点点高光）
        ctx.setFillStyle("rgba(255,255,255,0.95)");
        _roundRect(ctx, bx, by, boxW, boxH, 8);
        ctx.fill();

        ctx.setStrokeStyle("rgba(47,128,237,0.25)");
        ctx.setLineWidth(1);
        _roundRect(ctx, bx, by, boxW, boxH, 8);
        ctx.stroke();

        // tooltip 文本
        ctx.setFillStyle("#1f2a44");
        ctx.setFontSize(10);
        ctx.fillText(text1, bx + 10, by + 16);

        ctx.setFillStyle("#2f80ed");
        ctx.setFontSize(11);
        ctx.fillText(text2, bx + 10, by + 32);
      }
    }

    ctx.draw();

    function _roundRect(c, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      c.beginPath();
      c.moveTo(x + rr, y);
      c.arcTo(x + w, y, x + w, y + h, rr);
      c.arcTo(x + w, y + h, x, y + h, rr);
      c.arcTo(x, y + h, x, y, rr);
      c.arcTo(x, y, x + w, y, rr);
      c.closePath();
    }
  }
});
