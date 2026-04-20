const app = getApp();

Page({
  data: {
    account: "",
    name: "",
    school: "",
    major: "",
    password: "",
    confirmPassword: "",
    errorMsg: ""
  },

  // 返回上一页
  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  onAccountInput(e) {
    this.setData({ account: e.detail.value, errorMsg: "" });
  },
  onNameInput(e) {
    this.setData({ name: e.detail.value, errorMsg: "" });
  },
  onSchoolInput(e) {
    this.setData({ school: e.detail.value, errorMsg: "" });
  },
  onMajorInput(e) {
    this.setData({ major: e.detail.value, errorMsg: "" });
  },
  onPasswordInput(e) {
    this.setData({ password: e.detail.value, errorMsg: "" });
  },
  onConfirmPasswordInput(e) {
    this.setData({ confirmPassword: e.detail.value, errorMsg: "" });
  },

  async onRegisterTap() {
    const { account, name, school, major, password, confirmPassword } = this.data;

    if (!account || !name || !school || !password || !confirmPassword) {
      this.setData({ errorMsg: "请完整填写所有信息~" });
      return;
    }
    if (password !== confirmPassword) {
      this.setData({ errorMsg: "两次密码不一致喔~" });
      return;
    }

    wx.showLoading({ title: "注册中...", mask: true });

    try {
      // 获取 openid
      const loginRes = await wx.cloud.callFunction({ name: "login" });
      const openid = loginRes.result && loginRes.result.openid;
      app.globalData.openid = openid;

      const db = wx.cloud.database();

      // 检查账号是否已存在
      const existRes = await db.collection("users")
        .where({ account })
        .get();

      if (existRes.data.length) {
        wx.hideLoading();
        this.setData({ errorMsg: "该账号已注册，请直接登录~" });
        return;
      }

      // 新建用户
      await db.collection("users").add({
        data: {
          account,
          name,
          school,
          major,
          password,
          openid,
          createdAt: db.serverDate(),
          targetWeight: null,
          avatarUrl: "",
          role: "student"
        }
      });

      wx.hideLoading();

      wx.showToast({
        title: "注册成功",
        icon: "success"
      });

      // 注册成功后返回登录页
      setTimeout(() => {
        wx.navigateBack({ delta: 1 });
      }, 800);

    } catch (err) {
      console.error("注册失败", err);
      wx.hideLoading();
      this.setData({ errorMsg: "注册出现异常，请稍后重试~" });
    }
  },

  goLogin() {
    wx.navigateBack({ delta: 1 });
  }
});
