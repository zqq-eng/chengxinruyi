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
let appointmentChart = null;

// 初始化图表 - 蓝绿色科技水光动感风格
function initChart(pending, approved, rejected) {
    const ctx = document.getElementById('appointmentChart').getContext('2d');
    
    if (appointmentChart) {
        appointmentChart.destroy();
    }
    
    appointmentChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['待审核', '已通过', '已拒绝'],
            datasets: [{
                data: [pending, approved, rejected],
                backgroundColor: [
                    'rgba(255, 193, 7, 0.85)',
                    'rgba(0, 211, 212, 0.85)',
                    'rgba(244, 67, 54, 0.75)'
                ],
                borderWidth: 3,
                borderColor: '#ffffff',
                hoverBorderWidth: 5,
                hoverBorderColor: '#00D4D4',
                shadowBlur: 15,
                shadowColor: 'rgba(0, 211, 212, 0.4)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
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

// 加载预约列表
let allAppointments = [];
async function loadAppointments(page = 1, status = '', openid = '') {
    try {
        const token = localStorage.getItem('adminToken');
        const limit = 100;
        const skip = (page - 1) * limit;

        const response = await axios.post('/api/listAppointments', {
            token: token,
            status: status,
            openid: openid,
            skip: skip,
            limit: limit
        });

        if (response.data.ok) {
            allAppointments = response.data.data.list || [];
            const total = response.data.data.total;

            // 统计各种状态的数量
            let pending = 0, approved = 0, rejected = 0;
            allAppointments.forEach(apt => {
                switch (apt.status) {
                    case 'pending':
                        pending++;
                        break;
                    case 'approved':
                    case 'accepted':
                        approved++;
                        break;
                    case 'rejected':
                        rejected++;
                        break;
                }
            });

            // 更新统计卡片
            document.getElementById('totalAppointmentsStat').textContent = total;
            document.getElementById('pendingAppointments').textContent = pending;
            document.getElementById('approvedAppointments').textContent = approved;
            document.getElementById('rejectedAppointments').textContent = rejected;

            // 初始化图表
            initChart(pending, approved, rejected);

            // 更新分页信息
            document.getElementById('totalAppointments').textContent = total;
            document.getElementById('showingFrom').textContent = skip + 1;
            document.getElementById('showingTo').textContent = Math.min(skip + limit, total);

            // 渲染列表（只显示前10条）
            const displayList = allAppointments.slice(0, 10);
            renderAppointmentList(displayList);
        }
    } catch (error) {
        console.error('加载预约列表错误:', error);
    }
}

// 渲染预约列表
function renderAppointmentList(appointments) {
    const appointmentList = document.getElementById('appointmentList');
    appointmentList.innerHTML = '';

    appointments.forEach(appointment => {
        const tr = document.createElement('tr');

        let statusClass = '';
        let statusText = '';

        switch (appointment.status) {
            case 'pending':
                statusClass = 'bg-yellow-100 text-yellow-800';
                statusText = '待审核';
                break;
            case 'approved':
            case 'accepted':
                statusClass = 'bg-green-100 text-green-800';
                statusText = '已通过';
                break;
            case 'rejected':
                statusClass = 'bg-red-100 text-red-800';
                statusText = '已拒绝';
                break;
            case 'finished':
                statusClass = 'bg-blue-100 text-blue-800';
                statusText = '已完成';
                break;
            default:
                statusClass = 'bg-gray-100 text-gray-800';
                statusText = '未知';
        }

        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="flex-shrink-0 h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                        <span class="text-green-600">U</span>
                    </div>
                    <div class="ml-4">
                        <div class="text-sm font-medium text-gray-900">用户 ${(appointment.openid || '').substring(0, 8)}...</div>
                        <div class="text-sm text-gray-500">${appointment.openid || ''}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${appointment.service || appointment.title || '未知服务'}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${formatDateTime(appointment.appointmentTime || appointment.startTime)}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                    ${statusText}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${formatDateTime(appointment.createdAt)}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button onclick="viewAppointmentDetail(${JSON.stringify(appointment).replace(/"/g, '&quot;')})" class="text-green-600 hover:text-green-900 mr-3">查看</button>
                ${appointment.status === 'pending' ? `
                <button onclick="updateAppointmentStatus('${appointment._id}', 'approved')" class="text-green-600 hover:text-green-900 mr-3">通过</button>
                <button onclick="updateAppointmentStatus('${appointment._id}', 'rejected')" class="text-red-600 hover:text-red-900">拒绝</button>
                ` : ''}
            </td>
        `;
        appointmentList.appendChild(tr);
    });
}

// 查看预约详情
function viewAppointmentDetail(appointment) {
    const appointmentDetail = document.getElementById('appointmentDetail');

    let detailHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <h4 class="text-lg font-medium text-gray-800 mb-4">基本信息</h4>
                <div class="space-y-2">
                    <div class="flex justify-between">
                        <span class="text-gray-600">用户ID:</span>
                        <span class="font-medium">${appointment.openid}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">预约项目:</span>
                        <span class="font-medium">${appointment.service || '未知服务'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">预约时间:</span>
                        <span class="font-medium">${formatDateTime(appointment.appointmentTime)}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">创建时间:</span>
                        <span class="font-medium">${formatDateTime(appointment.createdAt)}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">状态:</span>
                        <span class="font-medium">${getStatusText(appointment.status)}</span>
                    </div>
                </div>
            </div>
            <div>
                <h4 class="text-lg font-medium text-gray-800 mb-4">其他信息</h4>
                <div class="space-y-2">
                    ${appointment.phone ? `
                    <div class="flex justify-between">
                        <span class="text-gray-600">手机号:</span>
                        <span class="font-medium">${appointment.phone}</span>
                    </div>
                    ` : ''}
                    ${appointment.notes ? `
                    <div>
                        <span class="text-gray-600 block mb-1">备注:</span>
                        <p class="font-medium">${appointment.notes}</p>
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    appointmentDetail.innerHTML = detailHTML;

    // 保存当前预约ID
    window.currentAppointmentId = appointment._id;

    document.getElementById('appointmentModal').classList.remove('hidden');
}

// 更新预约状态
async function updateAppointmentStatus(id, status) {
    try {
        const token = localStorage.getItem('adminToken');

        const response = await axios.post('/api/updateAppointmentStatus', {
            token: token,
            id: id,
            status: status
        });

        if (response.data.ok) {
            alert('状态更新成功');
            loadAppointments();
        } else {
            alert('状态更新失败：' + response.data.message);
        }
    } catch (error) {
        console.error('更新预约状态错误:', error);
        alert('状态更新失败，请稍后重试');
    }
}

// 获取状态文本
function getStatusText(status) {
    switch (status) {
        case 'pending':
            return '待审核';
        case 'approved':
            return '已通过';
        case 'rejected':
            return '已拒绝';
        default:
            return '未知';
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
    loadAppointments();

    // 绑定退出登录事件
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // 绑定搜索按钮事件
    document.getElementById('searchBtn').addEventListener('click', function() {
        const keyword = document.getElementById('searchKeyword').value;
        const status = document.getElementById('statusFilter').value;
        loadAppointments(1, status, keyword);
    });

    // 绑定状态筛选事件
    document.getElementById('statusFilter').addEventListener('change', function() {
        const status = this.value;
        loadAppointments(1, status);
    });

    // 绑定模态框关闭事件
    document.getElementById('closeModal').addEventListener('click', function() {
        document.getElementById('appointmentModal').classList.add('hidden');
    });

    // 绑定批准按钮事件
    document.getElementById('approveBtn').addEventListener('click', function() {
        if (window.currentAppointmentId) {
            updateAppointmentStatus(window.currentAppointmentId, 'approved');
            document.getElementById('appointmentModal').classList.add('hidden');
        }
    });

    // 绑定拒绝按钮事件
    document.getElementById('rejectBtn').addEventListener('click', function() {
        if (window.currentAppointmentId) {
            updateAppointmentStatus(window.currentAppointmentId, 'rejected');
            document.getElementById('appointmentModal').classList.add('hidden');
        }
    });

    // 绑定分页按钮事件
    document.getElementById('prevPage').addEventListener('click', function() {
        // 实现分页逻辑
    });

    document.getElementById('nextPage').addEventListener('click', function() {
        // 实现分页逻辑
    });
});