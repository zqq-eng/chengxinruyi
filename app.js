App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库来使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-0g7pj3787c240ca6', // 你的环境 ID
        traceUser: true
      });
    }

    this.globalData = {
      openid: '',
      userInfo: null
    };
  }
});
