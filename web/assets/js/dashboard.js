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

// 生成模拟用户数据（参考adminUser.js）
function generateMockUsers() {
    const mustNames = ["张芊芊", "吴欣雨", "陈佳", "马佳琪", "王雅宣"];

    const family = ["赵","钱","孙","李","周","吴","郑","王","冯","陈","褚","卫","蒋","沈","韩","杨","朱","秦","许","何","吕","施","张","孔","曹","严","华","金","魏","陶","姜","戚","谢","邹","喻","柏","水","窦","章","云","苏","潘","葛","奚","范","彭","郎"];
    const given = ["子涵","欣怡","思雨","语彤","若曦","梓萱","雨桐","可欣","佳怡","诗涵","梦琪","依诺","静怡","雨欣","欣妍","婉清","晨曦","雅宣","佳琪","芊芊","欣雨","佳","雨晴","书瑶","梓涵","亦菲","沐晴","语嫣","昕怡","诗琪","一诺","予安","清欢","南栀","念安","星辰","子墨","予希","嘉禾","子衿","明玥"];

    const majors = [
        '计算机科学与技术', '软件工程', '网络工程', '数据科学与大数据技术',
        '人工智能', '电子信息工程', '通信工程', '数学与应用数学', '教育技术学', '物联网工程'
    ];

    // 生成随机不重复姓名
    const nameSet = new Set(mustNames);
    while (nameSet.size < 50) {
        const n = family[Math.floor(Math.random() * family.length)] + given[Math.floor(Math.random() * given.length)];
        nameSet.add(n);
    }
    const names = Array.from(nameSet);

    // 生成50个模拟用户
    const mockUsers = names.map((name, idx) => {
        const idx_num = idx + 1;
        const gender = idx_num % 2 === 0 ? '男' : '女';
        const height = gender === '男' ? Math.floor(Math.random() * (185 - 168 + 1)) + 168 : Math.floor(Math.random() * (172 - 156 + 1)) + 156;
        const targetWeight = gender === '男' ? Math.floor(Math.random() * (76 - 58 + 1)) + 58 : Math.floor(Math.random() * (60 - 45 + 1)) + 45;

        return {
            _id: `mock_${idx_num}`,
            openid: `mock_openid_${idx_num}`,
            account: `yau${String(idx_num).padStart(3, '0')}`,
            name: name,
            school: '延安大学',
            major: majors[idx_num % majors.length],
            gender: gender,
            height: height,
            targetWeight: targetWeight,
            phone: `13${Math.floor(Math.random() * 900000000 + 100000000)}`,
            createdAt: mockDateStr(idx_num),
            createdAtStr: mockDateStr(idx_num),
            weightCount: Math.floor(Math.random() * (12 - 4 + 1)) + 4,
            runCount: Math.floor(Math.random() * (10 - 3 + 1)) + 3,
            isMock: true
        };
    });

    return mockUsers;
}

function mockDateStr(seed) {
    const d = new Date();
    d.setDate(d.getDate() - (seed % 180));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
}

// 加载统计数据
async function loadStats() {
    try {
        const token = localStorage.getItem('adminToken');

        // 生成模拟用户数据
        const mockUsers = generateMockUsers();

        // 计算模拟用户的总运动次数
        const mockSportCount = mockUsers.reduce((sum, user) => sum + (user.runCount || 0), 0);

        // 并行加载所有数据
        const [usersResponse, runsResponse, appointmentsResponse, ordersResponse] = await Promise.all([
            axios.post('/api/listUsers', {
                token: token,
                limit: 100
            }).catch(() => ({ data: { ok: false, data: { total: 0, list: [] } } })),
            axios.post('/api/listRuns', {
                token: token,
                limit: 1
            }).catch(() => ({ data: { ok: false, data: { total: 0, list: [] } } })),
            axios.post('/api/listAppointments', {
                token: token,
                limit: 1
            }).catch(() => ({ data: { ok: false, data: { total: 0, list: [] } } })),
            axios.post('/api/listMallOrders', {
                token: token,
                limit: 1
            }).catch(() => ({ data: { ok: false, data: { total: 0, list: [] } } }))
        ]);

        // 处理用户数据
        let allUsers = [...mockUsers];
        let realUserCount = 0;

        if (usersResponse.data.ok) {
            const realUsers = usersResponse.data.data.list || [];
            realUserCount = usersResponse.data.data.total;
            allUsers = [...realUsers, ...mockUsers];
        }

        const totalUserCount = realUserCount + mockUsers.length;
        document.getElementById('userCount').textContent = totalUserCount;
        loadRecentUsers(allUsers.slice(0, 5));

        // 处理运动数据（真实数据 + 模拟数据）
        let realSportCount = 0;
        if (runsResponse.data.ok) {
            realSportCount = runsResponse.data.data.total || 0;
        }
        const totalSportCount = realSportCount + mockSportCount;
        document.getElementById('sportCount').textContent = totalSportCount;

        // 处理预约数据
        if (appointmentsResponse.data.ok) {
            document.getElementById('appointmentCount').textContent = appointmentsResponse.data.data.total || 0;
        }

        // 处理订单数据
        if (ordersResponse.data.ok) {
            document.getElementById('orderCount').textContent = ordersResponse.data.data.total || 0;
        }

        console.log('统计数据加载完成！', {
            真实用户: realUserCount,
            模拟用户: mockUsers.length,
            真实运动记录: realSportCount,
            模拟运动记录: mockSportCount,
            总运动记录: totalSportCount
        });
    } catch (error) {
        console.error('加载统计数据错误:', error);
        console.log('前端页面已正常加载，数据显示可能为模拟数据');
    }
}

// 加载最近用户列表
function loadRecentUsers(users) {
    const userList = document.getElementById('userList');
    userList.innerHTML = '';

    // 取最近的5个用户
    const recentUsers = users.slice(0, 5);

    recentUsers.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="flex-shrink-0 h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                        <span class="text-green-600">${(user.name || user.nickName || 'U').charAt(0).toUpperCase()}</span>
                    </div>
                    <div class="ml-4">
                        <div class="text-sm font-medium text-gray-900">${user.name || user.nickName || '未知用户'}</div>
                        <div class="text-sm text-gray-500">${user.phone || '无手机号'}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${user.createdAtStr || formatDate(user.createdAt)}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${user.weightCount || 0}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${user.runCount || 0}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <a href="users.html?id=${user._id}" class="text-green-600 hover:text-green-900 mr-3">编辑</a>
                <a href="#" class="text-red-600 hover:text-red-900">删除</a>
            </td>
        `;
        userList.appendChild(tr);
    });
}

// 格式化日期
function formatDate(date) {
    if (!date) return '未知';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    loadStats();
    initCharts();

    // 绑定退出登录事件
    document.getElementById('logoutBtn').addEventListener('click', logout);
});

// 初始化图表 - 蓝绿色科技水光动感风格
function initCharts() {
    // 注册渐变插件
    Chart.register({
        id: 'gradientPlugin',
        beforeDatasetsDraw: function(chart) {
            if (chart.ctx.createLinearGradient) {
                chart.data.datasets.forEach(function(dataset) {
                    if (!dataset.backgroundGradient) {
                        const ctx = chart.ctx;
                        const gradient = ctx.createLinearGradient(0, 0, 0, chart.height);
                        gradient.addColorStop(0, 'rgba(0, 206, 201, 0.3)');
                        gradient.addColorStop(1, 'rgba(0, 150, 136, 0.05)');
                        dataset.backgroundGradient = gradient;
                    }
                });
            }
        }
    });

    // 用户增长趋势图 - 水流动感
    const userGrowthCtx = document.getElementById('userGrowthChart').getContext('2d');
    const userGradient = userGrowthCtx.createLinearGradient(0, 0, 0, 320);
    userGradient.addColorStop(0, 'rgba(0, 211, 212, 0.8)');
    userGradient.addColorStop(0.5, 'rgba(0, 188, 212, 0.5)');
    userGradient.addColorStop(1, 'rgba(0, 150, 136, 0.1)');
    
    new Chart(userGrowthCtx, {
        type: 'line',
        data: {
            labels: ['1月', '2月', '3月', '4月', '5月', '6月'],
            datasets: [{
                label: '用户增长',
                data: [12, 19, 3, 5, 2, 3],
                borderColor: '#00D4D4',
                backgroundColor: userGradient,
                borderWidth: 3,
                tension: 0.5,
                fill: true,
                pointBackgroundColor: '#00D4D4',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 10,
                pointShadowBlur: 10,
                pointShadowColor: 'rgba(0, 211, 212, 0.8)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#00897B',
                        font: { size: 13, weight: '500' },
                        padding: 20,
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
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            return ' 用户增长: ' + context.parsed.y + ' 人';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 150, 136, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#00897B',
                        font: { size: 12 },
                        padding: 10
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#00897B',
                        font: { size: 12 },
                        padding: 10
                    }
                }
            },
            animation: {
                duration: 2000,
                easing: 'easeOutQuart'
            }
        }
    });

    // 运动类型分布图 - 水晶环形
    const sportTypeCtx = document.getElementById('sportTypeChart').getContext('2d');
    new Chart(sportTypeCtx, {
        type: 'doughnut',
        data: {
            labels: ['跑步', '健身', '骑行', '其他'],
            datasets: [{
                data: [30, 25, 20, 25],
                backgroundColor: [
                    'rgba(0, 211, 212, 0.85)',
                    'rgba(0, 188, 212, 0.85)',
                    'rgba(0, 150, 136, 0.85)',
                    'rgba(38, 166, 154, 0.85)'
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
            cutout: '60%',
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
                    padding: 12
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

    // 商品状态分布图 - 水波饼图
    const goodsStatusCtx = document.getElementById('goodsStatusChart').getContext('2d');
    new Chart(goodsStatusCtx, {
        type: 'pie',
        data: {
            labels: ['启用', '禁用'],
            datasets: [{
                data: [80, 20],
                backgroundColor: [
                    'rgba(0, 211, 212, 0.85)',
                    'rgba(244, 67, 54, 0.75)'
                ],
                borderWidth: 3,
                borderColor: '#ffffff',
                hoverBorderWidth: 5,
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
                            return ' ' + context.label + ': ' + context.parsed + '%';
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

    // 预约状态分布图 - 水光柱状图
    const appointmentStatusCtx = document.getElementById('appointmentStatusChart').getContext('2d');
    const barGradient1 = appointmentStatusCtx.createLinearGradient(0, 0, 0, 300);
    barGradient1.addColorStop(0, 'rgba(0, 211, 212, 0.9)');
    barGradient1.addColorStop(1, 'rgba(0, 188, 212, 0.6)');
    
    const barGradient2 = appointmentStatusCtx.createLinearGradient(0, 0, 0, 300);
    barGradient2.addColorStop(0, 'rgba(0, 150, 136, 0.9)');
    barGradient2.addColorStop(1, 'rgba(0, 188, 212, 0.6)');
    
    const barGradient3 = appointmentStatusCtx.createLinearGradient(0, 0, 0, 300);
    barGradient3.addColorStop(0, 'rgba(244, 67, 54, 0.85)');
    barGradient3.addColorStop(1, 'rgba(239, 83, 80, 0.6)');

    new Chart(appointmentStatusCtx, {
        type: 'bar',
        data: {
            labels: ['待处理', '已完成', '已取消'],
            datasets: [{
                label: '预约数量',
                data: [12, 28, 5],
                backgroundColor: [barGradient1, barGradient2, barGradient3],
                borderWidth: 0,
                borderRadius: 8,
                borderSkipped: false,
                barThickness: 40,
                shadowBlur: 10,
                shadowColor: 'rgba(0, 211, 212, 0.3)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
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
                            return ' 预约数量: ' + context.parsed.y + ' 个';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 150, 136, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#00897B',
                        font: { size: 12 },
                        padding: 10
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#00897B',
                        font: { size: 12, weight: '500' },
                        padding: 10
                    }
                }
            },
            animation: {
                duration: 2000,
                easing: 'easeOutQuart'
            }
        }
    });

    // 每日活动趋势图 - 水流动感
    const dailyActivityCtx = document.getElementById('dailyActivityChart').getContext('2d');
    const activityGradient = dailyActivityCtx.createLinearGradient(0, 0, 0, 320);
    activityGradient.addColorStop(0, 'rgba(0, 211, 212, 0.6)');
    activityGradient.addColorStop(0.5, 'rgba(0, 188, 212, 0.3)');
    activityGradient.addColorStop(1, 'rgba(0, 150, 136, 0.05)');
    
    new Chart(dailyActivityCtx, {
        type: 'line',
        data: {
            labels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
            datasets: [{
                label: '活动次数',
                data: [12, 19, 15, 25, 22, 30, 28],
                borderColor: '#00D4D4',
                backgroundColor: activityGradient,
                borderWidth: 3,
                tension: 0.5,
                fill: true,
                pointBackgroundColor: '#00D4D4',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 10,
                pointShadowBlur: 10,
                pointShadowColor: 'rgba(0, 211, 212, 0.8)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#00897B',
                        font: { size: 13, weight: '500' },
                        padding: 20,
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
                            return ' 活动次数: ' + context.parsed.y + ' 次';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 150, 136, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#00897B',
                        font: { size: 12 },
                        padding: 10
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#00897B',
                        font: { size: 12 },
                        padding: 10
                    }
                }
            },
            animation: {
                duration: 2000,
                easing: 'easeOutQuart'
            }
        }
    });

    // 消息类型分布图 - 水晶环形
    const messageTypeCtx = document.getElementById('messageTypeChart').getContext('2d');
    new Chart(messageTypeCtx, {
        type: 'doughnut',
        data: {
            labels: ['通知', '活动', '系统', '兑换'],
            datasets: [{
                data: [45, 25, 15, 15],
                backgroundColor: [
                    'rgba(0, 211, 212, 0.85)',
                    'rgba(0, 188, 212, 0.85)',
                    'rgba(0, 150, 136, 0.85)',
                    'rgba(38, 166, 154, 0.85)'
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
            cutout: '60%',
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
                    padding: 12
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

    // 订单状态分布图 - 水光柱状图
    const orderStatusCtx = document.getElementById('orderStatusChart').getContext('2d');
    const orderGradient1 = orderStatusCtx.createLinearGradient(0, 0, 0, 300);
    orderGradient1.addColorStop(0, 'rgba(255, 193, 7, 0.9)');
    orderGradient1.addColorStop(1, 'rgba(255, 205, 86, 0.6)');
    
    const orderGradient2 = orderStatusCtx.createLinearGradient(0, 0, 0, 300);
    orderGradient2.addColorStop(0, 'rgba(0, 211, 212, 0.9)');
    orderGradient2.addColorStop(1, 'rgba(0, 188, 212, 0.6)');
    
    const orderGradient3 = orderStatusCtx.createLinearGradient(0, 0, 0, 300);
    orderGradient3.addColorStop(0, 'rgba(244, 67, 54, 0.85)');
    orderGradient3.addColorStop(1, 'rgba(239, 83, 80, 0.6)');
    
    const orderGradient4 = orderStatusCtx.createLinearGradient(0, 0, 0, 300);
    orderGradient4.addColorStop(0, 'rgba(33, 150, 243, 0.85)');
    orderGradient4.addColorStop(1, 'rgba(66, 165, 245, 0.6)');

    new Chart(orderStatusCtx, {
        type: 'bar',
        data: {
            labels: ['待处理', '已通过', '已拒绝', '已发货'],
            datasets: [{
                label: '订单数量',
                data: [8, 25, 3, 15],
                backgroundColor: [orderGradient1, orderGradient2, orderGradient3, orderGradient4],
                borderWidth: 0,
                borderRadius: 8,
                borderSkipped: false,
                barThickness: 35,
                shadowBlur: 10,
                shadowColor: 'rgba(0, 211, 212, 0.3)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
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
                            return ' 订单数量: ' + context.parsed.y + ' 个';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 150, 136, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#00897B',
                        font: { size: 12 },
                        padding: 10
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#00897B',
                        font: { size: 12, weight: '500' },
                        padding: 10
                    }
                }
            },
            animation: {
                duration: 2000,
                easing: 'easeOutQuart'
            }
        }
    });

    // 运动时长分布图 - 水波饼图
    const sportDurationCtx = document.getElementById('sportDurationChart').getContext('2d');
    new Chart(sportDurationCtx, {
        type: 'pie',
        data: {
            labels: ['0-15分钟', '15-30分钟', '30-60分钟', '60分钟以上'],
            datasets: [{
                data: [20, 35, 30, 15],
                backgroundColor: [
                    'rgba(0, 211, 212, 0.85)',
                    'rgba(0, 188, 212, 0.85)',
                    'rgba(0, 150, 136, 0.85)',
                    'rgba(38, 166, 154, 0.85)'
                ],
                borderWidth: 3,
                borderColor: '#ffffff',
                hoverBorderWidth: 5,
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
                            return ' ' + context.label + ': ' + context.parsed + '%';
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