// pages/community/community.js
const app = getApp();

// ✅ 云能力初始化（只一次）
if (wx.cloud && !(app.globalData && app.globalData.__cloudInited__)) {
  wx.cloud.init({
    env: wx.cloud.DYNAMIC_CURRENT_ENV,
    traceUser: true
  });
  app.globalData = app.globalData || {};
  app.globalData.__cloudInited__ = true;
}

const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    currentPanel: "community",
    isAnonymous: false,

    inputWeight: "",
    inputMood: "",
    selectedImage: "",
    imageFileId: "",

    posts: [],
    submitting: false,
    editingId: "",

    // ===== 涨知识：权威科普 =====
    knowledgeLoading: false,
    knowledgeError: "",
    knowledgeList: [],
    knowledgeTab: "official",

    // ===== 详情弹窗 =====
    detailVisible: false,
    detailPost: null,

    // ✅ 评论输入
    commentInput: "",

    // ✅ 回复目标（方案A：扁平结构）
    // { cid, name } 或 null
    replyTarget: null
  },

  onShow() {
    this.loadPosts();
  },

  // ====== 顶部入口：涨知识 / 交流 ======
  goKnowledge() {
    this.setData({ currentPanel: "knowledge" });
    if (this.data.knowledgeTab === "official" && !this.data.knowledgeList.length) {
      this.loadKnowledge(false);
    }
  },

  goCommunity() {
    this.setData({ currentPanel: "community" });
  },

  switchKnowledgeTab(e) {
    const tab = e.currentTarget?.dataset?.tab;
    if (!tab) return;
    if (tab === this.data.knowledgeTab) return;

    this.setData({ knowledgeTab: tab });
    if (tab === "official" && !this.data.knowledgeList.length) {
      this.loadKnowledge(false);
    }
  },

  goFitnessKnowledge() {
    wx.navigateTo({ url: "/pages/fitnessKnowledge/fitnessKnowledge" });
  },

  onPullDownRefresh() {
    if (this.data.currentPanel === "knowledge") {
      if (this.data.knowledgeTab === "official") {
        this.loadKnowledge(true).finally(() => wx.stopPullDownRefresh());
      } else {
        wx.stopPullDownRefresh();
      }
    } else {
      wx.stopPullDownRefresh();
    }
  },

  // ====== 社区发布：匿名开关 ======
  toggleAnonymous() {
    this.setData({ isAnonymous: !this.data.isAnonymous });
  },

  onWeightInput(e) {
    this.setData({ inputWeight: e.detail.value });
  },

  onMoodInput(e) {
    this.setData({ inputMood: e.detail.value });
  },

  // ====== 图片选择 ======
  onChooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const path = res.tempFilePaths[0];
        this.setData({ selectedImage: path });
      }
    });
  },

  clearImage() {
    this.setData({
      selectedImage: "",
      imageFileId: ""
    });
  },

  // ====== 发布/保存（不写 likes/comments 到帖子文档） ======
  async onPost() {
    if (this.data.submitting) return;

    const {
      inputWeight,
      inputMood,
      selectedImage,
      editingId,
      imageFileId,
      isAnonymous
    } = this.data;

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
      let finalFileId = imageFileId;

      const isCloudOrHttp =
        selectedImage &&
        (selectedImage.indexOf("cloud://") === 0 || selectedImage.indexOf("http") === 0);

      const isLocalPath = !!selectedImage && !isCloudOrHttp;

      if (selectedImage && (isLocalPath || !imageFileId)) {
        const cloudPath = `community/${app.globalData.openid}-${Date.now()}.jpg`;
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: selectedImage
        });
        finalFileId = uploadRes.fileID;
      }

      const now = new Date();
      const y = now.getFullYear();
      const m = (now.getMonth() + 1).toString().padStart(2, "0");
      const d = now.getDate().toString().padStart(2, "0");
      const hh = now.getHours().toString().padStart(2, "0");
      const mm = now.getMinutes().toString().padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;
      const timeStr = `${hh}:${mm}`;

      const safeName = isAnonymous ? "" : (user.name || "");
      const safeSchool = isAnonymous ? "" : (user.school || "");

      if (editingId) {
        await db.collection("community_posts").doc(editingId).update({
          data: {
            weight: weightNum,
            mood: inputMood,
            imageFileId: finalFileId || "",
            date: dateStr,
            time: timeStr,
            isAnonymous: !!isAnonymous,
            name: safeName,
            school: safeSchool,
            updatedAt: db.serverDate()
          }
        });
        wx.showToast({ title: "已保存修改", icon: "success" });
      } else {
        await db.collection("community_posts").add({
          data: {
            openid: app.globalData.openid,
            name: safeName,
            school: safeSchool,
            weight: weightNum,
            mood: inputMood,
            imageFileId: finalFileId || "",
            date: dateStr,
            time: timeStr,
            isAnonymous: !!isAnonymous,
            createdAt: db.serverDate()
          }
        });
        wx.showToast({ title: "已发布", icon: "success" });
      }

      wx.hideLoading();

      this.setData({
        inputWeight: "",
        inputMood: "",
        selectedImage: "",
        imageFileId: "",
        editingId: "",
        submitting: false,
        isAnonymous: false
      });

      this.loadPosts();
    } catch (e) {
      console.error("发布失败", e);
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: "发布失败", icon: "none" });
    }
  },

  // ====== 文件ID规范化 / 临时链接 ======
  _normalizeCloudFileId(fid) {
    if (!fid) return "";
    let s = String(fid);
    s = s.replace(/^cloud:\\/i, "cloud://");
    s = s.replace(/cloud:\\/gi, "cloud://");
    return s;
  },

  async _getTempUrlMap(fileIdList) {
    const uniq = Array.from(new Set((fileIdList || []).filter(Boolean)));
    if (!uniq.length) return {};

    try {
      const res = await wx.cloud.getTempFileURL({
        fileList: uniq.map(fid => ({ fileID: fid, maxAge: 60 * 60 }))
      });

      const map = {};
      const list = (res && res.fileList) ? res.fileList : [];
      list.forEach(it => {
        if (it && it.fileID && it.tempFileURL && it.status === 0) {
          map[it.fileID] = it.tempFileURL;
        }
      });
      return map;
    } catch (e) {
      console.error("getTempFileURL失败", e);
      return {};
    }
  },

  _makeNamePreview(arr, max = 2) {
    const names = (arr || [])
      .map(x => (x && x.name ? String(x.name).trim() : "同学"))
      .filter(Boolean);

    if (!names.length) return "";
    const show = names.slice(0, max).join("、");
    if (names.length > max) return `${show} 等`;
    return show;
  },

  _getMyDisplayName() {
    const u = app.globalData.userInfo || {};
    const name = (u.name || "").trim();
    return name || "同学";
  },

  _formatReplyPreview(comment) {
    // 返回用于列表预览的文案：优先展示“某人回复某人”
    if (!comment) return "";
    const n = (comment.name || "同学").trim() || "同学";
    const rt = comment.replyTo && comment.replyTo.name ? String(comment.replyTo.name).trim() : "";
    if (rt) return `${n} 回复 ${rt}`;
    return n;
  },

  // ====== ✅ 加载帖子 + 互动（likes/comments） ======
  async loadPosts() {
    try {
      const res = await db
        .collection("community_posts")
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();

      const myOpenid = app.globalData.openid || "";

      const normalized = res.data.map(p => ({
        ...p,
        imageFileId: this._normalizeCloudFileId(p.imageFileId || "")
      }));

      const fileIds = normalized.map(p => p.imageFileId).filter(Boolean);
      const tempMap = await this._getTempUrlMap(fileIds);

      const postIds = normalized.map(p => p._id).filter(Boolean);
      if (!postIds.length) {
        this.setData({ posts: [] });
        return;
      }

      // likes
      let likesAll = [];
      try {
        const likesRes = await db.collection("likes")
          .where({ postId: _.in(postIds) })
          .limit(2000)
          .get();
        likesAll = likesRes.data || [];
      } catch (e) {
        console.error("load likes fail", e);
        likesAll = [];
      }

      // comments
      let commentsAll = [];
      try {
        const commRes = await db.collection("comments")
          .where({ postId: _.in(postIds) })
          .orderBy("ts", "asc")
          .limit(2000)
          .get();
        commentsAll = commRes.data || [];
      } catch (e) {
        console.error("load comments fail", e);
        commentsAll = [];
      }

      const likeMap = {};
      const commentMap = {};

      likesAll.forEach(lk => {
        const pid = lk.postId;
        if (!pid) return;
        if (!likeMap[pid]) likeMap[pid] = [];
        likeMap[pid].push({
          openid: lk.openid || "",
          name: (lk.name || "同学").trim() || "同学",
          ts: lk.ts || 0
        });
      });

      commentsAll.forEach(cm => {
        const pid = cm.postId;
        if (!pid) return;
        if (!commentMap[pid]) commentMap[pid] = [];
        commentMap[pid].push({
          cid: cm._id || `${cm.openid || "u"}-${cm.ts || Date.now()}`,
          openid: cm.openid || "",
          name: (cm.name || "同学").trim() || "同学",
          content: cm.content || "",
          time: cm.time || "",
          ts: cm.ts || 0,
          // ✅ 回复信息（方案A）
          replyTo: cm.replyTo ? {
            cid: cm.replyTo.cid || "",
            name: (cm.replyTo.name || "").trim()
          } : null
        });
      });

      const posts = normalized.map((p) => {
        const isAnonymous = !!p.isAnonymous;

        const displayName = isAnonymous ? "匿名同学" : ((p.name && p.name.trim()) ? p.name : "同学");
        const displaySchool = isAnonymous ? "" : (p.school || "");

        const avatarText = isAnonymous
          ? "匿"
          : ((displayName && displayName.slice(0, 1)) || "同");

        let weightNum =
          typeof p.weight === "number"
            ? p.weight
            : parseFloat(p.weight);
        if (isNaN(weightNum)) weightNum = null;

        const displayWeight = weightNum == null ? "--" : weightNum.toFixed(1);

        const fid = p.imageFileId || "";
        const tempUrl = fid && tempMap[fid] ? tempMap[fid] : "";

        const likes = likeMap[p._id] || [];
        const comments = commentMap[p._id] || [];

        const likeCount = likes.length;
        const commentCount = comments.length;

        const likedByMe = !!myOpenid && likes.some(x => x.openid === myOpenid);

        const likePreview = likeCount > 0 ? this._makeNamePreview(likes, 2) : "";

        // ✅ 评论预览：优先展示“某人回复某人/某人”
        let commentPreview = "";
        if (commentCount > 0) {
          const last = comments[comments.length - 1];
          commentPreview = this._formatReplyPreview(last);
        }

        return {
          ...p,
          imageFileId: tempUrl,
          isAnonymous,
          avatarText,
          isMine: p.openid === myOpenid,
          displayWeight,
          displayName,
          displaySchool,

          likeCount,
          commentCount,
          likedByMe,
          likePreview,
          commentPreview,

          likeUsers: likes,
          comments: comments
        };
      });

      this.setData({ posts });

      // 刷新详情弹窗
      if (this.data.detailVisible && this.data.detailPost && this.data.detailPost._id) {
        const id = this.data.detailPost._id;
        const found = posts.find(x => x._id === id);
        if (found) this.setData({ detailPost: found });
      }
    } catch (e) {
      console.error("加载社区失败", e);
      if (e.errCode === -502005) {
        wx.showToast({ title: "请创建 community_posts 集合", icon: "none" });
      }
    }
  },

  // ====== 更多操作：编辑/删除 ======
  onMoreTap(e) {
    const { id } = e.currentTarget.dataset;
    const { posts } = this.data;
    const target = posts.find((p) => p._id === id);
    if (!target) return;

    wx.showActionSheet({
      itemList: ["编辑这条记录", "删除"],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.enterEditMode(target);
        } else if (res.tapIndex === 1) {
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
      selectedImage: "",
      imageFileId: "",
      isAnonymous: !!post.isAnonymous
    });

    wx.showToast({ title: "已载入内容，可修改后再次点击发布", icon: "none" });
  },

  async deletePost(id) {
    wx.showModal({
      title: "确认删除",
      content: "确定要删除这条小记吗？",
      confirmText: "删除",
      confirmColor: "#1e88e5",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await db.collection("community_posts").doc(id).remove();

          // 同步删除互动（可选）
          try {
            const likesRes = await db.collection("likes").where({ postId: id }).limit(2000).get();
            const likeDocs = likesRes.data || [];
            await Promise.all(likeDocs.map(x => db.collection("likes").doc(x._id).remove()));
          } catch (e) { console.warn("delete likes ignore", e); }

          try {
            const commRes = await db.collection("comments").where({ postId: id }).limit(2000).get();
            const commDocs = commRes.data || [];
            await Promise.all(commDocs.map(x => db.collection("comments").doc(x._id).remove()));
          } catch (e) { console.warn("delete comments ignore", e); }

          wx.showToast({ title: "已删除", icon: "success" });

          if (this.data.detailVisible && this.data.detailPost && this.data.detailPost._id === id) {
            this.setData({
              detailVisible: false,
              detailPost: null,
              commentInput: "",
              replyTarget: null
            });
          }

          this.loadPosts();
        } catch (e) {
          console.error("删除失败", e);
          wx.showToast({ title: "删除失败", icon: "none" });
        }
      }
    });
  },

  // ================== ✅ 详情弹窗 ==================
  noop() {},

  openPostDetail(e) {
    const idx = e.currentTarget?.dataset?.idx;
    const post = (typeof idx === "number") ? this.data.posts[idx] : null;
    if (!post) return;
    this.setData({
      detailVisible: true,
      detailPost: post,
      commentInput: "",
      replyTarget: null
    });
  },

  closeDetail() {
    this.setData({
      detailVisible: false,
      detailPost: null,
      commentInput: "",
      replyTarget: null
    });
  },

  onCommentInput(e) {
    this.setData({ commentInput: e.detail.value });
  },

  // ✅ 点“回复”某条评论（方案A）
  onReplyTap(e) {
    const c = e.currentTarget?.dataset?.c;
    if (!c) return;
    const target = {
      cid: c.cid || "",
      name: (c.name || "同学").trim() || "同学"
    };
    this.setData({
      replyTarget: target
    });
  },

  // ✅ 取消回复
  cancelReply() {
    this.setData({ replyTarget: null });
  },

  // ================== ✅ 点赞：写入 likes 集合 ==================
  async toggleLike(e) {
    const id = e.currentTarget?.dataset?.id;
    if (!id) return;
    await this._toggleLikeById(id);
  },

  async toggleLikeFromDetail(e) {
    const id = e.currentTarget?.dataset?.id;
    if (!id) return;
    await this._toggleLikeById(id);
  },

  async _toggleLikeById(postId) {
    const myOpenid = app.globalData.openid || "";
    if (!myOpenid) {
      wx.showToast({ title: "请先登录后再点赞", icon: "none" });
      return;
    }

    const myName = this._getMyDisplayName();
    wx.showLoading({ title: "处理中...", mask: true });

    try {
      const existRes = await db.collection("likes")
        .where({ postId, openid: myOpenid })
        .limit(1)
        .get();

      const exist = (existRes.data && existRes.data.length) ? existRes.data[0] : null;

      if (exist) {
        await db.collection("likes").doc(exist._id).remove();
        wx.hideLoading();
        wx.showToast({ title: "已取消点赞", icon: "success" });
      } else {
        await db.collection("likes").add({
          data: {
            postId,
            openid: myOpenid,
            name: myName,
            ts: Date.now()
          }
        });
        wx.hideLoading();
        wx.showToast({ title: "已点赞", icon: "success" });
      }

      await this.loadPosts();
    } catch (err) {
      console.error("toggleLike error", err);
      wx.hideLoading();
      wx.showToast({ title: "操作失败", icon: "none" });
    }
  },

  // ================== ✅ 评论：写入 comments 集合（支持 replyTo） ==================
  async submitComment(e) {
    const postId = e.currentTarget?.dataset?.id;
    if (!postId) return;

    const myOpenid = app.globalData.openid || "";
    if (!myOpenid) {
      wx.showToast({ title: "请先登录后再评论", icon: "none" });
      return;
    }

    const content = (this.data.commentInput || "").trim();
    if (!content) {
      wx.showToast({ title: "请输入评论内容", icon: "none" });
      return;
    }

    const myName = this._getMyDisplayName();

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const timeStr = `${y}-${m}-${d} ${hh}:${mm}`;

    const rt = this.data.replyTarget;
    const replyTo = rt ? { cid: rt.cid || "", name: (rt.name || "").trim() } : null;

    wx.showLoading({ title: "发送中...", mask: true });

    try {
      await db.collection("comments").add({
        data: {
          postId,
          openid: myOpenid,
          name: myName,
          content,
          time: timeStr,
          ts: Date.now(),
          replyTo: replyTo // ✅ 关键新增
        }
      });

      wx.hideLoading();
      wx.showToast({ title: "已评论", icon: "success" });

      this.setData({ commentInput: "", replyTarget: null });
      await this.loadPosts();
    } catch (err) {
      console.error("submitComment error", err);
      wx.hideLoading();
      wx.showToast({ title: "评论失败", icon: "none" });
    }
  },

  // ====== 权威科普：调用云函数 ======
  async loadKnowledge(force) {
    if (this.data.knowledgeLoading) return;
    if (!force && this.data.knowledgeList.length) return;

    this.setData({ knowledgeLoading: true, knowledgeError: "" });

    try {
      const res = await wx.cloud.callFunction({
        name: "knowledgeFeed",
        data: { limit: 10 }
      });

      const list = (res && res.result && res.result.list) ? res.result.list : [];

      this.setData({
        knowledgeList: list,
        knowledgeLoading: false,
        knowledgeError: list.length ? "" : "暂无内容（下拉或点击刷新试试）"
      });
    } catch (e) {
      console.error("loadKnowledge fail", e);
      this.setData({
        knowledgeError: "加载失败：请检查云函数 knowledgeFeed 是否已上传并部署",
        knowledgeLoading: false
      });
    }
  },

  refreshKnowledge() {
    this.loadKnowledge(true);
  },

  copyLink(e) {
    const link = e.currentTarget.dataset.link || "";
    if (!link) return;
    wx.setClipboardData({
      data: link,
      success: () => wx.showToast({ title: "链接已复制", icon: "success" })
    });
  }
});
