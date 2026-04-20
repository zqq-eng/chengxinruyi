const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 微信云开发配置 - 请替换为你自己的配置
const WECHAT_CONFIG = {
    APPID: 'your-appid',           // 替换为你的小程序AppID
    SECRET: 'your-secret',         // 替换为你的小程序AppSecret
    CLOUD_FUNCTION_URL: 'https://api.weixin.qq.com/tcb/invokecloudfunction'
};

// 获取access_token
let accessToken = null;
let tokenExpireTime = 0;

async function getAccessToken() {
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
        } else {
            throw new Error('Failed to get access_token: ' + JSON.stringify(response.data));
        }
    } catch (error) {
        console.error('获取access_token失败:', error.message);
        throw error;
    }
}

// 调用云函数
async function callCloudFunction(action, data) {
    try {
        const token = await getAccessToken();
        const url = `${WECHAT_CONFIG.CLOUD_FUNCTION_URL}?access_token=${token}&env=${WECHAT_CONFIG.APPID}&name=admin_api`;
        
        const requestData = {
            action: action,
            ...data
        };

        const response = await axios.post(url, requestData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // 云函数返回的数据在 response.data.errMsg 或直接是返回数据
        if (response.data.errcode && response.data.errcode !== 0) {
            throw new Error(response.data.errmsg || '云函数调用失败');
        }

        // 返回云函数的实际响应数据
        return response.data;
    } catch (error) {
        console.error('调用云函数失败:', error.message);
        throw error;
    }
}

// 登录接口
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('登录请求:', username);

        const result = await callCloudFunction('login', {
            username: username,
            password: password
        });

        res.json(result);
    } catch (error) {
        console.error('登录错误:', error);
        res.status(500).json({
            ok: false,
            message: error.message || '登录失败'
        });
    }
});

// 通用API代理接口
app.post('/api/*', async (req, res) => {
    try {
        const pathParts = req.path.split('/').filter(p => p);
        const action = pathParts[pathParts.length - 1];

        console.log(`API请求: ${action}`, req.body);

        const result = await callCloudFunction(action, req.body);
        res.json(result);
    } catch (error) {
        console.error('API错误:', error);
        res.status(500).json({
            ok: false,
            message: error.message || '请求失败'
        });
    }
});

// 获取统计数据
app.get('/api/stats', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        // 并行获取各项统计
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
        console.error('获取统计失败:', error);
        res.status(500).json({
            ok: false,
            message: error.message
        });
    }
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   Web后台代理服务已启动                                   ║
║                                                          ║
║   访问地址: http://localhost:${PORT}                          ║
║   Web页面:  http://localhost:${PORT}/index.html             ║
║                                                          ║
║   请先配置 web/server.js 中的微信云开发参数:               ║
║   - APPID                                                ║
║   - SECRET                                               ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
    `);
});