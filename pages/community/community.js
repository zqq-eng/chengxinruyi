// pages/community/community.js
const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    // 发布表单
    inputWeight: "",
    inputMood: "",
    selectedImage: "",     // 预览图本地临时路径
    imageFileId: "",       // 已上传到云存储的 fileID

    // 列表
    posts: [],

    // 是否正在提交（防止连点）
    submitting: false,

    // 当前是否在“编辑模式”
    editingId: ""          // 为空表示新发布；有值表示编辑该 _id
  },

  onShow() {
    this.loadPosts();
  },

  /* ========== 表单输入 ========== */
  onWeightInput(e) {
    this.setData({ inputWeight: e.detail.value });
  },

  onMoodInput(e) {
    this.setData({ inputMood: e.detail.value });
  },

  // 选择图片
  onChooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const path = res.tempFilePaths[0];
        this.setData({
          selectedImage: path
        });
      }
    });
  },

  // 清除已选图片
  clearImage() {
    this.setData({
      selectedImage: "",
      imageFileId: ""
    });
  },

  /* ========== 发布 / 编辑 ========== */
  async onPost() {
    if (this.data.submitting) return;

    const { inputWeight, inputMood, selectedImage, editingId, imageFileId } = this.data;

    // 1. 校验体重
    const weightNum = parseFloat(inputWeight);
    if (isNaN(weightNum)) {
      wx.showToast({ title: "请输入正确的体重", icon: "none" });
      return;
    }

    const user = app.globalData.userInfo || {};
    if (!app.globalData.openid) {
      wx.showToast({ title: "请先登录后再发布", icon: "none" });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: editingId ? "保存中..." : "发布中...", mask: true });

    try {
      // 2. 如果选择了本地图片但还没上传，则先上传到云存储
      let finalFileId = imageFileId;
      if (selectedImage && (!imageFileId || editingId)) {
        const cloudPath = `community/${app.globalData.openid}-${Date.now()}.jpg`;
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: selectedImage
        });
        finalFileId = uploadRes.fileID;
      }

      // 3. 生成时间
      const now = new Date();
      const y = now.getFullYear();
      const m = (now.getMonth() + 1).toString().padStart(2, "0");
      const d = now.getDate().toString().padStart(2, "0");
      const hh = now.getHours().toString().padStart(2, "0");
      const mm = now.getMinutes().toString().padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;
      const timeStr = `${hh}:${mm}`;

      if (editingId) {
        // ========== 编辑已有记录 ==========
        await db.collection("community_posts").doc(editingId).update({
          data: {
            weight: weightNum,
            mood: inputMood,
            imageFileId: finalFileId || "",
            // 更新时间
            date: dateStr,
            time: timeStr,
            updatedAt: db.serverDate()
          }
        });

        wx.showToast({ title: "已保存修改", icon: "success" });
      } else {
        // ========== 新发布 ==========
        await db.collection("community_posts").add({
          data: {
            openid: app.globalData.openid,
            name: user.name || "",
            school: user.school || "",
            weight: weightNum,          // ✅ 数字形式保存
            mood: inputMood,
            imageFileId: finalFileId || "",
            date: dateStr,
            time: timeStr,
            createdAt: db.serverDate()
          }
        });

        wx.showToast({ title: "已发布", icon: "success" });
      }

      wx.hideLoading();

      // 重置表单
      this.setData({
        inputWeight: "",
        inputMood: "",
        selectedImage: "",
        imageFileId: "",
        editingId: "",
        submitting: false
      });

      this.loadPosts();
    } catch (e) {
      console.error("发布失败", e);
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: "发布失败", icon: "none" });
    }
  },

  /* ========== 加载列表 ========== */
  async loadPosts() {
    try {
      const res = await db
        .collection("community_posts")
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();

      const myOpenid = app.globalData.openid || "";

      const posts = res.data.map((p) => {
        // 头像文字
        const avatarText =
          (p.name && p.name.slice(0, 1)) || "同";

        // 处理体重显示，防止 null
        let weightNum =
          typeof p.weight === "number"
            ? p.weight
            : parseFloat(p.weight);
        if (isNaN(weightNum)) weightNum = null;

        const displayWeight = weightNum == null
          ? "--"
          : weightNum.toFixed(1);

        return {
          ...p,
          avatarText,
          isMine: p.openid === myOpenid,
          displayWeight
        };
      });

      this.setData({ posts });
    } catch (e) {
      console.error("加载社区失败", e);
      if (e.errCode === -502005) {
        wx.showToast({
          title: "请在云开发中创建 community_posts 集合",
          icon: "none"
        });
      }
    }
  },

  /* ========== 编辑 / 删除入口 ========== */
  onMoreTap(e) {
    const { id } = e.currentTarget.dataset;
    const { posts } = this.data;
    const target = posts.find((p) => p._id === id);
    if (!target) return;

    wx.showActionSheet({
      itemList: ["编辑这条记录", "删除"],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 编辑
          this.enterEditMode(target);
        } else if (res.tapIndex === 1) {
          // 删除
          this.deletePost(target._id);
        }
      }
    });
  },

  enterEditMode(post) {
    this.setData({
      editingId: post._id,
      inputWeight: post.weight != null ? String(post.weight) : "",
      inputMood: post.mood || "",
      selectedImage: post.imageFileId || "",
      imageFileId: post.imageFileId || ""
    });

    wx.showToast({
      title: "已载入内容，可修改后再次点击发布",
      icon: "none"
    });
  },

  async deletePost(id) {
    wx.showModal({
      title: "确认删除",
      content: "确定要删除这条小记吗？",
      confirmText: "删除",
      confirmColor: "#ff4f9a",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await db.collection("community_posts").doc(id).remove();
          wx.showToast({ title: "已删除", icon: "success" });
          this.loadPosts();
        } catch (e) {
          console.error("删除失败", e);
          wx.showToast({ title: "删除失败", icon: "none" });
        }
      }
    });
  }
});
