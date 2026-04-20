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

    // 身体情况表单（保持原来不变）
    bodyForm: {
      height: '',   // cm
      weight: '',   // kg
      exercise: '', // 次/周
      sleep: '',    // 小时/天
      gender: '',   // 性别：男 / 女 / 其他
      others: ''    // 其他补充
    },

    // ✅ 兼容你原来的 gender 存法（female/male/other）
    gender: '',

    // 饮食 / 心理 文本输入（保持原来不变）
    foodInput: '',
    stressInput: '',

    // 三类结果（仍保留，不破坏原布局）
    result: {
      body: '在上方小表格里填一填身高体重、运动和睡眠，然后点上方“身体分析”开始对话。',
      food: '在“饮食 · 食物”里写写你吃了什么，也可以拍一张食物照片；再点上方“饮食分析”开始对话。',
      stress: '在“心理压力”里写几句最近的烦恼；再点上方“情绪分析”开始对话。'
    },

    // ✅ 对话记录（每类独立）
    chat: {
      body: [],   // [{role:'user'|'assistant', text:'', ts:0}]
      food: [],
      stress: []
    },

    // ✅ 开始对话开关（开始对话后显示聊天框）
    chatStarted: { body: false, food: false, stress: false },

    // ✅ AI 追问的回复输入框
    replyInput: { body: '', food: '', stress: '' },

    // ✅ 固定模板（placeholder）
    replyPlaceholder: {
      body: '按模板回答：目标(减脂/增肌/维持)+最近变化/困扰',
      food: '按模板回答：份量(半碗/一碗)+饮料(无糖/奶茶)+频率(每天/每周/偶尔)',
      stress: '按模板回答：持续多久(天/周)+是否影响睡眠/食欲(是/否)'
    },

    // ✅ 自动滚动锚点
    chatAnchorBody: 'anchorBody',
    chatAnchorFood: 'anchorFood',
    chatAnchorStress: 'anchorStress',

    // 离线兜底（保留）
    offlineResult: {
      body:
        '我先不乱下结论：从你现在填的信息看，最优先是把睡眠和运动“固定下来”。\n' +
        '建议：①每周 3 次快走/慢跑 20–30 分钟；②尽量固定入睡时间；③三餐保证蛋白质+蔬菜。\n' +
        '我想问一句：你一般几点睡、几点起？',
      food:
        '我收到了～我先不乱猜热量。\n' +
        '建议：①告诉我大概份量（半碗/一碗/两碗）；②如果有饮料，优先无糖/少糖；③每餐尽量配一份蔬菜。\n' +
        '我想问一句：这顿主要吃了哪些？各大概多少？',
      stress:
        '我听见你在承受压力了，我们先稳住身体再处理事情。\n' +
        '建议：①做 3 分钟呼吸（吸4-停2-呼6，循环6次）；②把最担心的事写成一句话；③今天只做第一步。\n' +
        '我想问一句：这个压力持续多久了？会影响睡眠/食欲吗？'
    }
  },

  onLoad() {},

  /* =====================
   * 顶部 Tab 切换（不改）
   * ===================== */
  switchTab(e) {
    const index = Number(e.currentTarget.dataset.index) || 0;
    this.setData({ currentTab: index });
  },

  /* =====================
   * 身体小表格输入（不改）
   * ===================== */
  handleBodyFormInput(e) {
    const field = e.currentTarget.dataset.field; // height / weight / ...
    const value = e.detail.value;
    this.setData({ [`bodyForm.${field}`]: value });
  },

  /* =====================
   * 性别选择（不改）
   * ===================== */
  handleChooseGender(e) {
    const g = e.currentTarget.dataset.gender; // female / male / other
    const label = g === 'female' ? '女' : g === 'male' ? '男' : '其他';
    this.setData({
      gender: g,
      'bodyForm.gender': label
    });
  },

  /* =====================
   * 饮食 & 心理 文本输入（不改）
   * ===================== */
  handleInput(e) {
    const field = e.currentTarget.dataset.field; // foodInput / stressInput
    this.setData({ [field]: e.detail.value });
  },

  /* =====================
   * 选择 / 拍摄 食物图片（不改）
   * ===================== */
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

  /* =====================
   * ✅ 关键：把表单拼成一句话（身体输入真正传给 AI）
   * ===================== */
  buildBodyText() {
    const f = this.data.bodyForm || {};
    const parts = [];

    if (f.height) parts.push(`身高 ${f.height}cm`);
    if (f.weight) parts.push(`体重 ${f.weight}kg`);
    if (f.exercise) parts.push(`运动 ${f.exercise}次/周`);
    if (f.sleep) parts.push(`睡眠 ${f.sleep}小时/天`);
    if (f.gender) parts.push(`性别 ${f.gender}`);
    if (f.others) parts.push(`其他：${f.others}`);

    if (this.data.gender && !f.gender) {
      const label = this.data.gender === 'female' ? '女' : this.data.gender === 'male' ? '男' : '其他';
      parts.push(`性别 ${label}`);
    }

    return parts.join('；');
  },

  /* =====================
   * 云端 / 离线 切换（不改）
   * ===================== */
  handleToggleMode() {
    const next = !this.data.useCloud;
    this.setData({ useCloud: next, errorMsg: '' });
    if (!next) wx.showToast({ title: '已切换到离线分析模式～', icon: 'none' });
  },

  /* =====================
   * ✅ 三个大圆：开始对话（不改UI，只改逻辑）
   * ===================== */
  handleGenerateBody() {
    this.setData({ currentTab: 0 }, () => this.startChat('body'));
  },

  handleGenerateFood() {
    this.setData({ currentTab: 1 }, () => this.startChat('food'));
  },

  handleGenerateStress() {
    this.setData({ currentTab: 2 }, () => this.startChat('stress'));
  },

  /* =====================
   * ✅ 开始对话：把“当前页面输入”作为首句发给 AI
   * ===================== */
  startChat(type) {
    if (this.data.loading) return;

    let userMsg = '';
    if (type === 'body') {
      userMsg = (this.buildBodyText() || '').trim();
      if (!userMsg) {
        wx.showToast({ title: '先填一点身高体重/运动睡眠信息吧～', icon: 'none' });
        return;
      }
    } else if (type === 'food') {
      userMsg = (this.data.foodInput || '').trim();
      const hasImage = !!this.data.foodImageFileID;
      if (!userMsg && !hasImage) {
        wx.showToast({ title: '写一句饮食情况或上传一张食物照片吧～', icon: 'none' });
        return;
      }
    } else {
      userMsg = (this.data.stressInput || '').trim();
      if (!userMsg) {
        wx.showToast({ title: '写一句最近的压力/烦恼吧～', icon: 'none' });
        return;
      }
    }

    const cs = this.data.chatStarted || { body:false, food:false, stress:false };
    if (!cs[type]) this.setData({ chatStarted: { ...cs, [type]: true } });

    // 首句入对话
    if (userMsg) this.appendChat(type, 'user', userMsg);

    if (this.data.useCloud) {
      this.callCloudChatAI(type, userMsg);
    } else {
      this.applyOfflineChatFor(type, '已使用离线分析模式～');
    }
  },

  /* =====================
   * ✅ 聊天追加一条（带自动滚动锚点）
   * ===================== */
  appendChat(type, role, text) {
    const chat = this.data.chat || { body: [], food: [], stress: [] };
    const list = Array.isArray(chat[type]) ? chat[type] : [];
    const next = list.concat([{ role, text, ts: Date.now() }]);
    this.setData({ chat: { ...chat, [type]: next } });

    // 自动滚动到底部
    if (type === 'body') this.setData({ chatAnchorBody: 'anchorBody' });
    if (type === 'food') this.setData({ chatAnchorFood: 'anchorFood' });
    if (type === 'stress') this.setData({ chatAnchorStress: 'anchorStress' });
  },

  /* =====================
   * ✅ 回复输入监听（三类）
   * ===================== */
  onReplyInputBody(e) { this.setData({ 'replyInput.body': e.detail.value }); },
  onReplyInputFood(e) { this.setData({ 'replyInput.food': e.detail.value }); },
  onReplyInputStress(e) { this.setData({ 'replyInput.stress': e.detail.value }); },

  /* =====================
   * ✅ 发送回复（回答 AI 追问）
   * ===================== */
  sendBodyReply() {
    if (this.data.loading) return;
    const msg = (this.data.replyInput.body || '').trim();
    if (!msg) { wx.showToast({ title: '按模板回答一句再发～', icon: 'none' }); return; }
    this.setData({ 'replyInput.body': '' });
    this.appendChat('body', 'user', msg);
    if (this.data.useCloud) this.callCloudChatAI('body', msg);
    else this.applyOfflineChatFor('body', '离线模式～');
  },

  sendFoodReply() {
    if (this.data.loading) return;
    const msg = (this.data.replyInput.food || '').trim();
    if (!msg) { wx.showToast({ title: '按模板回答一句再发～', icon: 'none' }); return; }
    this.setData({ 'replyInput.food': '' });
    this.appendChat('food', 'user', msg);
    if (this.data.useCloud) this.callCloudChatAI('food', msg);
    else this.applyOfflineChatFor('food', '离线模式～');
  },

  sendStressReply() {
    if (this.data.loading) return;
    const msg = (this.data.replyInput.stress || '').trim();
    if (!msg) { wx.showToast({ title: '按模板回答一句再发～', icon: 'none' }); return; }
    this.setData({ 'replyInput.stress': '' });
    this.appendChat('stress', 'user', msg);
    if (this.data.useCloud) this.callCloudChatAI('stress', msg);
    else this.applyOfflineChatFor('stress', '离线模式～');
  },

  /* =====================
   * ✅ 结束对话（清空该模块对话并隐藏聊天框）
   * ===================== */
  endBodyChat() { this.endChat('body'); },
  endFoodChat() { this.endChat('food'); },
  endStressChat() { this.endChat('stress'); },

  endChat(type) {
    const chat = this.data.chat || { body: [], food: [], stress: [] };
    const cs = this.data.chatStarted || { body:false, food:false, stress:false };
    const reply = this.data.replyInput || { body:'', food:'', stress:'' };

    this.setData({
      chat: { ...chat, [type]: [] },
      chatStarted: { ...cs, [type]: false },
      replyInput: { ...reply, [type]: '' }
    });

    wx.showToast({ title: '已结束对话', icon: 'none' });
  },

  /* =====================
   * ✅ 调用云函数 ai_analyze（对话模式）
   * - 首次：用表单/文本作为 message
   * - 之后：用 replyInput 作为 message
   * - history：用 chat[type] 最后 10 条
   * ===================== */
  callCloudChatAI(type, userMsg) {
    this.setData({ loading: true, errorMsg: '' });

    const userProfile = app.globalData.userInfo || {};
    const history = (this.data.chat[type] || []).slice(-10);

    wx.cloud.callFunction({
      name: 'ai_analyze',
      data: {
        userProfile,
        targetType: type,
        message: userMsg || '',
        history,
        foodImageUrl: type === 'food' ? (this.data.foodImageFileID || '') : ''
      },
      success: (res) => {
        const r = res.result || {};
        if (r.ok && r.data) {
          const d = r.data || {};
          const reply = (d.assistantReply || '').trim();

          if (reply) {
            this.appendChat(type, 'assistant', reply);
          } else {
            this.appendChat(type, 'assistant', '我收到了～你愿意再补充一句关键细节吗？');
          }

          // 同时更新旧版 result 文本（保持原格式）
          const newResult = { ...this.data.result };
          newResult[type] = (newResult[type] ? newResult[type] : '') + (reply ? `\n\n${reply}` : '');
          this.setData({
            result: newResult,
            loading: false,
            useCloud: true,
            errorMsg: ''
          });
        } else {
          this.applyOfflineChatFor(type, r.msg || '云端 AI 暂时连不上了～ 已自动切换为离线分析。');
        }
      },
      fail: (err) => {
        console.error('调用 ai_analyze 失败：', err);
        this.applyOfflineChatFor(type, '网络好像有点小问题，云端 AI 暂时连不上了～ 已自动切换为离线分析。');
      }
    });
  },

  /* =====================
   * ✅ 离线兜底：回一句，并保持对话形态
   * ===================== */
  applyOfflineChatFor(type, msg) {
    let reply = this.data.offlineResult[type] || '我收到了～你再补充一句关键细节好吗？';

    this.setData({
      loading: false,
      useCloud: false,
      errorMsg: msg || ''
    });

    this.appendChat(type, 'assistant', reply);

    // 同时更新旧版 result 文本
    const newResult = { ...this.data.result };
    newResult[type] = (newResult[type] ? newResult[type] : '') + `\n\n${reply}`;
    this.setData({ result: newResult });
  }
});
