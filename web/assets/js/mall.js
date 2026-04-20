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

// 生成模拟商品数据
function generateMockGoods() {
    const mockGoods = [
        {
            _id: 'mock_goods_1',
            title: '健身月卡',
            subtitle: '可享受一个月健身房使用权',
            type: 'time',
            tag: '时长兑换',
            sort: 10,
            costSec: 1800,
            costKm: 0,
            active: true,
            isMock: true
        },
        {
            _id: 'mock_goods_2',
            title: '运动手环',
            subtitle: '智能运动手环，实时监测心率',
            type: 'dist',
            tag: '距离兑换',
            sort: 9,
            costSec: 0,
            costKm: 50,
            active: true,
            isMock: true
        },
        {
            _id: 'mock_goods_3',
            title: '瑜伽垫',
            subtitle: '高弹性瑜伽垫，送收纳袋',
            type: 'both',
            tag: '双条件',
            sort: 8,
            costSec: 3600,
            costKm: 20,
            active: true,
            isMock: true
        },
        {
            _id: 'mock_goods_4',
            title: '蛋白粉',
            subtitle: '健身专用蛋白粉 500g',
            type: 'time',
            tag: '时长兑换',
            sort: 7,
            costSec: 2700,
            costKm: 0,
            active: false,
            isMock: true
        },
        {
            _id: 'mock_goods_5',
            title: '运动水杯',
            subtitle: '大容量运动水杯，保冷保温',
            type: 'dist',
            tag: '距离兑换',
            sort: 6,
            costSec: 0,
            costKm: 15,
            active: true,
            isMock: true
        }
    ];
    return mockGoods;
}

// 加载商品列表
async function loadGoods(page = 1) {
    try {
        const token = localStorage.getItem('adminToken');
        const limit = 100;
        const skip = (page - 1) * limit;

        // 生成模拟商品数据
        const mockGoods = generateMockGoods();

        const response = await axios.post('/api/listMallGoods', {
            token: token,
            skip: 0,
            limit: limit
        });

        if (response.data.ok) {
            const realGoods = response.data.data.list || [];
            const realTotal = response.data.data.total;
            
            // 合并真实商品和模拟商品
            const allGoods = [...realGoods, ...mockGoods];
            const total = realTotal + mockGoods.length;

            document.getElementById('totalGoods').textContent = total;
            document.getElementById('showingFromGoods').textContent = skip + 1;
            document.getElementById('showingToGoods').textContent = Math.min(skip + limit, total);

            renderGoodsList(allGoods);
            console.log('商品数据加载完成！', { 真实商品: realTotal, 模拟商品: mockGoods.length, 总计: total });
        } else {
            // API返回失败，使用模拟数据
            renderGoodsList(mockGoods);
            document.getElementById('totalGoods').textContent = mockGoods.length;
        }
    } catch (error) {
        console.error('加载商品列表错误:', error);
        // 发生错误时使用模拟数据
        const mockGoods = generateMockGoods();
        renderGoodsList(mockGoods);
        document.getElementById('totalGoods').textContent = mockGoods.length;
    }
}

// 渲染商品列表
function renderGoodsList(goods) {
    const container = document.querySelector('#goods-content .grid');
    container.innerHTML = '';

    goods.forEach(item => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-lg shadow overflow-hidden card-shadow';

        const typeText = item.type === 'time' ? '时长' : item.type === 'dist' ? '距离' : '双条件';
        const costMin = item.costSec ? Math.max(0, Math.round(item.costSec / 60)) : 0;

        card.innerHTML = `
            <div class="p-6">
                <div class="flex justify-between items-start mb-4">
                    <h3 class="text-lg font-medium text-gray-900">${item.title}</h3>
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${item.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                        ${item.active ? '启用' : '禁用'}
                    </span>
                </div>
                <p class="text-gray-600 text-sm mb-4">${item.subtitle || '无描述'}</p>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span class="text-gray-500">类型:</span>
                        <span class="font-medium">${typeText}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-500">标签:</span>
                        <span class="font-medium">${item.tag || '无'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-500">排序:</span>
                        <span class="font-medium">${item.sort}</span>
                    </div>
                    ${(item.type === 'time' || item.type === 'both') ? `
                    <div class="flex justify-between">
                        <span class="text-gray-500">时长消耗:</span>
                        <span class="font-medium">${costMin} 分钟</span>
                    </div>
                    ` : ''}
                    ${(item.type === 'dist' || item.type === 'both') ? `
                    <div class="flex justify-between">
                        <span class="text-gray-500">公里消耗:</span>
                        <span class="font-medium">${item.costKm} 公里</span>
                    </div>
                    ` : ''}
                </div>
                <div class="mt-6 flex space-x-3">
                    <button onclick="editGoods(${JSON.stringify(item).replace(/"/g, '&quot;')})" class="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition duration-200 text-sm">
                        编辑
                    </button>
                    <button onclick="deleteGoods('${item._id}')" class="flex-1 border border-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-50 text-sm">
                        删除
                    </button>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

// 加载订单列表
async function loadOrders(page = 1, status = '', openid = '') {
    try {
        const token = localStorage.getItem('adminToken');
        const limit = 10;
        const skip = (page - 1) * limit;

        const response = await axios.post('/api/listMallOrders', {
            token: token,
            status: status,
            openid: openid,
            skip: skip,
            limit: limit
        });

        if (response.data.ok) {
            const orders = response.data.data.list;
            const total = response.data.data.total;

            document.getElementById('totalOrders').textContent = total;
            document.getElementById('showingFromOrders').textContent = skip + 1;
            document.getElementById('showingToOrders').textContent = Math.min(skip + limit, total);

            renderOrderList(orders);
        }
    } catch (error) {
        console.error('加载订单列表错误:', error);
    }
}

// 渲染订单列表
function renderOrderList(orders) {
    const orderList = document.getElementById('orderList');
    orderList.innerHTML = '';

    orders.forEach(order => {
        const tr = document.createElement('tr');

        let statusClass = '';
        let statusText = '';

        switch (order.status) {
            case 'pending':
                statusClass = 'bg-yellow-100 text-yellow-800';
                statusText = '待处理';
                break;
            case 'completed':
                statusClass = 'bg-green-100 text-green-800';
                statusText = '已完成';
                break;
            case 'cancelled':
                statusClass = 'bg-red-100 text-red-800';
                statusText = '已取消';
                break;
            default:
                statusClass = 'bg-gray-100 text-gray-800';
                statusText = '未知';
        }

        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${order._id}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="flex-shrink-0 h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                        <span class="text-gray-600">U</span>
                    </div>
                    <div class="ml-4">
                        <div class="text-sm font-medium text-gray-900">用户 ${order.openid.substring(0, 8)}...</div>
                        <div class="text-sm text-gray-500">${order.openid}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${order.goodsTitle || '未知商品'}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                    ${statusText}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${formatDateTime(order.createdAt)}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button onclick="viewOrderDetail(${JSON.stringify(order).replace(/"/g, '&quot;')})" class="text-purple-600 hover:text-purple-900 mr-3">查看</button>
                <button onclick="updateOrderStatus('${order._id}', 'completed')" class="text-green-600 hover:text-green-900">完成</button>
            </td>
        `;
        orderList.appendChild(tr);
    });
}

// 编辑商品
function editGoods(goods) {
    const type = goods.type || 'time';
    const costSec = goods.costSec || 0;
    const costMin = costSec ? Math.max(0, Math.round(costSec / 60)) : 0;
    
    document.getElementById('goodsId').value = goods._id;
    document.getElementById('title').value = goods.title;
    document.getElementById('subtitle').value = goods.subtitle || '';
    document.getElementById('type').value = type;
    document.getElementById('tag').value = goods.tag || (type === 'time' ? '时长兑换' : type === 'dist' ? '距离兑换' : '双条件');
    document.getElementById('sort').value = goods.sort || 10;
    document.getElementById('costMin').value = type === 'dist' ? 0 : (costMin || 1);
    document.getElementById('costKm').value = type === 'time' ? 0 : (goods.costKm || 1);
    document.getElementById('active').value = goods.active ? 'true' : 'false';
    document.getElementById('modalTitle').textContent = '编辑商品';
    
    // 更新字段显示
    updateTypeFields(type);
    
    document.getElementById('goodsModal').classList.remove('hidden');
}

// 保存商品
async function saveGoods() {
    try {
        const token = localStorage.getItem('adminToken');
        const id = document.getElementById('goodsId').value;
        const title = document.getElementById('title').value.trim();
        const subtitle = document.getElementById('subtitle').value.trim();
        const type = document.getElementById('type').value;
        const tag = document.getElementById('tag').value.trim();
        const sort = parseInt(document.getElementById('sort').value) || 10;
        const active = document.getElementById('active').value === 'true';
        
        const costMin = parseInt(document.getElementById('costMin').value) || 0;
        const costKm = parseInt(document.getElementById('costKm').value) || 0;

        let costSec = 0;
        let finalKm = 0;

        if (type === 'time') {
            if (costMin < 1) {
                alert('时长兑换不能小于 1 分钟');
                return;
            }
            costSec = Math.round(costMin * 60);
            finalKm = 0;
        } else if (type === 'dist') {
            if (costKm < 1) {
                alert('距离兑换不能小于 1 km');
                return;
            }
            costSec = 0;
            finalKm = costKm;
        } else {
            if (costMin < 1) {
                alert('时长不能小于 1 分钟');
                return;
            }
            if (costKm < 1) {
                alert('距离不能小于 1 km');
                return;
            }
            costSec = Math.round(costMin * 60);
            finalKm = costKm;
        }

        const data = {
            title: title,
            subtitle: subtitle,
            type: type,
            tag: tag,
            sort: sort,
            active: active,
            costSec: costSec,
            costKm: finalKm
        };

        const response = await axios.post('/api/upsertMallGoods', {
            token: token,
            id: id,
            data: data
        });

        if (response.data.ok) {
            alert('保存成功');
            document.getElementById('goodsModal').classList.add('hidden');
            loadGoods();
        } else {
            alert('保存失败：' + response.data.message);
        }
    } catch (error) {
        console.error('保存商品错误:', error);
        alert('保存失败，请稍后重试');
    }
}

// 删除商品
function deleteGoods(id) {
    if (confirm('确定要删除该商品吗？')) {
        console.log('删除商品:', id);
    }
}

// 查看订单详情
function viewOrderDetail(order) {
    console.log('查看订单详情:', order);
}

// 更新订单状态
async function updateOrderStatus(id, status) {
    try {
        const token = localStorage.getItem('adminToken');

        const response = await axios.post('/api/updateMallOrder', {
            token: token,
            id: id,
            patch: { status: status }
        });

        if (response.data.ok) {
            alert('状态更新成功');
            loadOrders();
        } else {
            alert('状态更新失败：' + response.data.message);
        }
    } catch (error) {
        console.error('更新订单状态错误:', error);
        alert('状态更新失败，请稍后重试');
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

// 更新类型字段显示
function updateTypeFields(type) {
    const costMinContainer = document.getElementById('costMinContainer');
    const costKmContainer = document.getElementById('costKmContainer');
    
    if (type === 'time') {
        costMinContainer.classList.remove('hidden');
        costKmContainer.classList.add('hidden');
    } else if (type === 'dist') {
        costMinContainer.classList.add('hidden');
        costKmContainer.classList.remove('hidden');
    } else {
        costMinContainer.classList.remove('hidden');
        costKmContainer.classList.remove('hidden');
    }
    
    // 更新标签
    const tagInput = document.getElementById('tag');
    if (!tagInput.value) {
        tagInput.value = type === 'time' ? '时长兑换' : type === 'dist' ? '距离兑换' : '双条件';
    }
}

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    checkLogin();
    loadGoods();

    // 绑定退出登录事件
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // 绑定选项卡切换事件
    document.querySelectorAll('#mallTabs button').forEach(tab => {
        tab.addEventListener('click', function() {
            // 移除所有选项卡的活动状态
            document.querySelectorAll('#mallTabs button').forEach(t => {
                t.classList.remove('border-green-600', 'text-green-600');
                t.classList.add('border-transparent', 'hover:text-gray-600', 'hover:border-gray-300');
                t.setAttribute('aria-selected', 'false');
            });

            // 添加当前选项卡的活动状态
            this.classList.remove('border-transparent', 'hover:text-gray-600', 'hover:border-gray-300');
            this.classList.add('border-green-600', 'text-green-600');
            this.setAttribute('aria-selected', 'true');

            // 隐藏所有内容区域
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.add('hidden');
            });

            // 显示当前选项卡的内容
            const tabId = this.getAttribute('data-tab');
            document.getElementById(`${tabId}-content`).classList.remove('hidden');

            // 加载对应的数据
            if (tabId === 'orders') {
                loadOrders();
            }
        });
    });

    // 绑定类型变更事件
    document.getElementById('type').addEventListener('change', function() {
        const type = this.value;
        updateTypeFields(type);
    });

    // 绑定添加商品按钮事件
    document.getElementById('addGoodsBtn').addEventListener('click', function() {
        document.getElementById('goodsId').value = '';
        document.getElementById('title').value = '';
        document.getElementById('subtitle').value = '';
        document.getElementById('type').value = 'time';
        document.getElementById('tag').value = '时长兑换';
        document.getElementById('sort').value = '10';
        document.getElementById('costMin').value = '1';
        document.getElementById('costKm').value = '1';
        document.getElementById('active').value = 'true';
        document.getElementById('modalTitle').textContent = '添加商品';
        
        // 更新字段显示
        updateTypeFields('time');
        
        document.getElementById('goodsModal').classList.remove('hidden');
    });

    // 绑定关闭商品模态框事件
    document.getElementById('closeGoodsModal').addEventListener('click', function() {
        document.getElementById('goodsModal').classList.add('hidden');
    });

    // 绑定商品表单提交事件
    document.getElementById('goodsForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveGoods();
    });

    // 绑定商品搜索按钮事件
    document.getElementById('goodsSearchBtn').addEventListener('click', function() {
        loadGoods();
    });

    // 绑定订单搜索按钮事件
    document.getElementById('orderSearchBtn').addEventListener('click', function() {
        const keyword = document.getElementById('orderSearch').value;
        loadOrders(1, '', keyword);
    });
});