document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await axios.post('/api/login', {
            username: username,
            password: password
        });

        if (response.data.ok) {
            // 保存token到localStorage
            localStorage.setItem('adminToken', response.data.data.token);
            localStorage.setItem('adminUsername', response.data.data.username);

            // 跳转到主面板
            window.location.href = 'dashboard.html';
        } else {
            alert('登录失败：' + (response.data.message || '账号或密码错误'));
        }
    } catch (error) {
        console.error('登录错误:', error);
        alert('登录失败，请检查代理服务是否启动');
    }
});