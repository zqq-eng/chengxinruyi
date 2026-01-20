const app = getApp();

// 计算两点间距离（米）——简化版 Haversine
function calcDistance(lat1, lon1, lat2, lon2) {
  function toRad(d) {
    return (d * Math.PI) / 180;
  }
  const R = 6371000; // 地球半径，米

  // ✅ 这里统一用 dLat / dLon，避免未定义变量
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

Page({
  data: {
    running: false,
    duration: 0,          // 秒
    durationStr: "00:00", // 显示用
    distance: 0,          // 米
    distanceKm: "0.00",   // 显示用
    paceStr: "--'--\"",   // 配速

    latitude: 34.27,
    longitude: 108.95,
    polyline: [],
    markers: []
  },

  timer: null,
  points: [],

  onLoad() {
    this.initLocation();
  },

  onUnload() {
    this.cleanupRun();
  },

  onHide() {
    // 离开页面自动暂停
    if (this.data.running) {
      wx.showToast({
        title: "离开页面已自动暂停记录",
        icon: "none"
      });
      this.stopRun();
    }
  },

  // 返回按钮
  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  initLocation() {
    wx.getLocation({
      type: "gcj02",
      success: res => {
        this.setData({
          latitude: res.latitude,
          longitude: res.longitude
        });
      },
      fail: () => {
        wx.showToast({
          title: "获取定位失败，可在开始前重新授权",
          icon: "none"
        });
      }
    });
  },

  // 开始跑步
  startRun() {
    if (this.data.running) return;

    wx.getSetting({
      success: setting => {
        if (!setting.authSetting["scope.userLocation"]) {
          wx.authorize({
            scope: "scope.userLocation",
            success: () => {
              this._startRunInternal();
            },
            fail: () => {
              wx.showModal({
                title: "需要定位权限",
                content: "跑步记录需要获取位置信息，请在设置中打开定位权限。",
                showCancel: false
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
    this.setData({
      running: true,
      duration: 0,
      durationStr: "00:00",
      distance: 0,
      distanceKm: "0.00",
      paceStr: "--'--\"",
      polyline: [],
      markers: []
    });

    // 计时器
    this.timer && clearInterval(this.timer);
    this.timer = setInterval(() => {
      const duration = this.data.duration + 1;
      const mm = String(Math.floor(duration / 60)).padStart(2, "0");
      const ss = String(duration % 60).padStart(2, "0");
      this.setData({
        duration,
        durationStr: `${mm}:${ss}`
      });
      this.updatePace();
    }, 1000);

    // 启动定位更新
    wx.startLocationUpdate({
      success: () => {
        wx.onLocationChange(this._onLocationChange);
        wx.showToast({
          title: "开始记录跑步",
          icon: "none"
        });
      },
      fail: err => {
        console.error(err);
        wx.showToast({
          title: "无法开启定位，请检查权限",
          icon: "none"
        });
      }
    });
  },

  // ⚠ 注意：这里用 getCurrentPages 拿到当前 page 实例
  _onLocationChange(res) {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1];
    if (!page || !page.data || !page.data.running) return;

    const { latitude, longitude } = res;
    const pts = page.points || [];

    if (pts.length > 0) {
      const last = pts[pts.length - 1];
      const d = calcDistance(last.latitude, last.longitude, latitude, longitude);
      if (d > 1) {
        // 小于 1m 的抖动不计
        page.data.distance += d;
      }
    }

    pts.push({ latitude, longitude });
    page.points = pts;

    page.setData({
      latitude,
      longitude,
      distance: page.data.distance,
      distanceKm: (page.data.distance / 1000).toFixed(2),
      polyline: [
        {
          points: pts,
          color: "#ff9acb",
          width: 5,
          dottedLine: true
        }
      ],
      markers: pts.length
        ? [
            {
              id: 1,
              latitude: pts[0].latitude,
              longitude: pts[0].longitude,
              label: {
                content: "🐾 起点",
                color: "#ff6ea8",
                bgColor: "#ffffff",
                padding: 4,
                borderRadius: 10
              }
            },
            {
              id: 2,
              latitude,
              longitude,
              label: {
                content: "🐱 小猫在这里",
                color: "#a25ed4",
                bgColor: "#ffffff",
                padding: 4,
                borderRadius: 10
              }
            }
          ]
        : []
    });

    page.updatePace();
  },

  updatePace() {
    const { duration, distance } = this.data;
    if (!duration || !distance) {
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

  // 结束跑步
  stopRun() {
    if (!this.data.running) return;
    this.cleanupRun(true);
  },

  cleanupRun(save = false) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    try {
      wx.offLocationChange(this._onLocationChange);
    } catch (e) {
      console.warn("offLocationChange 调用失败，可忽略", e);
    }

    wx.stopLocationUpdate({
      fail: () => {}
    });

    if (save && this.data.distance > 10 && this.data.duration > 20) {
      this.saveRunRecord();
    }

    this.setData({ running: false });
  },

  saveRunRecord() {
    if (!app.globalData.openid) return;
    const db = wx.cloud.database();
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${d}`;

    const record = {
      openid: app.globalData.openid,
      startTime: db.serverDate ? db.serverDate() : now,
      dateStr,
      duration: this.data.duration,
      durationStr: this.data.durationStr,
      distance: this.data.distance,
      distanceKm: this.data.distanceKm,
      paceStr: this.data.paceStr,
      points: this.points
    };

    db.collection("runs")
      .add({ data: record })
      .then(() => {
        wx.showModal({
          title: "本次跑步记录",
          content: `距离：${this.data.distanceKm} km\n用时：${this.data.durationStr}\n配速：${this.data.paceStr} 分钟/公里`,
          showCancel: false
        });
      })
      .catch(e => {
        console.error("保存跑步记录失败", e);
        wx.showToast({
          title: "保存跑步记录失败",
          icon: "none"
        });
      });
  }
});
