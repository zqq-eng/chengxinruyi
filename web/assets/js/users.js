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

// 生成模拟用户数据
function generateMockUsers() {
    const mustNames = ["张芊芊", "吴欣雨", "陈佳", "马佳琪", "王雅宣"];

    const family = ["赵","钱","孙","李","周","吴","郑","王","冯","陈","褚","卫","蒋","沈","韩","杨","朱","秦","许","何","吕","施","张","孔","曹","严","华","金","魏","陶","姜","戚","谢","邹","喻","柏","水","窦","章","云","苏","潘","葛","奚","范","彭","郎"];
    const given = ["子涵","欣怡","思雨","语彤","若曦","梓萱","雨桐","可欣","佳怡","诗涵","梦琪","依诺","静怡","雨欣","欣妍","婉清","晨曦","雅宣","佳琪","芊芊","欣雨","佳","雨晴","书瑶","梓涵","亦菲","沐晴","语嫣","昕怡","诗琪","一诺","予安","清欢","南栀","念安","星辰","子墨","予希","嘉禾","子衿","明玥"];

    const majors = [
        '计算机科学与技术', '软件工程', '网络工程', '数据科学与大数据技术',
        '人工智能', '电子信息工程', '通信工程', '数学与应用数学', '教育技术学', '物联网工程'
    ];

    const nameSet = new Set(mustNames);
    while (nameSet.size < 50) {
        const n = family[Math.floor(Math.random() * family.length)] + given[Math.floor(Math.random() * given.length)];
        nameSet.add(n);
    }
    const names = Array.from(nameSet);

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

// 加载用户列表
let allUsers = [];
async function loadUsers(page = 1, keyword = '') {
    try {
        const token = localStorage.getItem('adminToken');
        const limit = 100;
        const skip = (page - 1) * limit;

        // 生成模拟用户数据
        const mockUsers = generateMockUsers();

        const response = await axios.post('/api/listUsers', {
            token: token,
            keyword: keyword,
            skip: skip,
            limit: limit
        });

        if (response.data.ok) {
            const realUsers = response.data.data.list || [];
            const total = response.data.data.total;

            // 合并真实用户和模拟用户
            allUsers = keyword ? realUsers : [...realUsers, ...mockUsers];
            const displayUsers = keyword ? allUsers : allUsers;

            document.getElementById('totalUsers').textContent = total + mockUsers.length;
            document.getElementById('showingFrom').textContent = skip + 1;
            document.getElementById('showingTo').textContent = Math.min(skip + limit, displayUsers.length);

            // 分页显示
            const startIdx = skip;
            const endIdx = Math.min(skip + limit, displayUsers.length);
            const pageUsers = displayUsers.slice(startIdx, endIdx);

            renderUserList(pageUsers);
        }
    } catch (error) {
        console.error('加载用户列表错误:', error);
    }
}

// 渲染用户列表
function renderUserList(users) {
    const userList = document.getElementById('userList');
    userList.innerHTML = '';

    users.forEach(user => {
        const tr = document.createElement('tr');
        const isMock = user.isMock === true;
        const rowClass = isMock ? 'bg-yellow-50' : '';
        
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${user.account || ''}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${user.name || ''}${isMock ? ' <span class="text-xs text-yellow-600">(测试)</span>' : ''}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${user.school || ''}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${user.major || ''}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${user.gender || ''}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${user.height || ''}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${user.targetWeight || ''}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${user.phone || ''}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${user.weightCount || 0}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${user.runCount || 0}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${user.createdAtStr || ''}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                ${isMock ? '<span class="text-xs text-yellow-600">模拟用户</span>' : `
                <button onclick="editUser('${user._id}')" class="text-green-600 hover:text-green-900 mr-3">编辑</button>
                <button onclick="deleteUser('${user._id}')" class="text-red-600 hover:text-red-900">删除</button>
                `}
            </td>
        `;
        if (isMock) {
            tr.classList.add('bg-yellow-50');
        }
        userList.appendChild(tr);
    });
}

// 编辑用户
async function editUser(id) {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await axios.post('/api/listUsers', {
            token: token,
            keyword: id
        });

        if (response.data.ok && response.data.data.list.length > 0) {
            const user = response.data.data.list[0];
            document.getElementById('userId').value = user._id;
            document.getElementById('account').value = user.account || '';
            document.getElementById('name').value = user.name || '';
            document.getElementById('school').value = user.school || '';
            document.getElementById('major').value = user.major || '';
            document.getElementById('gender').value = user.gender || '';
            document.getElementById('height').value = user.height || '';
            document.getElementById('targetWeight').value = user.targetWeight || '';
            document.getElementById('phone').value = user.phone || '';

            document.getElementById('userModal').classList.remove('hidden');
        }
    } catch (error) {
        console.error('获取用户信息错误:', error);
    }
}

// 删除用户
function deleteUser(id) {
    if (confirm('确定要删除该用户吗？')) {
        console.log('删除用户:', id);
    }
}

// 保存用户信息
async function saveUser() {
    try {
        const token = localStorage.getItem('adminToken');
        const id = document.getElementById('userId').value;
        const patch = {
            account: document.getElementById('account').value,
            name: document.getElementById('name').value,
            school: document.getElementById('school').value,
            major: document.getElementById('major').value,
            gender: document.getElementById('gender').value,
            height: parseInt(document.getElementById('height').value) || undefined,
            targetWeight: parseInt(document.getElementById('targetWeight').value) || undefined,
            phone: document.getElementById('phone').value
        };

        const response = await axios.post('/api/updateUser', {
            token: token,
            id: id,
            patch: patch
        });

        if (response.data.ok) {
            alert('保存成功');
            document.getElementById('userModal').classList.add('hidden');
            loadUsers();
        } else {
            alert('保存失败：' + response.data.message);
        }
    } catch (error) {
        console.error('保存用户信息错误:', error);
        alert('保存失败，请稍后重试');
    }
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
    loadUsers();

    // 绑定退出登录事件
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // 绑定搜索按钮事件
    document.getElementById('searchBtn').addEventListener('click', function() {
        const keyword = document.getElementById('searchKeyword').value;
        loadUsers(1, keyword);
    });

    // 绑定模态框关闭事件
    document.getElementById('closeModal').addEventListener('click', function() {
        document.getElementById('userModal').classList.add('hidden');
    });

    // 绑定表单提交事件
    document.getElementById('userForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveUser();
    });

    // 绑定分页按钮事件
    document.getElementById('prevPage').addEventListener('click', function() {
        // 实现分页逻辑
    });

    document.getElementById('nextPage').addEventListener('click', function() {
        // 实现分页逻辑
    });

    // 绑定表头排序事件
    document.querySelectorAll('th[data-field]').forEach(th => {
        th.addEventListener('click', function() {
            const field = this.getAttribute('data-field');
            // 实现排序逻辑
        });
    });
});