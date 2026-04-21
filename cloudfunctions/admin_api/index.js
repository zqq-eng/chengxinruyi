'use strict';

const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// =====================
// Config (edit if needed)
// =====================
const CONFIG = {
  // First-time bootstrap admin account (you can change later in DB)
  DEFAULT_ADMIN_USERNAME: 'admin',
  DEFAULT_ADMIN_PASSWORD: '123456',

  TOKEN_EXPIRE_DAYS: 7,
  PAGE_SIZE_MAX: 200,

  // Collections
  COL_ADMINS: 'admins',
  COL_ADMIN_TOKENS: 'admin_tokens',
  COL_USERS: 'users',
  COL_RUNS: 'runs',
  COL_WORKOUT_CHECKINS: 'workout_checkins',
  COL_WORKOUT: 'workout',
  COL_APPOINTMENTS: 'appointments',
  COL_MALL_GOODS: 'mall_goods',
  COL_MALL_ORDERS: 'mall_orders',
  COL_USER_INBOX: 'user_inbox'
};

function sha256(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

function randomId(len = 32) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

function nowMs() { return Date.now(); }

function msDays(d) { return d * 24 * 60 * 60 * 1000; }

function ok(data = {}) {
  return { ok: true, data };
}

function bad(message = 'Bad Request', code = 'BAD_REQUEST', extra = {}) {
  return { ok: false, code, message, ...extra };
}

async function ensureDefaultAdmin() {
  // Create default admin if collection exists but empty.
  // If collection not exists, CloudBase will auto-create on first add.
  const res = await db.collection(CONFIG.COL_ADMINS).limit(1).get().catch(() => ({ data: [] }));
  if (res && Array.isArray(res.data) && res.data.length > 0) return;

  const salt = randomId(16);
  const passwordHash = sha256(CONFIG.DEFAULT_ADMIN_PASSWORD + ':' + salt);
  await db.collection(CONFIG.COL_ADMINS).add({
    data: {
      username: CONFIG.DEFAULT_ADMIN_USERNAME,
      salt,
      passwordHash,
      role: 'super',
      active: true,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  // Ensure admin_tokens collection exists by doing a count operation
  await db.collection(CONFIG.COL_ADMIN_TOKENS).count().catch(() => null);
  // Ensure user_inbox collection exists by doing a count operation
  await db.collection(CONFIG.COL_USER_INBOX).count().catch(() => null);
  // Ensure other collections exist
  await db.collection(CONFIG.COL_MALL_GOODS).count().catch(() => null);
  await db.collection(CONFIG.COL_MALL_ORDERS).count().catch(() => null);
  await db.collection(CONFIG.COL_APPOINTMENTS).count().catch(() => null);
  await db.collection(CONFIG.COL_RUNS).count().catch(() => null);
}

async function requireAdmin(token) {
  if (!token) throw new Error('NO_TOKEN');

  const tok = await db.collection(CONFIG.COL_ADMIN_TOKENS)
    .where({ token })
    .limit(1)
    .get();

  const t = tok.data && tok.data[0];
  if (!t) throw new Error('TOKEN_NOT_FOUND');

  const exp = Number(t.expireAtMs || 0);
  if (!exp || exp < nowMs()) {
    // cleanup
    await db.collection(CONFIG.COL_ADMIN_TOKENS).doc(t._id).remove().catch(() => null);
    throw new Error('TOKEN_EXPIRED');
  }

  // fetch admin
  const adminRes = await db.collection(CONFIG.COL_ADMINS).doc(t.adminId).get();
  const admin = adminRes.data;
  if (!admin || admin.active === false) throw new Error('ADMIN_DISABLED');

  return { admin, tokenDoc: t };
}

function clampLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(n, CONFIG.PAGE_SIZE_MAX);
}

async function listByQuery(col, whereObj, { orderBy = 'createdAt', orderDir = 'desc', skip = 0, limit = 50 } = {}) {
  const lim = clampLimit(limit);
  const sk = Math.max(0, Number(skip) || 0);
  const q = db.collection(col)
    .where(whereObj || {})
    .orderBy(orderBy, orderDir)
    .skip(sk)
    .limit(lim);

  const [listRes, countRes] = await Promise.all([
    q.get(),
    db.collection(col).where(whereObj || {}).count().catch(() => ({ total: (listRes?.data || []).length }))
  ]);

  return { list: listRes.data || [], total: countRes.total || 0, skip: sk, limit: lim };
}

// =====================
// Main
// =====================
exports.main = async (event, context) => {
  const action = (event && event.action) || '';

  try {
    // bootstrap (safe to call always; only creates once)
    await ensureDefaultAdmin();

    if (action === 'ping') {
      return ok({ ts: nowMs() });
    }

    if (action === 'initAdmin') {
      // Creates default admin if none exists; returns username/password提示
      // NOTE: for security, only return a hint.
      return ok({
        message: '默认管理员已确保存在。如需修改密码，请使用PC后台登录后在“管理员”模块扩展（当前版本未提供改密UI）。',
        defaultUsername: CONFIG.DEFAULT_ADMIN_USERNAME
      });
    }

    if (action === 'login') {
      const username = String(event.username || '').trim();
      const password = String(event.password || '');
      if (!username || !password) return bad('缺少账号或密码');

      const res = await db.collection(CONFIG.COL_ADMINS)
        .where({ username, active: _.neq(false) })
        .limit(1)
        .get();

      const admin = res.data && res.data[0];
      if (!admin) return bad('账号或密码错误', 'AUTH_FAILED');

      const salt = admin.salt || '';
      const hash = sha256(password + ':' + salt);
      if (hash !== admin.passwordHash) return bad('账号或密码错误', 'AUTH_FAILED');

      const token = randomId(40);
      const expireAtMs = nowMs() + msDays(CONFIG.TOKEN_EXPIRE_DAYS);
      await db.collection(CONFIG.COL_ADMIN_TOKENS).add({
        data: {
          token,
          adminId: admin._id,
          username: admin.username,
          role: admin.role || 'admin',
          createdAt: db.serverDate(),
          expireAtMs
        }
      });

      return ok({ token, expireAtMs, username: admin.username, role: admin.role || 'admin' });
    }

    if (action === 'logout') {
      const token = String(event.token || '');
      if (!token) return ok({});
      const r = await db.collection(CONFIG.COL_ADMIN_TOKENS).where({ token }).get();
      const rows = r.data || [];
      await Promise.all(rows.map(x => db.collection(CONFIG.COL_ADMIN_TOKENS).doc(x._id).remove().catch(() => null)));
      return ok({});
    }

    // All actions below require admin
    const token = String(event.token || '');
    await requireAdmin(token);

    // ===== Users =====
    if (action === 'listUsers') {
      const keyword = String(event.keyword || '').trim();
      const skip = Number(event.skip || 0);
      const limit = clampLimit(event.limit);

      let whereObj = {};
      if (keyword) {
        // simple contains for nickname/account/phone; CloudDB doesn't support regex by default in all envs.
        // We'll do best-effort: match exact fields if provided.
        whereObj = _.or([
          { openid: keyword },
          { nickName: keyword },
          { phone: keyword },
          { username: keyword },
          { account: keyword },
          { name: keyword }
        ]);
      }

      const res = await listByQuery(CONFIG.COL_USERS, keyword ? whereObj : {}, {
        orderBy: 'createdAt',
        orderDir: 'desc',
        skip,
        limit
      });

      // 获取体重记录和运动记录
      const users = res.list;
      const openids = users.map(u => u.openid || u._openid).filter(Boolean);
      
      let weightMap = {};
      let runMap = {};

      if (openids.length > 0) {
        // 获取体重记录
        try {
          const weights = await db.collection('weights')
            .where({ openid: _.in(openids) })
            .get();
          weights.data.forEach(item => {
            const openid = item.openid || item._openid || '';
            if (!openid) return;
            weightMap[openid] = (weightMap[openid] || 0) + 1;
          });
        } catch (e) {
          console.warn('weights 集合不存在，略过体重统计', e);
        }

        // 获取运动记录
        try {
          const runs = await db.collection('runs')
            .where({ openid: _.in(openids) })
            .get();
          runs.data.forEach(item => {
            const openid = item.openid || item._openid || '';
            if (!openid) return;
            runMap[openid] = (runMap[openid] || 0) + 1;
          });
        } catch (e) {
          console.warn('runs 集合不存在，略过运动统计', e);
        }
      }

      // 组装用户数据
      const formattedUsers = users.map(u => {
        const openid = u.openid || u._openid || '';
        const name = u.name || u.nickname || u.nickName || '';
        const school = u.school || '';
        const major = u.major || '';
        const gender = u.gender || '';
        const height = u.height || '';
        const targetWeight = u.targetWeight || u.target || '';
        const phone = u.phone || u.mobile || '';
        const account = u.account || '';
        const createdAt = u.createdAt || u.registerTime || u._createTime || '';

        let createdAtStr = '';
        if (typeof createdAt === 'string') {
          createdAtStr = createdAt;
        } else if (createdAt && createdAt.toDate) {
          const d = createdAt.toDate();
          createdAtStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        } else if (createdAt instanceof Date) {
          createdAtStr = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}-${String(createdAt.getDate()).padStart(2, '0')} ${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}`;
        }

        return {
          _id: u._id,
          openid,
          account,
          name,
          school,
          major,
          gender,
          height,
          targetWeight,
          phone,
          createdAtStr,
          weightCount: weightMap[openid] || 0,
          runCount: runMap[openid] || 0,
          raw: u,
          isMock: false
        };
      });

      return ok({ list: formattedUsers, total: res.total, skip: res.skip, limit: res.limit });
    }

    if (action === 'updateUser') {
      const id = String(event.id || '').trim();
      const patch = event.patch || {};
      if (!id) return bad('缺少用户id');

      // allow only safe fields
      const allow = ['nickName', 'avatarUrl', 'gender', 'height', 'weight', 'age', 'phone', 'remark', 'active', 'account', 'name', 'school', 'major', 'targetWeight'];
      const data = {};
      for (const k of allow) {
        if (typeof patch[k] !== 'undefined') data[k] = patch[k];
      }
      data.updatedAt = db.serverDate();

      await db.collection(CONFIG.COL_USERS).doc(id).update({ data });
      return ok({ id });
    }

    // ===== Sports =====
    if (action === 'listRuns') {
      const openid = String(event.openid || '').trim();
      const skip = Number(event.skip || 0);
      const limit = clampLimit(event.limit);

      const whereObj = openid ? { openid } : {};
      const res = await listByQuery(CONFIG.COL_RUNS, whereObj, {
        orderBy: 'startTime',
        orderDir: 'desc',
        skip,
        limit
      });
      return ok(res);
    }

    if (action === 'listWorkoutCheckins') {
      const openid = String(event.openid || '').trim();
      const skip = Number(event.skip || 0);
      const limit = clampLimit(event.limit);

      const whereObj = openid ? { openid } : {};
      const res = await listByQuery(CONFIG.COL_WORKOUT_CHECKINS, whereObj, {
        orderBy: 'createdAt',
        orderDir: 'desc',
        skip,
        limit
      });
      return ok(res);
    }

    if (action === 'listWorkout') {
      const openid = String(event.openid || '').trim();
      const skip = Number(event.skip || 0);
      const limit = clampLimit(event.limit);

      const whereObj = openid ? { openid } : {};
      const res = await listByQuery(CONFIG.COL_WORKOUT, whereObj, {
        orderBy: 'createdAt',
        orderDir: 'desc',
        skip,
        limit
      });
      return ok(res);
    }

    // ===== Appointments =====
    if (action === 'listAppointments') {
      const status = String(event.status || '').trim();
      const openid = String(event.openid || '').trim();
      const skip = Number(event.skip || 0);
      const limit = clampLimit(event.limit);

      const whereObj = {};
      if (status) whereObj.status = status;
      if (openid) whereObj.openid = openid;

      const res = await listByQuery(CONFIG.COL_APPOINTMENTS, whereObj, {
        orderBy: 'createdAt',
        orderDir: 'desc',
        skip,
        limit
      });
      return ok(res);
    }

    if (action === 'updateAppointmentStatus') {
      const id = String(event.id || '').trim();
      const status = String(event.status || '').trim();
      if (!id || !status) return bad('缺少参数');

      await db.collection(CONFIG.COL_APPOINTMENTS).doc(id).update({
        data: { status, updatedAt: db.serverDate() }
      });
      return ok({ id, status });
    }

    // ===== Mall =====
    if (action === 'listMallGoods') {
      const skip = Number(event.skip || 0);
      const limit = clampLimit(event.limit);
      const res = await listByQuery(CONFIG.COL_MALL_GOODS, {}, {
        orderBy: 'sort',
        orderDir: 'asc',
        skip,
        limit
      });
      return ok(res);
    }

    if (action === 'upsertMallGoods') {
      const id = String(event.id || '').trim();
      const data = event.data || {};
      const payload = {
        title: String(data.title || '').trim(),
        subtitle: String(data.subtitle || '').trim(),
        type: String(data.type || 'time'),
        tag: String(data.tag || '').trim(),
        sort: Number(data.sort || 10),
        active: data.active !== false,
        costSec: Number(data.costSec || 0),
        costKm: Number(data.costKm || 0),
        updatedAt: db.serverDate()
      };
      if (!payload.title) return bad('缺少商品名称');

      if (!id) {
        payload.createdAt = db.serverDate();
        const r = await db.collection(CONFIG.COL_MALL_GOODS).add({ data: payload });
        return ok({ id: r._id });
      } else {
        await db.collection(CONFIG.COL_MALL_GOODS).doc(id).update({ data: payload });
        return ok({ id });
      }
    }

    if (action === 'listMallOrders') {
      const status = String(event.status || '').trim();
      const openid = String(event.openid || '').trim();
      const skip = Number(event.skip || 0);
      const limit = clampLimit(event.limit);

      const whereObj = {};
      if (status) whereObj.status = status;
      if (openid) whereObj.openid = openid;

      const res = await listByQuery(CONFIG.COL_MALL_ORDERS, whereObj, {
        orderBy: 'createdAt',
        orderDir: 'desc',
        skip,
        limit
      });
      return ok(res);
    }

    if (action === 'updateMallOrder') {
      const id = String(event.id || '').trim();
      const patch = event.patch || {};
      if (!id) return bad('缺少订单id');

      const allow = ['status', 'shipText', 'shipCompany', 'shipNo', 'rejectReason', 'adminRemark'];
      const data = { updatedAt: db.serverDate() };
      for (const k of allow) {
        if (typeof patch[k] !== 'undefined') data[k] = patch[k];
      }
      await db.collection(CONFIG.COL_MALL_ORDERS).doc(id).update({ data });
      return ok({ id });
    }

    // ===== Inbox messages =====
    if (action === 'sendInbox') {
      const toOpenid = String(event.openid || '').trim();
      const title = String(event.title || '').trim();
      const content = String(event.content || '').trim();
      const type = String(event.type || '通知').trim();
      if (!toOpenid || !title || !content) return bad('缺少参数');

      // 确保user_inbox集合存在
      await db.collection(CONFIG.COL_USER_INBOX).count().catch(() => null);
      
      await db.collection(CONFIG.COL_USER_INBOX).add({
        data: {
          openid: toOpenid,
          title,
          content,
          type,
          read: false,
          createdAt: db.serverDate()
        }
      });
      return ok({});
    }

    if (action === 'sendInboxAll') {
      const title = String(event.title || '').trim();
      const content = String(event.content || '').trim();
      const type = String(event.type || '通知').trim();
      if (!title || !content) return bad('缺少参数');

      // 确保user_inbox集合存在
      await db.collection(CONFIG.COL_USER_INBOX).count().catch(() => null);

      // list users openid in pages to avoid 1000 limit
      const pageSize = 200;
      let skip = 0;
      let total = 0;
      while (true) {
        const res = await db.collection(CONFIG.COL_USERS).field({ openid: true }).skip(skip).limit(pageSize).get();
        const users = res.data || [];
        if (!users.length) break;

        const tasks = users.map(u => db.collection(CONFIG.COL_USER_INBOX).add({
          data: {
            openid: u.openid,
            title,
            content,
            type,
            read: false,
            createdAt: db.serverDate()
          }
        }).catch(() => null));

        await Promise.all(tasks);
        total += users.length;
        skip += users.length;
        if (users.length < pageSize) break;
      }

      return ok({ sent: total });
    }

    if (action === 'listInbox') {
      const openid = String(event.openid || '').trim();
      const skip = Number(event.skip || 0);
      const limit = clampLimit(event.limit);

      if (!openid) return bad('缺少 openid');
      const res = await listByQuery(CONFIG.COL_USER_INBOX, { openid }, {
        orderBy: 'createdAt',
        orderDir: 'desc',
        skip,
        limit
      });
      return ok(res);
    }

    return bad('未知 action', 'UNKNOWN_ACTION', { action });
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    // Normalize some common auth errors
    if (msg === 'NO_TOKEN') return bad('未登录或登录已过期', 'NO_TOKEN');
    if (msg === 'TOKEN_NOT_FOUND' || msg === 'TOKEN_EXPIRED') return bad('登录已过期，请重新登录', 'TOKEN_EXPIRED');
    if (msg === 'ADMIN_DISABLED') return bad('管理员账号被禁用', 'ADMIN_DISABLED');

    return { ok: false, code: 'SERVER_ERROR', message: msg };
  }
};
