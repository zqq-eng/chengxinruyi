App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库来使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloudqq-4g32uhb816255d70', // 你的环境 ID
        traceUser: true
      });
    }

    this.globalData = {
      openid: '',
      userInfo: null
    };
  }
});
