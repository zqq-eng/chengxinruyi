// pages/login/login.js
const app = getApp(); 

Page({
  data: {
    account: "",
    password: "",
    errorMsg: ""
  },

  // 管理员登录入口
  goAdminLogin() {
    wx.navigateTo({
      url: "/pages/adminLogin/adminLogin"
    });
  },

  onAccountInput(e) {
    this.setData({ account: e.detail.value, errorMsg: "" });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value, errorMsg: "" });
  },

  // 登录处理
  async onLoginTap() {
    const { account, password } = this.data;
    if (!account || !password) {
      this.setData({ errorMsg: "请输入账号和密码~" });
      return;
    }

    wx.showLoading({ title: "登录中...", mask: true });

    try {
      // 1. 获取 openid
      const loginRes = await wx.cloud.callFunction({
        name: "login"
      });
      const openid = loginRes.result && loginRes.result.openid;
      app.globalData.openid = openid;

      // 2. 查找用户
      const db = wx.cloud.database();
      const userRes = await db.collection("users")
        .where({ account, password })
        .get();

      if (!userRes.data.length) {
        this.setData({ errorMsg: "账号或密码不正确~" });
        wx.hideLoading();
        return;
      }

      const userInfo = userRes.data[0];
      app.globalData.userInfo = userInfo;

      wx.hideLoading();

      // 3. 跳转首页
      wx.switchTab({
        url: "/pages/home/home"
      });

    } catch (err) {
      console.error("登录失败", err);
      wx.hideLoading();
      this.setData({ errorMsg: "登录出现异常，请稍后再试" });
    }
  },

  goRegister() {
    wx.navigateTo({
      url: "/pages/register/register"
    });
  }
});
