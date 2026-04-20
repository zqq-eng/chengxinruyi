// pages/adminMall/adminMall.js
const db = wx.cloud.database();
const _ = db.command;

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function pad2(x) { return String(x).padStart(2, "0"); }
function nowStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

Page({
  data: {
    tab: "goods", // goods | orders | notify
    loading: true,

    // 商品
    goods: [],
    showGoodsEditor: false,
    editMode: "add", // add | edit
    form: {
      _id: "",
      title: "",
      subtitle: "",
      type: "time",   // time | dist | both
      costMin: 1,     // ✅ 分钟（编辑用）最低=1
      costKm: 1,      // ✅ km 最低=1
      tag: "",
      sort: 10,
      active: true
    },

    // 订单
    ordersLoading: false,
    ordersTab: "pending", // pending | approved | rejected | shipped
    orders: [],
    orderDetailVisible: false,
    curOrder: null,
    shipText: "",

    // 通知
    notifyVisible: false,
    notifyTitle: "",
    notifyContent: "",
    notifyTarget: "all", // all | one | selected
    notifyOpenid: "",
    notifyType: "通知",

    // ✅ 选择用户发送：用户列表（云函数拉取）
    notifyUsersLoading: false,
    notifyUsers: [],
    notifySelectedOpenids: [],
  },

  onShow() {
    this.refreshAll();
  },

  async refreshAll() {
    this.setData({ loading: true });
    try {
      await Promise.all([this.loadGoods(), this.loadOrders()]);
      this.setData({ loading: false });
    } catch (e) {
      console.error(e);
      this.setData({ loading: false });
      wx.showToast({ title: "后台加载失败", icon: "none" });
    }
  },

  // ✅ 阻止弹层点击冒泡
  stopTap() {},

  /* ========== tab 切换 ========== */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab) return;
    this.setData({ tab });
    if (tab === "orders") this.loadOrders();
    if (tab === "goods") this.loadGoods();
  },

  /* ========== 1) 商品管理 ========== */
  async loadGoods() {
    try {
      const res = await db.collection("mall_goods")
        .orderBy("sort", "asc")
        .orderBy("updatedAt", "desc")
        .limit(200)
        .get();

      // active=true 排前面（前端排序更稳定）
      const list = (res.data || []).slice().sort((a, b) => {
        const aa = a.active !== false ? 1 : 0;
        const bb = b.active !== false ? 1 : 0;
        if (aa !== bb) return bb - aa;
        return n(a.sort) - n(b.sort);
      });

      this.setData({ goods: list });
    } catch (e) {
      const msg = (e && e.errMsg) || "";
      if (msg.includes("collection not exists") || (e && e.errCode === -502005)) {
        this.setData({ goods: [] });
        wx.showToast({ title: "请先创建 mall_goods 集合", icon: "none" });
        return;
      }
      console.error("loadGoods error", e);
      wx.showToast({ title: "商品加载失败", icon: "none" });
    }
  },

  openAddGoods() {
    this.setData({
      showGoodsEditor: true,
      editMode: "add",
      form: {
        _id: "",
        title: "",
        subtitle: "",
        type: "time",
        costMin: 1,
        costKm: 1,
        tag: "时长兑换",
        sort: 10,
        active: true
      }
    });
  },

  openEditGoods(e) {
    const id = e.currentTarget.dataset.id;
    const item = (this.data.goods || []).find(x => x._id === id);
    if (!item) return;

    const type = item.type || "time";
    const costSec = n(item.costSec);
    const costMin = costSec ? Math.max(0, Math.round(costSec / 60)) : 0;

    this.setData({
      showGoodsEditor: true,
      editMode: "edit",
      form: {
        _id: item._id,
        title: item.title || "",
        subtitle: item.subtitle || "",
        type,
        costMin: type === "dist" ? 0 : (costMin || 1),
        costKm: type === "time" ? 0 : (n(item.costKm) || 1),
        tag: item.tag || (type === "time" ? "时长兑换" : type === "dist" ? "距离兑换" : "双条件"),
        sort: n(item.sort) || 10,
        active: item.active !== false
      }
    });
  },

  closeGoodsEditor() {
    this.setData({ showGoodsEditor: false });
  },

  onFormTitle(e) { this.setData({ "form.title": e.detail.value }); },
  onFormSub(e) { this.setData({ "form.subtitle": e.detail.value }); },
  onFormType(e) {
    const type = e.detail.value;
    const tag = type === "time" ? "时长兑换" : type === "dist" ? "距离兑换" : "双条件";
    this.setData({
      "form.type": type,
      "form.tag": tag,
      "form.costMin": type === "dist" ? 0 : Math.max(1, n(this.data.form.costMin) || 1),
      "form.costKm": type === "time" ? 0 : Math.max(1, n(this.data.form.costKm) || 1)
    });
  },
  onFormMin(e) { this.setData({ "form.costMin": n(e.detail.value) }); },
  onFormKm(e) { this.setData({ "form.costKm": n(e.detail.value) }); },
  onFormTag(e) { this.setData({ "form.tag": e.detail.value }); },
  onFormSort(e) { this.setData({ "form.sort": n(e.detail.value) }); },

  onFormActive(e) {
    const v = e.detail && typeof e.detail.value !== "undefined" ? e.detail.value : e.detail;
    const active = Array.isArray(v) ? v.length > 0 : !!v;
    this.setData({ "form.active": active });
  },

  async saveGoods() {
    const f = this.data.form || {};
    const title = (f.title || "").trim();
    const subtitle = (f.subtitle || "").trim();
    const type = f.type || "time";
    const tag = (f.tag || "").trim();
    const sort = n(f.sort) || 10;
    const active = f.active !== false;

    if (!title) return wx.showToast({ title: "请填写商品名称", icon: "none" });

    const costMin = n(f.costMin);
    const costKm = n(f.costKm);

    let costSec = 0;
    let finalKm = 0;

    if (type === "time") {
      if (costMin < 1) return wx.showToast({ title: "时长兑换不能小于 1 分钟", icon: "none" });
      costSec = Math.round(costMin * 60);
      finalKm = 0;
    } else if (type === "dist") {
      if (costKm < 1) return wx.showToast({ title: "距离兑换不能小于 1 km", icon: "none" });
      costSec = 0;
      finalKm = costKm;
    } else {
      if (costMin < 1) return wx.showToast({ title: "时长不能小于 1 分钟", icon: "none" });
      if (costKm < 1) return wx.showToast({ title: "距离不能小于 1 km", icon: "none" });
      costSec = Math.round(costMin * 60);
      finalKm = costKm;
    }

    try {
      wx.showLoading({ title: "保存中..." });

      const data = {
        title,
        subtitle,
        type,
        tag,
        sort,
        active,
        costSec,
        costKm: finalKm,
        updatedAt: db.serverDate(),
      };

      if (this.data.editMode === "add") {
        data.createdAt = db.serverDate();
        await db.collection("mall_goods").add({ data });
      } else {
        const id = f._id;
        if (!id) throw new Error("缺少商品ID");
        await db.collection("mall_goods").doc(id).update({ data });
      }

      wx.hideLoading();
      wx.showToast({ title: "保存成功", icon: "success" });
      this.setData({ showGoodsEditor: false });
      await this.loadGoods();

      // ✅ 保存后提醒用户（站内信）
      await this.sendInboxToAll(
        "商品更新",
        `商城商品信息已更新（${nowStr()}），请进入【商城】查看最新兑换规则与礼品。`,
        "通知"
      );

    } catch (e) {
      console.error("saveGoods error", e);
      wx.hideLoading();
      wx.showToast({ title: "保存失败", icon: "none" });
    }
  },

  async toggleGoodsActive(e) {
    const id = e.currentTarget.dataset.id;
    const item = (this.data.goods || []).find(x => x._id === id);
    if (!item) return;
    try {
      await db.collection("mall_goods").doc(id).update({
        data: { active: !(item.active !== false), updatedAt: db.serverDate() }
      });
      await this.loadGoods();
    } catch (e) {
      console.error(e);
      wx.showToast({ title: "操作失败", icon: "none" });
    }
  },

  async removeGoods(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;

    wx.showModal({
      title: "确认删除",
      content: "删除后用户端将不再显示该商品（不可恢复）",
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await db.collection("mall_goods").doc(id).remove();
          wx.showToast({ title: "已删除", icon: "success" });
          await this.loadGoods();
        } catch (e) {
          console.error(e);
          wx.showToast({ title: "删除失败", icon: "none" });
        }
      }
    });
  },

  /* ========== 2) 订单审核/发货 ========== */
  switchOrdersTab(e) {
    const t = e.currentTarget.dataset.tab;
    if (!t) return;
    this.setData({ ordersTab: t }, () => this.loadOrders());
  },

  async loadOrders() {
    this.setData({ ordersLoading: true });
    try {
      const status = this.data.ordersTab;
      const res = await db.collection("mall_orders")
        .where({ status })
        .orderBy("createdAt", "desc")
        .limit(200)
        .get();

      this.setData({ ordersLoading: false, orders: res.data || [] });
    } catch (e) {
      const msg = (e && e.errMsg) || "";
      if (msg.includes("collection not exists") || (e && e.errCode === -502005)) {
        this.setData({ ordersLoading: false, orders: [] });
        wx.showToast({ title: "请先创建 mall_orders 集合", icon: "none" });
        return;
      }
      console.error("loadOrders error", e);
      this.setData({ ordersLoading: false, orders: [] });
      wx.showToast({ title: "订单加载失败", icon: "none" });
    }
  },

  openOrderDetail(e) {
    const id = e.currentTarget.dataset.id;
    const item = (this.data.orders || []).find(x => x._id === id);
    if (!item) return;
    this.setData({ orderDetailVisible: true, curOrder: item, shipText: "" });
  },

  closeOrderDetail() {
    this.setData({ orderDetailVisible: false, curOrder: null, shipText: "" });
  },

  onShipText(e) { this.setData({ shipText: e.detail.value }); },

  async approveOrder() {
    const o = this.data.curOrder;
    if (!o) return;
    try {
      wx.showLoading({ title: "处理中..." });

      await db.collection("mall_orders").doc(o._id).update({
        data: { status: "approved", adminNote: "审核通过", updatedAt: db.serverDate() }
      });

      const oid = o.openid || o._openid;
      await this.sendInboxToOne(oid, "兑换审核通过", `你的兑换【${o.itemTitle}】已审核通过，我们会尽快安排发货/发券。`, "兑换通知");

      wx.hideLoading();
      wx.showToast({ title: "已通过", icon: "success" });
      this.closeOrderDetail();
      await this.loadOrders();
    } catch (e) {
      console.error(e);
      wx.hideLoading();
      wx.showToast({ title: "操作失败", icon: "none" });
    }
  },

  async rejectOrder() {
    const o = this.data.curOrder;
    if (!o) return;

    const reason = (this.data.shipText || "").trim() || "信息不完整/不符合兑换规则";

    wx.showModal({
      title: "驳回订单",
      content: `确认驳回？原因：${reason}`,
      success: async (r) => {
        if (!r.confirm) return;
        try {
          wx.showLoading({ title: "处理中..." });

          await db.collection("mall_orders").doc(o._id).update({
            data: { status: "rejected", adminNote: reason, updatedAt: db.serverDate() }
          });

          const oid = o.openid || o._openid;
          await this.sendInboxToOne(oid, "兑换审核未通过", `你的兑换【${o.itemTitle}】未通过审核：${reason}。可修改信息后重新提交。`, "兑换通知");

          wx.hideLoading();
          wx.showToast({ title: "已驳回", icon: "success" });
          this.closeOrderDetail();
          await this.loadOrders();
        } catch (e) {
          console.error(e);
          wx.hideLoading();
          wx.showToast({ title: "操作失败", icon: "none" });
        }
      }
    });
  },

  async markShipped() {
    const o = this.data.curOrder;
    if (!o) return;

    const shipText = (this.data.shipText || "").trim();
    if (!shipText) {
      wx.showToast({ title: "请填写发货/发券信息", icon: "none" });
      return;
    }

    try {
      wx.showLoading({ title: "处理中..." });

      await db.collection("mall_orders").doc(o._id).update({
        data: {
          status: "shipped",
          shipText,
          updatedAt: db.serverDate()
        }
      });

      const oid = o.openid || o._openid;
      await this.sendInboxToOne(oid, "发货/发券提醒", `你的【${o.itemTitle}】已安排：${shipText}。`, "发货通知");

      wx.hideLoading();
      wx.showToast({ title: "已提醒用户", icon: "success" });
      this.closeOrderDetail();
      await this.loadOrders();
    } catch (e) {
      console.error(e);
      wx.hideLoading();
      wx.showToast({ title: "操作失败", icon: "none" });
    }
  },

  /* ========== 3) 通知 ========== */
  openNotifyAll() {
    this.setData({
      notifyVisible: true,
      notifyTarget: "all",
      notifyOpenid: "",
      notifyTitle: "",
      notifyContent: "",
      notifyType: "通知",
      notifySelectedOpenids: []
    });
  },

  openNotifyOne(e) {
    const openid = e.currentTarget.dataset.openid;
    this.setData({
      notifyVisible: true,
      notifyTarget: "one",
      notifyOpenid: openid || "",
      notifyTitle: "",
      notifyContent: "",
      notifyType: "通知",
      notifySelectedOpenids: []
    });
  },

  // ✅ 打开批量选择
  async openNotifySelected() {
    this.setData({
      notifyVisible: true,
      notifyTarget: "selected",
      notifyOpenid: "",
      notifyTitle: "",
      notifyContent: "",
      notifyType: "通知",
      notifySelectedOpenids: []
    });

    // 没加载过就拉取
    if (!this.data.notifyUsers || this.data.notifyUsers.length === 0) {
      await this.loadNotifyUsersByCloud();
    }
  },

  closeNotify() {
    this.setData({ notifyVisible: false });
  },

  onNotifyTitle(e) { this.setData({ notifyTitle: e.detail.value }); },
  onNotifyContent(e) { this.setData({ notifyContent: e.detail.value }); },

  // ✅ 云函数拉 users：并给每个用户加 _checked
  async loadNotifyUsersByCloud() {
    this.setData({ notifyUsersLoading: true });

    try {
      let all = [];
      let skip = 0;
      const limit = 200;

      while (true) {
        const res = await wx.cloud.callFunction({
          name: "adminGetUsers",
          data: {
            skip,
            limit,
            adminToken: wx.getStorageSync("adminToken") || ""
          }
        });

        const ret = (res && res.result) || {};
        if (!ret.ok) throw new Error(ret.errMsg || "adminGetUsers failed");

        const list = ret.list || [];
        all = all.concat(list);

        if (!ret.hasMore) break;
        skip = ret.nextSkip || (skip + list.length);
        if (skip > 5000) break;
      }

      const withChecked = (all || []).map(u => ({ ...u, _checked: false }));
      this.setData({
        notifyUsers: withChecked,
        notifyUsersLoading: false,
        notifySelectedOpenids: []
      });
    } catch (e) {
      console.error("loadNotifyUsersByCloud error", e);
      this.setData({ notifyUsers: [], notifyUsersLoading: false, notifySelectedOpenids: [] });
      wx.showToast({ title: "加载用户失败", icon: "none" });
    }
  },

  // ✅ 点击一行切换 _checked，并同步 notifySelectedOpenids（保证 UI 一定更新）
  toggleNotifySelectUser(e) {
    const openid = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.openid) || "";
    if (!openid) return;

    const users = (this.data.notifyUsers || []).slice();
    const idx = users.findIndex(u => (u.openid || u._openid) === openid);
    if (idx < 0) return;

    users[idx]._checked = !users[idx]._checked;

    const selected = users
      .filter(u => u._checked)
      .map(u => u.openid || u._openid)
      .filter(Boolean);

    this.setData({
      notifyUsers: users,
      notifySelectedOpenids: selected
    });
  },

  selectAllNotifyUsers() {
    const users = (this.data.notifyUsers || []).slice().map(u => ({ ...u, _checked: true }));
    const selected = users.map(u => u.openid || u._openid).filter(Boolean);
    this.setData({ notifyUsers: users, notifySelectedOpenids: selected });
  },

  clearAllNotifyUsers() {
    const users = (this.data.notifyUsers || []).slice().map(u => ({ ...u, _checked: false }));
    this.setData({ notifyUsers: users, notifySelectedOpenids: [] });
  },

  async submitNotify() {
    const title = (this.data.notifyTitle || "").trim();
    const content = (this.data.notifyContent || "").trim();
    const type = (this.data.notifyType || "通知").trim();

    if (!title) return wx.showToast({ title: "请填写标题", icon: "none" });
    if (!content) return wx.showToast({ title: "请填写内容", icon: "none" });

    try {
      wx.showLoading({ title: "发送中..." });

      if (this.data.notifyTarget === "one") {
        const openid = (this.data.notifyOpenid || "").trim();
        if (!openid) throw new Error("缺少 openid");
        await this.sendInboxToOne(openid, title, content, type);
      } else if (this.data.notifyTarget === "selected") {
        const oids = (this.data.notifySelectedOpenids || []).filter(Boolean);
        if (oids.length === 0) {
          wx.hideLoading();
          return wx.showToast({ title: "请至少选择 1 个用户", icon: "none" });
        }
        await this.sendInboxToOpenids(oids, title, content, type);
      } else {
        await this.sendInboxToAll(title, content, type);
      }

      wx.hideLoading();
      wx.showToast({ title: "已发送站内信", icon: "success" });
      this.setData({ notifyVisible: false });
    } catch (e) {
      console.error(e);
      wx.hideLoading();
      wx.showToast({ title: "发送失败", icon: "none" });
    }
  },

  /* ========== 站内信写入 user_inbox（收件人字段 openid） ========== */
  async sendInboxToOne(openid, title, content, type = "通知") {
    if (!openid) return;
    await db.collection("user_inbox").add({
      data: {
        openid,
        type,
        title,
        content,
        read: false,
        createdAt: db.serverDate(),
        createdAtStr: nowStr()
      }
    });
  },

  async sendInboxToOpenids(openids, title, content, type = "通知") {
    const oids = (openids || []).filter(Boolean);
    if (oids.length === 0) return;

    const batch = 20;
    for (let i = 0; i < oids.length; i += batch) {
      const chunk = oids.slice(i, i + batch);
      await Promise.all(chunk.map(oid => this.sendInboxToOne(oid, title, content, type)));
    }
  },

  // ✅ 原群发逻辑保留（你原功能不改）
  async sendInboxToAll(title, content, type = "通知") {
    let allUsers = [];
    let skip = 0;
    const pageSize = 200;

    while (true) {
      const res = await db.collection("users").skip(skip).limit(pageSize).get();
      const arr = res.data || [];
      allUsers = allUsers.concat(arr);
      if (arr.length < pageSize) break;
      skip += pageSize;
      if (skip > 5000) break;
    }

    const oids = allUsers.map(u => u.openid || u._openid).filter(Boolean);

    const batch = 20;
    for (let i = 0; i < oids.length; i += batch) {
      const chunk = oids.slice(i, i + batch);
      await Promise.all(chunk.map(oid => this.sendInboxToOne(oid, title, content, type)));
    }
  },

  /* ========== 返回 ========== */
  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});
