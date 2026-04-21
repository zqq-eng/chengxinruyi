# 秤心如意 Web后台管理系统

## 部署说明

### 本地开发
1. 进入 web 目录
2. 安装依赖：`pip install -r requirements.txt`
3. 启动服务：`python proxy.py`
4. 访问：http://localhost:3000

### Render.com 部署
1. Fork 本仓库到你的 GitHub 账号
2. 在 Render.com 上创建新的 Web 服务
3. 选择 GitHub 仓库，分支选择 main
4. 构建命令：`pip install -r requirements.txt`
5. 启动命令：`python proxy.py`
6. 环境变量（可选，建议配置）：
   - WECHAT_APPID: 你的小程序AppID
   - WECHAT_SECRET: 你的小程序AppSecret
   - WECHAT_CLOUD_ENV: 云开发环境ID
   - WECHAT_CLOUD_FUNCTION: 云函数名称

## 登录信息
- 默认账号：admin
- 默认密码：123456

## 功能说明
- 控制台：数据统计和图表分析
- 用户管理：管理用户信息
- 运动管理：查看运动统计
- 预约管理：管理预约信息
- 商城管理：管理商品和订单
- 消息管理：发送通知消息

## 技术栈
- 前端：HTML、Tailwind CSS、Chart.js
- 后端：Flask、微信云函数
- 数据存储：微信云开发数据库