// pages/home/home.js
const app = getApp();

Page({
  data: {
    userInfo: {
      name: "",
      height: ""
    },
    todayWeight: "",
    todayBMI: "",
    bmiPercent: 0,
    todayTip: "今天还没有记录体重呢，点击下面“记录体重”开始吧～",

    // 当前时间段：早晨 / 中午 / 下午 / 晚上
    timePeriod: "早晨",

    // 当前要显示的一组温柔建议 & 菜谱（根据时间段自动切换）
    currentCare: null,
    currentDiet: null,

    // —— 温柔建议：按时间段分组 ——
    careByTime: [
      {
        key: "morning",
        label: "早晨",
        items: [
          "起床先喝一杯温水，轻轻把身体叫醒。",
          "做 3 分钟伸展或深呼吸，让脑袋慢慢清醒。",
          "对镜子里的自己说一句“今天也要温柔对待自己”。"
        ]
      },
      {
        key: "noon",
        label: "中午",
        items: [
          "午餐七分饱，留一点轻盈给下午的自己。",
          "如果可以的话，午后闭目休息 10 分钟。",
          "别忘了抬头看看窗外，让眼睛和大脑都换个场景。"
        ]
      },
      {
        key: "afternoon",
        label: "下午",
        items: [
          "长时间用电脑时，每 45 分钟起身走一走。",
          "感到烦躁时，先缓一缓，再决定要不要继续硬撑。",
          "给自己一小块水果或坚果，而不是只靠含糖饮料。"
        ]
      },
      {
        key: "night",
        label: "晚上",
        items: [
          "晚饭后可以试试轻量散步或拉伸，让身体慢慢放松。",
          "睡前一小时减少刷手机，让大脑进入休息模式。",
          "写一句“今天值得被记住的小事”，对今天说声辛苦啦。"
        ]
      }
    ],

    // —— 菜谱推荐：按时间段分组 ——
    dietByTime: [
      {
        key: "morning",
        label: "早晨 · 早餐推荐",
        items: [
          "燕麦片 + 鸡蛋 + 牛奶：优质蛋白 + 复合碳水，饱腹感更持久。",
          "全麦吐司 + 酸奶 + 一个水果：简单好做，又兼顾纤维和钙。",
          "如果赶时间：一杯无糖酸奶 + 一根香蕉，也比空腹好多啦。"
        ]
      },
      {
        key: "noon",
        label: "中午 · 正餐推荐",
        items: [
          "一份主食（米饭/杂粮饭）+ 一份蛋白（鸡胸/鱼/瘦肉）+ 双份蔬菜。",
          "尽量少选油炸、奶茶，给下午的精力留一点空间。",
          "可以把酱料单独放，自己控制用量，避免“隐形油盐”。"
        ]
      },
      {
        key: "afternoon",
        label: "下午 · 小加餐",
        items: [
          "适量坚果（10 粒左右）+ 温水，比饼干更友好。",
          "一份水果（橙子/苹果/莓果），补充维 C 和纤维。",
          "如果很困，可以来一小杯咖啡，但尽量不要太晚。"
        ]
      },
      {
        key: "night",
        label: "晚上 · 晚餐 & 宵夜",
        items: [
          "晚餐控制主食量，多蔬菜 + 少油烹饪（清蒸、炖、焯）。",
          "尽量在睡前 3 小时结束进食，让身体好好休息。",
          "若真的想吃宵夜，可以选择一小杯温牛奶或无糖酸奶。"
        ]
      }
    ]
  },

  onLoad() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;

    this.setData({
      currentYear: year,
      currentMonth: month
    });

    // 根据当前时间，更新 timePeriod + 当前建议/菜谱
    this.updateTimeBlocks();

    // 先用全局缓存，如果没有再查库
    if (app.globalData.userInfo) {
      this.setData({ userInfo: app.globalData.userInfo });
    } else {
      this.fetchUserInfoFromDB();
    }

    this.loadTodayInfo();
  },

  // 回到首页时，也重新根据时间刷新一次
  onShow() {
    if (app.globalData.userInfo) {
      this.setData({ userInfo: app.globalData.userInfo });
    }
    this.updateTimeBlocks();
    this.loadTodayInfo();
  },

  /* ========= 根据手机时间选择当前建议 & 菜谱 ========= */
  updateTimeBlocks() {
    const now = new Date();
    const hour = now.getHours();

    let key = "morning";
    let label = "早晨";

    if (hour >= 11 && hour < 14) {
      key = "noon";
      label = "中午";
    } else if (hour >= 14 && hour < 18) {
      key = "afternoon";
      label = "下午";
    } else if (hour >= 18 || hour < 5) {
      key = "night";
      label = "晚上";
    }

    const care = this.data.careByTime.find(c => c.key === key) || this.data.careByTime[0];
    const diet = this.data.dietByTime.find(d => d.key === key) || this.data.dietByTime[0];

    this.setData({
      timePeriod: label,
      currentCare: care,
      currentDiet: diet
    });
  },

  /* ========= 一、用户信息 ========= */
  async fetchUserInfoFromDB() {
    const openid = app.globalData.openid;
    if (!openid) return;
    const db = wx.cloud.database();
    try {
      const res = await db.collection("users").where({ openid }).get();
      if (res.data.length) {
        const u = res.data[0];
        const name = u.nickname || u.name || "同学";
        const height = u.height || "";
        const userInfo = { name, height };
        this.setData({ userInfo });
        app.globalData.userInfo = userInfo;
      }
    } catch (e) {
      console.error("加载用户信息失败", e);
    }
  },

  /* ========= 二、今日体重 & BMI ========= */
  async loadTodayInfo() {
    if (!app.globalData.openid) return;
    const db = wx.cloud.database();
    const today = new Date();
    const todayStr = this.formatDate(
      today.getFullYear(),
      today.getMonth() + 1,
      today.getDate()
    );

    try {
      const res = await db
        .collection("weights")
        .where({
          openid: app.globalData.openid,
          date: todayStr
        })
        .get();

      if (res.data.length) {
        const w = res.data[0].weight;
        const height = Number(this.data.userInfo.height || 0);
        let bmi = "";
        let percent = 0;
        if (height && w) {
          const hMeter = height / 100;
          bmi = (w / (hMeter * hMeter)).toFixed(1);
          percent = Math.max(0, Math.min(100, (bmi / 30) * 100));
        }
        this.setData({
          todayWeight: w,
          todayBMI: bmi || "",
          bmiPercent: percent,
          todayTip: "已记录今日体重，继续保持温柔的生活节奏～"
        });
      } else {
        this.setData({
          todayWeight: "",
          todayBMI: "",
          bmiPercent: 0,
          todayTip: "今天还没有记录体重呢，点击下面“记录体重”开始吧～"
        });
      }
    } catch (e) {
      console.error("加载今日体重失败", e);
    }
  },

  formatDate(year, month, day) {
    const d = new Date(year, month - 1, day);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const dd = d.getDate();
    return `${y}-${m.toString().padStart(2, "0")}-${dd
      .toString()
      .padStart(2, "0")}`;
  },

  /* ========= 三、跳转 ========= */
  goRecord() {
    wx.navigateTo({
      url: "/pages/record/record"
    });
  },

  goWorkoutPlan() {
    wx.navigateTo({
      url: "/pages/workout/workout"
    });
  },

  goDiet() {
    wx.navigateTo({
      url: "/pages/workout/workout"
    });
  }
});
