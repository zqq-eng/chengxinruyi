// pages/ai/ai.js
const app = getApp();

Page({
  data: {
    useCloud: true,
    loading: false,
    errorMsg: '',

    currentTab: 0,

    // 食物图片：一个本地预览路径，一个云端 fileID
    foodImagePath: '',
    foodImageFileID: '',

    // 身体情况可爱表单
    bodyForm: {
      height: '',   // cm
      weight: '',   // kg
      exercise: '', // 次/周
      sleep: '',    // 小时/天
      gender: '',   // 性别：男 / 女 / 其他
      others: ''    // 其他补充
    
    },

    // 饮食 / 心理 文本输入
    foodInput: '',
    stressInput: '',

    // 三类结果
    result: {
      body: '在上方小表格里填一填身高体重、运动和睡眠，再写一点想说的感受，然后点击下方“生成 AI 分析”。',
      food: '在“饮食 · 食物”里写写你这段时间的吃饭习惯，也可以拍一张常吃的一顿饭让 AI 帮你看看热量。',
      stress: '在“心理压力”里把最近的烦恼和压力来源写几句出来，交给 AI 帮你一起分担。'
    },

    // 离线兜底结果
    offlineResult: {
      body:
        '我先根据常见情况给你一个通用建议：\n' +
        '1）如果体重在一个小范围内上下浮动，其实是正常的，不必太焦虑；\n' +
        '2）尝试一周保持 3～4 次 30 分钟左右的中等强度运动，比如快走、慢跑、跳操；\n' +
        '3）别忽视睡眠，尽量在 23 点前上床，让身体有时间恢复。',
      food:
        '可以先从“减一点点”开始：\n' +
        '1）把含糖饮料和奶茶的频率控制在每周 1～2 次；\n' +
        '2）油炸、烧烤、重油重盐的菜，尽量和蔬菜、蛋白质搭配着吃；\n' +
        '3）多喝水，多吃蔬菜和优质蛋白（鸡蛋、牛奶、鱼虾、瘦肉），这样既能减脂，又能保持精力。',
      stress:
        '你现在感受到的压力，说明你很在意自己的生活和未来，这是件好事：\n' +
        '1）可以试着把大目标拆成每周的小目标，完成一个就给自己一点奖励；\n' +
        '2）允许自己偶尔什么都不做，发呆、散步、听歌都可以；\n' +
        '3）如果有信任的人，试着说一说你的感受，不用憋在心里。'
    }
  },

  onLoad() {},

  // 顶部 Tab 切换
  switchTab(e) {
    const index = Number(e.currentTarget.dataset.index) || 0;
    this.setData({ currentTab: index });
  },

  // 身体小表格输入
  handleBodyFormInput(e) {
    const field = e.currentTarget.dataset.field; // height / weight / ...
    const value = e.detail.value;
    this.setData({ [`bodyForm.${field}`]: value });
  },
  handleChooseGender(e) {
    const g = e.currentTarget.dataset.gender; // male / female
    this.setData({
      gender: g
    });
  },
  
  // 饮食 & 心理 文本输入
  handleInput(e) {
    const field = e.currentTarget.dataset.field; // foodInput / stressInput
    this.setData({ [field]: e.detail.value });
  },

  // 选择 / 拍摄 食物图片，并上传到云存储
  handleChooseImage() {
    const that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        const path = res.tempFilePaths[0];
        that.setData({ foodImagePath: path });

        wx.showLoading({ title: '上传中…', mask: true });
        wx.cloud.uploadFile({
          cloudPath: 'food/' + Date.now() + '.jpg',
          filePath: path,
          success(upRes) {
            console.log('上传成功 fileID:', upRes.fileID);
            that.setData({ foodImageFileID: upRes.fileID });
          },
          fail(err) {
            console.error('上传失败:', err);
            wx.showToast({ title: '图片上传失败', icon: 'none' });
          },
          complete() {
            wx.hideLoading();
          }
        });
      },
      fail() {
        wx.showToast({ title: '没有选到图片哦', icon: 'none' });
      }
    });
  },

  // 把可爱表单拼成一句话
  buildBodyText() {
    const f = this.data.bodyForm;
    const parts = [];

    if (f.height) parts.push(`身高约 ${f.height} cm`);
    if (f.weight) parts.push(`体重约 ${f.weight} kg`);
    if (f.exercise) parts.push(`最近每周运动 ${f.exercise} 次`);
    if (f.sleep) parts.push(`平均每天睡眠约 ${f.sleep} 小时`);
    if (f.others) parts.push(`其他情况：${f.others}`);
    if (this.data.gender) parts.push(`性别：${this.data.gender === 'female' ? '女' : '男'}`);

    return parts.join('；');
  },

  // 点击「生成 AI 分析」
  handleGenerate() {
    if (this.data.loading) return;

    const bodyText = this.buildBodyText();
    const hasBody = !!bodyText.trim();
    const hasFood = !!this.data.foodInput.trim() || !!this.data.foodImageFileID;
    const hasStress = !!this.data.stressInput.trim();

    if (!hasBody && !hasFood && !hasStress) {
      wx.showToast({
        title: '先随便填一点点你的情况吧～',
        icon: 'none'
      });
      return;
    }

    if (this.data.useCloud) {
      this.callCloudAI(bodyText);
    } else {
      this.applyOffline('已使用离线分析，根据通用情况给你一些温柔建议～');
    }
  },

  // 云端 / 离线 切换
  handleToggleMode() {
    const next = !this.data.useCloud;
    this.setData({
      useCloud: next,
      errorMsg: ''
    });

    if (!next) {
      this.applyOffline('已切换到离线分析模式～');
    }
  },

  // 调用云函数 ai_analyze
  callCloudAI(bodyTextFromForm) {
    this.setData({
      loading: true,
      errorMsg: ''
    });

    const userProfile = app.globalData.userInfo || {};

    wx.cloud.callFunction({
      name: 'ai_analyze',
      data: {
        userProfile,
        manualInput: {
          body: bodyTextFromForm,
          food: this.data.foodInput,
          stress: this.data.stressInput,
          // 关键：把图片 fileID 传给云函数
          foodImageUrl: this.data.foodImageFileID || ''
        }
      },
      success: (res) => {
        console.log('云端 AI 返回：', res);

        const r = res.result || {};
        if (r.ok && r.data) {
          const d = r.data;
          this.setData({
            loading: false,
            useCloud: true, // 说明这次是云端成功
            result: {
              body: d.body || this.data.offlineResult.body,
              // 食物：里面已经区分了“文字饮食分析”和“图片热量分析”
              food: d.food || this.data.offlineResult.food,
              stress: d.stress || this.data.offlineResult.stress
            },
            errorMsg: ''
          });
        } else {
          this.applyOffline(r.msg || '云端 AI 暂时连不上了～ 已自动切换为离线分析。');
        }
      },
      fail: (err) => {
        console.error('调用 ai_analyze 失败：', err);
        this.applyOffline('网络好像有点小问题，云端 AI 暂时连不上了～ 已自动切换为离线分析。');
      }
    });
  },

  // 启用离线分析
  applyOffline(msg) {
    this.setData({
      loading: false,
      useCloud: false,
      result: this.data.offlineResult,
      errorMsg: msg || ''
    });
  }
});
