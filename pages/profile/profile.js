// pages/profile/profile.js
const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    userInfo: {},
    heightInput: "",
    ageInput: "",
    targetInput: "",
    genderOptions: ["未设置", "女生", "男生", "其他 / 不方便说"],
    genderIndex: 0,

    isAdmin: false
  },

  async onShow() {
    let user = app.globalData.userInfo;

    // 若 globalData 为空，尝试从缓存恢复
    if (!user) {
      const cache = wx.getStorageSync("userInfo");
      if (cache) {
        user = cache;
        app.globalData.userInfo = cache;
      }
    }

    // 未登录 → 清空界面
    if (!user || !user._id) {
      this.setData({
        userInfo: {},
        heightInput: "",
        ageInput: "",
        targetInput: "",
        genderIndex: 0,
        isAdmin: false
      });
      return;
    }

    // 从数据库刷新当前最新信息
    const res = await db.collection("users").doc(user._id).get();
    const userDB = res.data;

    // 更新全局和本地缓存
    app.globalData.userInfo = userDB;
    wx.setStorageSync("userInfo", userDB);

    // 性别 index 映射
    let genderIndex = 0;
    if (userDB.gender === "female") genderIndex = 1;
    else if (userDB.gender === "male") genderIndex = 2;
    else if (userDB.gender === "other") genderIndex = 3;

    // 目标体重默认使用“当前体重”（没有就退回 targetWeight）
    const currentOrTarget =
      userDB.currentWeight != null && userDB.currentWeight !== ""
        ? userDB.currentWeight
        : userDB.targetWeight;

    this.setData({
      userInfo: userDB,
      heightInput: userDB.height ? String(userDB.height) : "",
      ageInput: userDB.age ? String(userDB.age) : "",
      targetInput: currentOrTarget ? String(currentOrTarget) : "",
      genderIndex,
      isAdmin: !!userDB.isAdmin
    });
  },

  // 输入事件
  onHeightInput(e) { this.setData({ heightInput: e.detail.value }); },
  onAgeInput(e) { this.setData({ ageInput: e.detail.value }); },
  onTargetInput(e) { this.setData({ targetInput: e.detail.value }); },
  onGenderChange(e) { this.setData({ genderIndex: Number(e.detail.value) }); },

  // 点击头像：从相册/相机选择并上传
  onAvatarTap() {
    const user = app.globalData.userInfo;
    if (!user || !user._id) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }

    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const filePath = res.tempFilePaths[0];
        const cloudPath = `avatars/${user._id}_${Date.now()}.jpg`;

        wx.showLoading({ title: "上传中..." });

        wx.cloud.uploadFile({
          cloudPath,
          filePath,
          success: async (uploadRes) => {
            const avatarUrl = uploadRes.fileID;

            try {
              await db.collection("users").doc(user._id).update({
                data: { avatarUrl }
              });

              const newUser = { ...user, avatarUrl };
              app.globalData.userInfo = newUser;
              wx.setStorageSync("userInfo", newUser);

              this.setData({
                "userInfo.avatarUrl": avatarUrl
              });

              wx.showToast({ title: "头像已更新", icon: "success" });
            } catch (e) {
              console.error(e);
              wx.showToast({ title: "保存失败", icon: "none" });
            }
          },
          fail: (err) => {
            console.error(err);
            wx.showToast({ title: "上传失败", icon: "none" });
          },
          complete: () => {
            wx.hideLoading();
          }
        });
      }
    });
  },

  // 保存资料（字段名还是 targetWeight）
  async onSaveProfile() {
    const { heightInput, ageInput, targetInput, genderIndex } = this.data;
    const user = app.globalData.userInfo;

    if (!user || !user._id) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }

    const genderMap = ["", "female", "male", "other"];
    const gender = genderMap[genderIndex] || "";

    const updatedData = {
      gender,
      height: heightInput ? Number(heightInput) : null,
      age: ageInput ? Number(ageInput) : null,
      targetWeight: targetInput ? Number(targetInput) : null
    };

    try {
      await db.collection("users").doc(user._id).update({
        data: updatedData
      });

      const newUser = { ...user, ...updatedData };
      app.globalData.userInfo = newUser;
      wx.setStorageSync("userInfo", newUser);

      wx.showToast({ title: "已保存", icon: "success" });
      this.onShow();
    } catch (e) {
      console.error(e);
      wx.showToast({ title: "保存失败", icon: "none" });
    }
  },

  /* ==========================
     新增：健康月报入口（你 WXML 绑定用）
     进入月报页面后再统计：本月运动次数 + 体重变化
  ========================== */
  goMonthlyReport() {
    const user = app.globalData.userInfo;
    if (!user || !user._id) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: "/pages/monthlyReport/monthlyReport"
    });
  },

  /* ==========================
     新增：预约心理咨询室入口（命名更清晰）
     复用你原有 appointment 页面
  ========================== */
  goCounselingAppointment() {
    this.goAppointment();
  },

  // 用户预约入口（原有，保留不删，兼容旧绑定）
  goAppointment() {
    const user = app.globalData.userInfo;

    if (!user || !user._id) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }

    wx.navigateTo({
      url: "/pages/appointment/appointment"
    });
  },

  // 管理员入口（原有）
  goAdmin() {
    wx.navigateTo({
      url: "/pages/adminLogin/adminLogin"
    });
  }
});
