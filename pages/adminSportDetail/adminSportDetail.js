// pages/adminSportDetail/adminSportDetail.js
const app = getApp();

Page({
  data: {
    id: "",
    record: {},
    pawText: "",
    adminNote: "",
    polyline: [],
    markers: [],
    centerLat: 34.27,
    centerLng: 108.95
  },

  onLoad(options) {
    this.setData({ id: options.id });
    this.loadRecord();
  },

  // ------------------------------------------------------
  // 加载单条记录
  // ------------------------------------------------------
  async loadRecord() {
    const db = wx.cloud.database();

    const res = await db.collection("runs").doc(this.data.id).get();
    const r = res.data;

    // 判断中心点（路线中点）
    let lat = r.points?.length ? r.points[0].latitude : 34.27;
    let lng = r.points?.length ? r.points[0].longitude : 108.95;

    // 跑步路线 polyline
    const polyline = [
      {
        points: r.points || [],
        color: "#ff9acb",
        width: 5
      }
    ];

    const markers = r.points?.length
      ? [
          {
            id: 1,
            latitude: r.points[0].latitude,
            longitude: r.points[0].longitude,
            label: {
              content: "起点",
              color: "#ff6ea8",
              bgColor: "#fff",
              padding: 4,
              borderRadius: 12
            }
          },
          {
            id: 2,
            latitude: r.points[r.points.length - 1].latitude,
            longitude: r.points[r.points.length - 1].longitude,
            label: {
              content: "终点",
              color: "#a25ed4",
              bgColor: "#fff",
              padding: 4,
              borderRadius: 12
            }
          }
        ]
      : [];

    this.setData({
      record: r,
      adminNote: r.adminNote || "",
      pawText: this.getPawLevel(r.distanceKm),
      centerLat: lat,
      centerLng: lng,
      polyline,
      markers
    });
  },

  // ------------------------------------------------------
  // 根据距离判断运动等级（与 run → record 联动）
  // ------------------------------------------------------
  getPawLevel(kmStr) {
    const km = Number(kmStr);

    if (km <= 0) return "无记录";
    if (km < 1) return "🐾（轻度运动）";
    if (km < 5) return "🐾🐾（跑步）";
    return "✨🐾✨（高强度跑步）";
  },

  // ------------------------------------------------------
  // 备注输入
  // ------------------------------------------------------
  onNoteInput(e) {
    this.setData({ adminNote: e.detail.value });
  },

  // ------------------------------------------------------
  // 保存管理员备注
  // ------------------------------------------------------
  async saveNote() {
    const db = wx.cloud.database();

    await db.collection("runs").doc(this.data.id).update({
      data: {
        adminNote: this.data.adminNote
      }
    });

    wx.showToast({
      title: "备注已保存",
      icon: "success"
    });
  }
});
