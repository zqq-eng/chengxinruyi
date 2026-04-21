"""
Web后台代理服务 - 使用Flask实现
用于Web前端与微信云函数的交互
"""

from flask import Flask, request, jsonify, send_from_directory
import requests
import json
import os

app = Flask(__name__, static_folder='.')
app.config['JSON_AS_ASCII'] = False

# 添加CORS支持
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

# 微信云开发配置 - 优先使用环境变量
WECHAT_CONFIG = {
    'APPID': os.environ.get('WECHAT_APPID', 'wxffedf08a214b83d9'),           # 小程序AppID
    'SECRET': os.environ.get('WECHAT_SECRET', 'd5c219d916a7208d1d0fd3c914618b30'),         # 小程序AppSecret
    'CLOUD_ENV': os.environ.get('WECHAT_CLOUD_ENV', os.environ.get('WECHAT_ENV_ID', 'cloudqq-4g32uhb816255d70')),  # 云开发环境ID
    'CLOUD_FUNCTION_NAME': os.environ.get('WECHAT_CLOUD_FUNCTION', 'admin_api')
}

print('微信配置:', {
    'APPID': WECHAT_CONFIG['APPID'][:8] + '...',
    'CLOUD_ENV': WECHAT_CONFIG['CLOUD_ENV'],
    'CLOUD_FUNCTION_NAME': WECHAT_CONFIG['CLOUD_FUNCTION_NAME']
})

# 获取access_token
access_token = None
token_expire_time = 0

def get_access_token():
    global access_token, token_expire_time
    import time
    
    if access_token and time.time() < token_expire_time:
        print(f'使用缓存的access_token，剩余时间: {token_expire_time - time.time():.0f}秒')
        return access_token
    
    url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={WECHAT_CONFIG['APPID']}&secret={WECHAT_CONFIG['SECRET']}"
    
    try:
        print(f'请求access_token URL: {url}')
        response = requests.get(url, timeout=10)
        print(f'access_token响应状态码: {response.status_code}')
        print(f'access_token响应内容: {response.text}')
        
        data = response.json()
        
        if 'access_token' in data:
            access_token = data['access_token']
            token_expire_time = time.time() + data['expires_in'] - 200
            print(f'Access token获取成功，有效期: {data["expires_in"]}秒')
            return access_token
        else:
            error_msg = f"Failed to get access_token: {json.dumps(data)}"
            print(error_msg)
            raise Exception(error_msg)
    except Exception as e:
        error_msg = f'获取access_token失败: {e}'
        print(error_msg)
        raise Exception(error_msg)

def call_cloud_function(action, data=None):
    """调用微信云函数"""
    try:
        token = get_access_token()
        url = f"https://api.weixin.qq.com/tcb/invokecloudfunction?access_token={token}&env={WECHAT_CONFIG['CLOUD_ENV']}&name={WECHAT_CONFIG['CLOUD_FUNCTION_NAME']}"
        
        request_data = {'action': action}
        if data:
            request_data.update(data)
        
        print(f'调用云函数: {action}')
        print(f'请求数据: {request_data}')
        print(f'请求URL: {url[:100]}...{url[-50:]}')  # 截断URL以避免日志过长
        
        response = requests.post(url, json=request_data, headers={'Content-Type': 'application/json'}, timeout=30)
        print(f'云函数响应状态码: {response.status_code}')
        
        result = response.json()
        print(f'微信API返回: {result}')
        
        # 云函数返回的数据在 resp_data 里
        if 'resp_data' in result:
            try:
                resp_data = json.loads(result['resp_data'])
                print(f'云函数返回数据: {resp_data}')
                return resp_data
            except json.JSONDecodeError as e:
                print(f'解析resp_data失败: {e}')
                print(f'resp_data内容: {result["resp_data"]}')
                raise e
        
        print(f'云函数返回(无resp_data): {result}')
        return result
    except Exception as e:
        error_msg = f'调用云函数失败: {e}'
        print(error_msg)
        raise Exception(error_msg)

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
    port = int(os.environ.get('PORT', 10000))
    debug = os.environ.get('DEBUG', 'False').lower() == 'true'

    print(f'服务启动中，端口: {port}')
    app.run(host='0.0.0.0', port=port, debug=debug)
    print("""
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   Web后台代理服务已启动                                   ║
║                                                          ║
║   访问地址: http://localhost:{port}                       ║
║   Web页面:  http://localhost:{port}/index.html            ║
║                                                          ║
║   请先配置 proxy.py 中的微信云开发参数:                   ║
║   - APPID                                               ║
║   - SECRET                                               ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
    """.format(port=port))
    
    # 生产环境关闭debug
    debug = os.environ.get('DEBUG', 'False').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)
