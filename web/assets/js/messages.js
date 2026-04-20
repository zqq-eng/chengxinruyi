// 检查登录状态
function checkLogin() {
    const token = localStorage.getItem('adminToken');
    if (!token) {
        window.location.href = 'index.html';
    }

    const username = localStorage.getItem('adminUsername');
    if (username) {
        document.getElementById('adminUsername').textContent = username.charAt(0).toUpperCase();
        document.getElementById('adminName').textContent = username;
    }
}

// 图表实例
let messageChart = null;

// 初始化图表 - 蓝绿色科技水光动感风格
function initChart(unread, read, notification) {
    const ctx = document.getElementById('messageChart').getContext('2d');
    
    if (messageChart) {
        messageChart.destroy();
    }
    
    messageChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['未读', '已读', '通知类'],
            datasets: [{
                data: [unread, read, notification],
                backgroundColor: [
                    'rgba(255, 193, 7, 0.85)',
                    'rgba(0, 211, 212, 0.85)',
                    'rgba(33, 150, 243, 0.85)'
                ],
                borderWidth: 3,
                borderColor: '#ffffff',
                hoverBorderWidth: 5,
                hoverBorderColor: '#00D4D4',
                shadowBlur: 20,
                shadowColor: 'rgba(0, 211, 212, 0.5)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#00897B',
                        font: { size: 13, weight: '500' },
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 105, 112, 0.9)',
                    titleColor: '#E0F2F1',
                    bodyColor: '#B2DFDB',
                    borderColor: '#00D4D4',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            return ' ' + context.label + ': ' + context.parsed + ' 条';
                        }
                    }
                }
            },
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 2000,
                easing: 'easeOutQuart'
            }
        }
    });
}

// 加载消息列表
let allMessages = [];
async function loadMessages(page = 1, openid = '') {
    try {
        const token = localStorage.getItem('adminToken');
        const limit = 100;
        const skip = (page - 1) * limit;

        const response = await axios.post('/api/listInbox', {
            token: token,
            openid: openid,
            skip: skip,
            limit: limit
        });

        if (response.data.ok) {
            allMessages = response.data.data.list || [];
            const total = response.data.data.total;

            // 统计各种状态的数量
            let unread = 0, read = 0, notification = 0;
            allMessages.forEach(msg => {
                if (msg.read) {
                    read++;
                } else {
                    unread++;
                }
                if (msg.type === '通知' || msg.type === 'notification') {
                    notification++;
                }
            });

            // 更新统计卡片
            document.getElementById('totalMessagesStat').textContent = total;
            document.getElementById('unreadMessages').textContent = unread;
            document.getElementById('readMessages').textContent = read;
            document.getElementById('notificationMessages').textContent = notification;

            // 初始化图表
            initChart(unread, read, notification);

            // 更新分页信息
            document.getElementById('totalMessages').textContent = total;
            document.getElementById('showingFrom').textContent = skip + 1;
            document.getElementById('showingTo').textContent = Math.min(skip + limit, total);

            // 渲染列表（只显示前10条）
            const displayList = allMessages.slice(0, 10);
            renderMessageList(displayList);
        }
    } catch (error) {
        console.error('加载消息列表错误:', error);
    }
}

// 渲染消息列表
function renderMessageList(messages) {
    const messageList = document.getElementById('messageList');
    messageList.innerHTML = '';

    messages.forEach(message => {
        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="flex-shrink-0 h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                        <span class="text-green-600">U</span>
                    </div>
                    <div class="ml-4">
                        <div class="text-sm font-medium text-gray-900">用户 ${(message.openid || '').substring(0, 8)}...</div>
                        <div class="text-sm text-gray-500">${message.openid || ''}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm text-gray-900">${message.title || ''}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${message.type || '通知'}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${message.read ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                    ${message.read ? '已读' : '未读'}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${formatDateTime(message.createdAt)}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button onclick="viewMessageDetail(${JSON.stringify(message).replace(/"/g, '&quot;')})" class="text-green-600 hover:text-green-900">查看</button>
            </td>
        `;
        messageList.appendChild(tr);
    });
}

// 查看消息详情
function viewMessageDetail(message) {
    console.log('查看消息详情:', message);
}

// 发送消息
async function sendMessage() {
    try {
        const token = localStorage.getItem('adminToken');
        const sendTo = document.querySelector('input[name="sendTo"]:checked').value;
        const type = document.getElementById('messageType').value;
        const title = document.getElementById('messageTitle').value;
        const content = document.getElementById('messageContent').value;

        let response;
        if (sendTo === 'all') {
            response = await axios.post('/api/sendInboxAll', {
                token: token,
                title: title,
                content: content,
                type: type
            });
        } else {
            const openid = document.getElementById('userOpenid').value;
            response = await axios.post('/api/sendInbox', {
                token: token,
                openid: openid,
                title: title,
                content: content,
                type: type
            });
        }

        if (response.data.ok) {
            alert('消息发送成功');
            document.getElementById('messageModal').classList.add('hidden');
            loadMessages();
        } else {
            alert('消息发送失败：' + response.data.message);
        }
    } catch (error) {
        console.error('发送消息错误:', error);
        alert('消息发送失败，请稍后重试');
    }
}

// 格式化日期时间
function formatDateTime(date) {
    if (!date) return '未知';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 退出登录
function logout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUsername');
    window.location.href = 'index.html';
}

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    checkLogin();
    loadMessages();

    // 绑定退出登录事件
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // 绑定搜索按钮事件
    document.getElementById('searchBtn').addEventListener('click', function() {
        const keyword = document.getElementById('searchKeyword').value;
        loadMessages(1, keyword);
    });

    // 绑定发送全员通知按钮事件
    document.getElementById('sendAllBtn').addEventListener('click', function() {
        document.getElementById('modalTitle').textContent = '发送全员通知';
        document.querySelector('input[name="sendTo"][value="all"]').checked = true;
        document.getElementById('singleUserSection').classList.add('hidden');
        document.getElementById('messageModal').classList.remove('hidden');
    });

    // 绑定发送对象切换事件
    document.querySelectorAll('input[name="sendTo"]').forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'single') {
                document.getElementById('singleUserSection').classList.remove('hidden');
            } else {
                document.getElementById('singleUserSection').classList.add('hidden');
            }
        });
    });

    // 绑定关闭模态框事件
    document.getElementById('closeModal').addEventListener('click', function() {
        document.getElementById('messageModal').classList.add('hidden');
    });

    // 绑定消息表单提交事件
    document.getElementById('messageForm').addEventListener('submit', function(e) {
        e.preventDefault();
        sendMessage();
    });

    // 绑定分页按钮事件
    document.getElementById('prevPage').addEventListener('click', function() {
        // 实现分页逻辑
    });

    document.getElementById('nextPage').addEventListener('click', function() {
        // 实现分页逻辑
    });
});