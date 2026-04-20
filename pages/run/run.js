const app = getApp();

// 计算两点间距离（米）——简化版 Haversine
function calcDistance(lat1, lon1, lat2, lon2) {
  function toRad(d) {
    return (d * Math.PI) / 180;
  }
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 秒 -> mm:ss
function formatMMSS(sec) {
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// km/h -> 配速字符串 mm'ss"
function paceFromKmh(kmh) {
  const v = Number(kmh);
  if (!v || v <= 0.1) return "--'--\"";
  const secPerKm = 3600 / v;
  const mm = String(Math.floor(secPerKm / 60)).padStart(2, "0");
  const ss = String(Math.round(secPerKm % 60)).padStart(2, "0");
  return `${mm}'${ss}"`;
}

Page({
  data: {
    running: false,

    duration: 0,
    durationStr: "00:00",

    distance: 0,
    distanceKm: "0.00",

    paceStr: "--'--\"",

    // ✅ 移动配速（更像 Keep：基于平滑速度）
    movingPaceStr: "--'--\"",

    // ✅ 速度
    speedKmh: "0.0",
    avgSpeedKmh: "0.0",

    latitude: 34.27,
    longitude: 108.95,

    polyline: [],
    markers: []
  },

  timer: null,
  points: [],

  lastAcceptedPoint: null,
  lastAcceptedTime: 0,
  speedEma: 0,
  locationChangeHandler: null,

  pendingRecord: null,

  onLoad() {
    this.initLocation();
  },

  onUnload() {
    this.cleanupRun(false);
  },

  onHide() {
    if (this.data.running) {
      wx.showToast({ title: "离开页面已自动结束记录", icon: "none" });
      this.stopRun();
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  initLocation() {
    wx.getLocation({
      type: "gcj02",
      success: (res) => {
        this.setData({ latitude: res.latitude, longitude: res.longitude });
      },
      fail: (err) => {
        console.error("getLocation fail:", err);
        const msg = err && err.errMsg ? err.errMsg : JSON.stringify(err);
        wx.showModal({
          title: "获取定位失败",
          content:
            msg +
            "\n\n请检查：\n1. 手机系统定位是否开启\n2. 微信定位权限是否为“使用期间允许”\n3. iPhone请开启“精确位置”",
          confirmText: "去设置",
          cancelText: "取消",
          success: (r) => {
            if (r.confirm) {
              wx.openSetting({
                success: () => {
                  wx.getLocation({
                    type: "gcj02",
                    success: (res2) => {
                      this.setData({ latitude: res2.latitude, longitude: res2.longitude });
                      wx.showToast({ title: "定位已恢复", icon: "none" });
                    },
                    fail: (err2) => {
                      console.error("getLocation retry fail:", err2);
                      wx.showModal({
                        title: "仍无法定位",
                        content: err2 && err2.errMsg ? err2.errMsg : "请检查系统定位/微信权限/精确位置",
                        showCancel: false
                      });
                    }
                  });
                }
              });
            }
          }
        });
      }
    });
  },

  // ================= 开始跑步 =================
  startRun() {
    if (this.data.running) return;
    this.pendingRecord = null;

    wx.getSetting({
      success: (setting) => {
        if (!setting.authSetting["scope.userLocation"]) {
          wx.authorize({
            scope: "scope.userLocation",
            success: () => this._startRunInternal(),
            fail: () => {
              wx.showModal({
                title: "需要定位权限",
                content: "跑步记录需要获取位置信息，请在设置中打开定位权限。",
                confirmText: "去设置",
                cancelText: "取消",
                success: (r) => {
                  if (r.confirm) wx.openSetting({});
                }
              });
            }
          });
        } else {
          this._startRunInternal();
        }
      }
    });
  },

  _startRunInternal() {
    this.points = [];
    this.lastAcceptedPoint = null;
    this.lastAcceptedTime = 0;
    this.speedEma = 0;

    wx.getLocation({
      type: "gcj02",
      success: (res) => {
        const startPoint = { latitude: res.latitude, longitude: res.longitude };
        this.points = [startPoint];
        this.lastAcceptedPoint = startPoint;
        this.lastAcceptedTime = Date.now();

        this.setData({
          running: true,
          duration: 0,
          durationStr: "00:00",
          distance: 0,
          distanceKm: "0.00",
          paceStr: "--'--\"",
          movingPaceStr: "--'--\"",
          speedKmh: "0.0",
          avgSpeedKmh: "0.0",
          latitude: res.latitude,
          longitude: res.longitude,
          polyline: this.buildPolyline(this.points),
          markers: this.buildMarkers({ start: startPoint, current: startPoint, end: null })
        });

        this.timer && clearInterval(this.timer);
        this.timer = setInterval(() => {
          const duration = this.data.duration + 1;
          this.setData({ duration, durationStr: formatMMSS(duration) });

          const avg = duration > 0 ? (this.data.distance / duration) * 3.6 : 0;
          this.setData({ avgSpeedKmh: avg.toFixed(1) });

          this.updatePace();
        }, 1000);

        wx.startLocationUpdate({
          success: () => {
            this.locationChangeHandler = (locRes) => this.handleLocationChange(locRes);
            wx.onLocationChange(this.locationChangeHandler);
            wx.showToast({ title: "开始记录跑步", icon: "none" });
          },
          fail: (err) => {
            console.error("startLocationUpdate fail:", err);
            wx.showModal({
              title: "无法开启持续定位",
              content: err && err.errMsg ? err.errMsg : JSON.stringify(err),
              confirmText: "去设置",
              cancelText: "取消",
              success: (r) => {
                if (r.confirm) wx.openSetting({});
              }
            });
          }
        });
      },
      fail: () => wx.showToast({ title: "定位失败，请检查权限", icon: "none" })
    });
  },

  // ================= 定位变化处理（去抖 + 平滑速度） =================
  handleLocationChange(res) {
    if (!this.data.running) return;

    const now = Date.now();
    const { latitude, longitude } = res;

    const accuracy = typeof res.accuracy === "number" ? res.accuracy : null;
    if (accuracy != null && accuracy > 60) return;

    const minIntervalMs = 1200;
    if (this.lastAcceptedTime && now - this.lastAcceptedTime < minIntervalMs) return;

    const last = this.lastAcceptedPoint;
    if (!last) {
      const p0 = { latitude, longitude };
      this.points = [p0];
      this.lastAcceptedPoint = p0;
      this.lastAcceptedTime = now;
      return;
    }

    const d = calcDistance(last.latitude, last.longitude, latitude, longitude);

    const minDistanceM = 3;
    if (d < minDistanceM) return;

    const dt = (now - this.lastAcceptedTime) / 1000;
    if (dt <= 0) return;

    const instSpeed = d / dt;
    const instKmh = instSpeed * 3.6;
    if (instKmh > 30) return;

    const alpha = 0.25;
    this.speedEma = this.speedEma ? this.speedEma + alpha * (instSpeed - this.speedEma) : instSpeed;
    const smoothKmh = this.speedEma * 3.6;

    const newPoint = { latitude, longitude };
    this.points.push(newPoint);
    this.lastAcceptedPoint = newPoint;
    this.lastAcceptedTime = now;

    const newDistance = this.data.distance + d;
    const ptsCopy = this.points.map((p) => ({ ...p }));

    this.setData({
      latitude,
      longitude,
      distance: newDistance,
      distanceKm: (newDistance / 1000).toFixed(2),
      speedKmh: smoothKmh.toFixed(1),
      movingPaceStr: paceFromKmh(smoothKmh),
      polyline: this.buildPolyline(ptsCopy),
      markers: this.buildMarkers({ start: ptsCopy[0], current: newPoint, end: null })
    });

    this.updatePace();
  },

  // ================= 构建 polyline / markers =================
  buildPolyline(points) {
    return [{ points, color: "#1976d2", width: 6, dottedLine: false }];
  },

  buildMarkers({ start, current, end }) {
    const markers = [];
    if (start) {
      markers.push({
        id: 1,
        latitude: start.latitude,
        longitude: start.longitude,
        label: { content: "🏁 起点", color: "#0f172a", bgColor: "#ffffff", padding: 6, borderRadius: 12 }
      });
    }
    if (current) {
      markers.push({
        id: 2,
        latitude: current.latitude,
        longitude: current.longitude,
        label: { content: "📍 当前", color: "#0f172a", bgColor: "#ffffff", padding: 6, borderRadius: 12 }
      });
    }
    if (end) {
      markers.push({
        id: 3,
        latitude: end.latitude,
        longitude: end.longitude,
        label: { content: "✅ 终点", color: "#0f172a", bgColor: "#ffffff", padding: 6, borderRadius: 12 }
      });
    }
    return markers;
  },

  // ================= 平均配速 =================
  updatePace() {
    const { duration, distance } = this.data;
    if (!duration || !distance || distance < 10) {
      this.setData({ paceStr: "--'--\"" });
      return;
    }
    const paceSecPerKm = duration / (distance / 1000);
    const min = Math.floor(paceSecPerKm / 60);
    const sec = Math.round(paceSecPerKm % 60);
    const mm = String(min).padStart(2, "0");
    const ss = String(sec).padStart(2, "0");
    this.setData({ paceStr: `${mm}'${ss}"` });
  },

  // ================= 结束跑步 =================
  stopRun() {
    if (!this.data.running) return;

    const endPoint = this.points && this.points.length ? this.points[this.points.length - 1] : null;

    this.cleanupRun(false);

    if (endPoint && this.points && this.points.length) {
      const ptsCopy = this.points.map((p) => ({ ...p }));
      this.setData({
        polyline: this.buildPolyline(ptsCopy),
        markers: this.buildMarkers({ start: ptsCopy[0], current: null, end: endPoint })
      });
    }

    this.setData({ running: false });

    const isTooShort = !(this.data.distance > 30 && this.data.duration > 20);
    if (isTooShort) {
      wx.showToast({ title: "记录过短，未保存", icon: "none" });
      return;
    }

    this.confirmSaveRunRecord();
  },

  // ================= 结束后：确认是否保存 =================
  confirmSaveRunRecord() {
    const summary =
      `距离：${this.data.distanceKm} km\n` +
      `用时：${this.data.durationStr}\n` +
      `平均配速：${this.data.paceStr} min/km\n` +
      `移动配速：${this.data.movingPaceStr} min/km\n` +
      `平均速度：${this.data.avgSpeedKmh} km/h`;

    wx.showModal({
      title: "保存本次跑步记录？",
      content: summary,
      cancelText: "不保存",
      confirmText: "保存",
      success: (res) => {
        if (res.confirm) this.saveRunRecord();
        else wx.showToast({ title: "已取消保存", icon: "none" });
      }
    });
  },

  // ================= 清理（停止定位/计时） =================
  cleanupRun(resetUI = false) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    try {
      if (this.locationChangeHandler) {
        wx.offLocationChange(this.locationChangeHandler);
      }
    } catch (e) {
      console.warn("offLocationChange 调用失败，可忽略", e);
    }

    this.locationChangeHandler = null;
    wx.stopLocationUpdate({ fail: () => {} });

    if (resetUI) {
      this.setData({
        running: false,
        duration: 0,
        durationStr: "00:00",
        distance: 0,
        distanceKm: "0.00",
        paceStr: "--'--\"",
        movingPaceStr: "--'--\"",
        speedKmh: "0.0",
        avgSpeedKmh: "0.0",
        polyline: [],
        markers: []
      });
    }
  },

  // ================= 工具：格式化日期 =================
  formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },

  // ================= ✅ 保存：workout_checkins + 按天写 sport_daily =================
  async saveRunRecord() {
    try {
      if (!wx.cloud) {
        wx.showModal({
          title: "云能力未开启",
          content: "请确认已启用云开发并在 app.js 调用 wx.cloud.init()",
          showCancel: false
        });
        return;
      }

      // 确保 openid（没有就自动取）
      if (!app.globalData.openid) {
        const r = await wx.cloud.callFunction({ name: "login" });
        const openid = r && r.result && r.result.openid;
        if (!openid) {
          wx.showModal({ title: "获取 openid 失败", content: "云函数 login 未返回 openid", showCancel: false });
          return;
        }
        app.globalData.openid = openid;
      }

      const db = wx.cloud.database();
      const now = new Date();
      const dateStr = this.formatDate(now);

      // 1) 单次明细：workout_checkins（含 points）
      const checkinRecord = {
        openid: app.globalData.openid,
        type: "run",
        dateStr,
        createTime: db.serverDate(),

        duration: this.data.duration,
        durationStr: this.data.durationStr,

        distance: this.data.distance,
        distanceKm: this.data.distanceKm,

        paceStr: this.data.paceStr,
        movingPaceStr: this.data.movingPaceStr,

        avgSpeedKmh: this.data.avgSpeedKmh,
        lastSpeedKmh: this.data.speedKmh,

        points: this.points
      };

      wx.showLoading({ title: "保存中...", mask: true });

      const addRes = await db.collection("workout_checkins").add({ data: checkinRecord });
      const checkinId = addRes && addRes._id ? addRes._id : "";

      // 2) 按天汇总：sport_daily（不存 points，存 checkinId + 摘要，避免爆文档大小）
      await this.upsertSportDaily({
        openid: app.globalData.openid,
        dateStr,
        checkinId,
        summary: {
          distanceKm: Number(checkinRecord.distanceKm),
          minutes: Math.floor(Number(checkinRecord.duration) / 60),
          duration: Number(checkinRecord.duration),
          durationStr: checkinRecord.durationStr,
          paceStr: checkinRecord.paceStr,
          movingPaceStr: checkinRecord.movingPaceStr,
          avgSpeedKmh: Number(checkinRecord.avgSpeedKmh),
          lastSpeedKmh: Number(checkinRecord.lastSpeedKmh)
        }
      });

      wx.hideLoading();

      wx.showModal({
        title: "保存成功（已进入运动趋势）",
        content:
          `距离：${this.data.distanceKm} km\n` +
          `用时：${this.data.durationStr}\n` +
          `平均配速：${this.data.paceStr} 分钟/公里\n` +
          `移动配速：${this.data.movingPaceStr} 分钟/公里\n` +
          `平均速度：${this.data.avgSpeedKmh} km/h`,
        showCancel: false
      });
    } catch (e) {
      wx.hideLoading();
      console.error("保存失败", e);
      wx.showModal({
        title: "保存失败",
        content: (e && e.errMsg ? e.errMsg : JSON.stringify(e)),
        showCancel: false
      });
    }
  },

  // ================= ✅ 按天写入/累加 sport_daily =================
  async upsertSportDaily({ openid, dateStr, checkinId, summary }) {
    const db = wx.cloud.database();

    // sport_daily 文档结构（每天一条）：
    // { openid, dateStr, totalDistanceKm, totalMinutes, runCount, runs:[{checkinId,...summary}], updatedAt }
    const res = await db
      .collection("sport_daily")
      .where({ openid, dateStr })
      .limit(1)
      .get();

    const existing = res.data && res.data.length ? res.data[0] : null;

    if (!existing) {
      await db.collection("sport_daily").add({
        data: {
          openid,
          dateStr,
          totalDistanceKm: Number(summary.distanceKm) || 0,
          totalMinutes: Number(summary.minutes) || 0,
          runCount: 1,
          runs: [
            {
              checkinId,
              ...summary
            }
          ],
          updatedAt: db.serverDate()
        }
      });
      return;
    }

    const docId = existing._id;
    const prevKm = Number(existing.totalDistanceKm) || 0;
    const prevMin = Number(existing.totalMinutes) || 0;
    const prevCount = Number(existing.runCount) || 0;

    // ⚠️ runs 数组可能越来越大：一般一天不会太多次，安全
    const newRuns = Array.isArray(existing.runs) ? existing.runs.slice() : [];
    newRuns.push({ checkinId, ...summary });

    await db.collection("sport_daily").doc(docId).update({
      data: {
        totalDistanceKm: (prevKm + (Number(summary.distanceKm) || 0)).toFixed(2),
        totalMinutes: prevMin + (Number(summary.minutes) || 0),
        runCount: prevCount + 1,
        runs: newRuns,
        updatedAt: db.serverDate()
      }
    });
  }
});
