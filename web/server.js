const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const WECHAT_CONFIG = {
  APPID: process.env.WECHAT_APPID,
  SECRET: process.env.WECHAT_SECRET,
  ENV_ID: process.env.WECHAT_ENV_ID,
  CLOUD_FUNCTION_URL: 'https://api.weixin.qq.com/tcb/invokecloudfunction'
};

function checkWechatConfig() {
  const missing = [];

  if (!WECHAT_CONFIG.APPID) missing.push('WECHAT_APPID');
  if (!WECHAT_CONFIG.SECRET) missing.push('WECHAT_SECRET');
  if (!WECHAT_CONFIG.ENV_ID) missing.push('WECHAT_ENV_ID');

  if (missing.length > 0) {
    throw new Error(`缺少环境变量: ${missing.join(', ')}`);
  }
}

let accessToken = null;
let tokenExpireTime = 0;

async function getAccessToken() {
  checkWechatConfig();

  if (accessToken && Date.now() < tokenExpireTime) {
    return accessToken;
  }

  try {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WECHAT_CONFIG.APPID}&secret=${WECHAT_CONFIG.SECRET}`;
    const response = await axios.get(url);

    if (response.data.access_token) {
      accessToken = response.data.access_token;
      tokenExpireTime = Date.now() + (response.data.expires_in - 200) * 1000;
      console.log('Access token obtained successfully');
      return accessToken;
    }

    throw new Error(`Failed to get access_token: ${JSON.stringify(response.data)}`);
  } catch (error) {
    const msg =
      error.response?.data
        ? JSON.stringify(error.response.data)
        : error.message;

    console.error('获取access_token失败:', msg);
    throw new Error(`Failed to get access_token: ${msg}`);
  }
}

async function callCloudFunction(action, data = {}) {
  try {
    const token = await getAccessToken();

    const url = `${WECHAT_CONFIG.CLOUD_FUNCTION_URL}?access_token=${token}&env=${WECHAT_CONFIG.ENV_ID}&name=admin_api`;

    const requestData = {
      action,
      ...data
    };

    const response = await axios.post(url, requestData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.data.errcode && response.data.errcode !== 0) {
      throw new Error(response.data.errmsg || '云函数调用失败');
    }

    return response.data;
  } catch (error) {
    const msg =
      error.response?.data
        ? JSON.stringify(error.response.data)
        : error.message;

    console.error('调用云函数失败:', msg);
    throw new Error(msg);
  }
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    message: 'server is running',
    envConfigured: Boolean(
      process.env.WECHAT_APPID &&
      process.env.WECHAT_SECRET &&
      process.env.WECHAT_ENV_ID
    )
  });
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        message: '用户名和密码不能为空'
      });
    }

    console.log('登录请求:', username);

    const result = await callCloudFunction('login', {
      username,
      password
    });

    res.json(result);
  } catch (error) {
    console.error('登录错误:', error.message);
    res.status(500).json({
      ok: false,
      message: error.message || '登录失败'
    });
  }
});

app.post('/api/*', async (req, res) => {
  try {
    const pathParts = req.path.split('/').filter(Boolean);
    const action = pathParts[pathParts.length - 1];

    console.log(`API请求: ${action}`, req.body);

    const result = await callCloudFunction(action, req.body || {});
    res.json(result);
  } catch (error) {
    console.error('API错误:', error.message);
    res.status(500).json({
      ok: false,
      message: error.message || '请求失败'
    });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    const [usersRes, runsRes, appointmentsRes, ordersRes] = await Promise.all([
      callCloudFunction('listUsers', { token, limit: 1 }),
      callCloudFunction('listRuns', { token, limit: 1 }),
      callCloudFunction('listAppointments', { token, limit: 1 }),
      callCloudFunction('listMallOrders', { token, limit: 1 })
    ]);

    res.json({
      ok: true,
      data: {
        users: usersRes.data?.total || 0,
        runs: runsRes.data?.total || 0,
        appointments: appointmentsRes.data?.total || 0,
        orders: ordersRes.data?.total || 0
      }
    });
  } catch (error) {
    console.error('获取统计失败:', error.message);
    res.status(500).json({
      ok: false,
      message: error.message || '获取统计失败'
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`server running on port ${PORT}`);
});