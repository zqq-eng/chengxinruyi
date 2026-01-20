Page({
  data: {
    account: "",
    password: ""
  },

  onAccountInput(e) {
    this.setData({ account: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  // 管理员固定账号（可升级到数据库版本）
  ADMIN_ACCOUNT: "admin",
  ADMIN_PASSWORD: "123456",

  loginAdmin() {
    const { account, password } = this.data;

    if (account === this.ADMIN_ACCOUNT && password === this.ADMIN_PASSWORD) {
      // 保存管理员 token（有效标记）
      wx.setStorageSync("adminToken", "OK");

      wx.showToast({
        title: "登录成功",
        icon: "success"
      });

      wx.redirectTo({
        url: "/pages/adminPanel/adminPanel"
      });
    } else {
      wx.showToast({
        title: "账号或密码错误",
        icon: "none"
      });
    }
  }
});
