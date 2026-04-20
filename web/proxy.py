"""
Web后台代理服务 - 使用Flask实现
用于Web前端与微信云函数的交互
"""

from flask import Flask, request, jsonify, send_from_directory
import requests
import json

app = Flask(__name__, static_folder='.')
app.config['JSON_AS_ASCII'] = False

# 微信云开发配置 - 请替换为你自己的配置

WECHAT_CONFIG = {
    'APPID': 'wxffedf08a214b83d9',           # 小程序AppID
    'SECRET': 'd5c219d916a7208d1d0fd3c914618b30',         # 小程序AppSecret
    'CLOUD_ENV': 'cloudqq-4g32uhb816255d70',  # 云开发环境ID
    'CLOUD_FUNCTION_NAME': 'admin_api'
}

# 获取access_token
access_token = None
token_expire_time = 0

def get_access_token():
    global access_token, token_expire_time
    import time
    
    if access_token and time.time() < token_expire_time:
        return access_token
    
    url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={WECHAT_CONFIG['APPID']}&secret={WECHAT_CONFIG['SECRET']}"
    
    try:
        response = requests.get(url)
        data = response.json()
        
        if 'access_token' in data:
            access_token = data['access_token']
            token_expire_time = time.time() + data['expires_in'] - 200
            print('Access token obtained successfully')
            return access_token
        else:
            raise Exception(f"Failed to get access_token: {json.dumps(data)}")
    except Exception as e:
        print(f'获取access_token失败: {e}')
        raise e

def call_cloud_function(action, data=None):
    """调用微信云函数"""
    try:
        token = get_access_token()
        url = f"https://api.weixin.qq.com/tcb/invokecloudfunction?access_token={token}&env={WECHAT_CONFIG['CLOUD_ENV']}&name={WECHAT_CONFIG['CLOUD_FUNCTION_NAME']}"
        
        request_data = {'action': action}
        if data:
            request_data.update(data)
        
        print(f'请求云函数URL: {url}')
        print(f'请求数据: {request_data}')
        
        response = requests.post(url, json=request_data, headers={'Content-Type': 'application/json'})
        result = response.json()
        
        print(f'微信API返回: {result}')
        
        # 云函数返回的数据在 resp_data 里
        if 'resp_data' in result:
            resp_data = json.loads(result['resp_data'])
            print(f'云函数返回数据: {resp_data}')
            return resp_data
        
        print(f'云函数返回(无resp_data): {result}')
        return result
    except Exception as e:
        print(f'调用云函数失败: {e}')
        raise e

# 提供静态文件
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)

# 登录接口
@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        print(f'登录请求: {username}')
        print(f'调用云函数，参数: username={username}, password={password}')
        
        result = call_cloud_function('login', {
            'username': username,
            'password': password
        })
        
        print(f'云函数返回结果: {result}')
        
        return jsonify(result)
    except Exception as e:
        print(f'登录错误: {e}')
        return jsonify({
            'ok': False,
            'message': str(e) or '登录失败'
        }), 500

# 通用API代理接口
@app.route('/api/<action>', methods=['POST'])
def api_proxy(action):
    try:
        data = request.get_json() or {}
        print(f'API请求: {action}', data)
        
        result = call_cloud_function(action, data)
        return jsonify(result)
    except Exception as e:
        print(f'API错误: {e}')
        return jsonify({
            'ok': False,
            'message': str(e) or '请求失败'
        }), 500

# 获取统计数据
@app.route('/api/stats', methods=['GET'])
def get_stats():
    try:
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        # 并行获取各项统计
        import concurrent.futures
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            future_users = executor.submit(call_cloud_function, 'listUsers', {'token': token, 'limit': 1})
            future_runs = executor.submit(call_cloud_function, 'listRuns', {'token': token, 'limit': 1})
            future_appointments = executor.submit(call_cloud_function, 'listAppointments', {'token': token, 'limit': 1})
            future_orders = executor.submit(call_cloud_function, 'listMallOrders', {'token': token, 'limit': 1})
            
            users_data = future_users.result()
            runs_data = future_runs.result()
            appointments_data = future_appointments.result()
            orders_data = future_orders.result()
        
        return jsonify({
            'ok': True,
            'data': {
                'users': users_data.get('data', {}).get('total', 0),
                'runs': runs_data.get('data', {}).get('total', 0),
                'appointments': appointments_data.get('data', {}).get('total', 0),
                'orders': orders_data.get('data', {}).get('total', 0)
            }
        })
    except Exception as e:
        print(f'获取统计失败: {e}')
        return jsonify({
            'ok': False,
            'message': str(e)
        }), 500

if __name__ == '__main__':
    print("""
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   Web后台代理服务已启动                                   ║
║                                                          ║
║   访问地址: http://localhost:3000                         ║
║   Web页面:  http://localhost:3000/index.html              ║
║                                                          ║
║   请先配置 proxy.py 中的微信云开发参数:                   ║
║   - APPID                                               ║
║   - SECRET                                               ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
    """)
    app.run(host='0.0.0.0', port=3000, debug=True)