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

// 辅助函数
function pad2(n) { return String(n).padStart(2, "0"); }

function secToStr(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}`;
}

function formatDurationHuman(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}小时${m}分${s}秒`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

function dateToStr(d) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${y}-${m}-${dd}`;
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function randFloat(a, b, fix = 2) { return (Math.random() * (b - a) + a).toFixed(fix); }

function paceFrom(distanceKm, durationSec) {
  const dk = Math.max(0.01, Number(distanceKm) || 0.01);
  const secPerKm = durationSec / dk;
  const mm = Math.floor(secPerKm / 60);
  const ss = Math.floor(secPerKm % 60);
  return `${pad2(mm)}'${pad2(ss)}"`;
}

// 生成模拟数据
function generateMockData() {
  const mustNames = ["张芊芊", "吴欣雨", "陈佳", "马佳琪", "王雅宣"];

  const family = ["赵","钱","孙","李","周","吴","郑","王","冯","陈","褚","卫","蒋","沈","韩","杨","朱","秦","许","何","吕","施","张","孔","曹","严","华","金","魏","陶","姜","戚","谢","邹","喻","柏","水","窦","章","云","苏","潘","葛","奚","范","彭","郎"];
  const given = ["子涵","欣怡","思雨","语彤","若曦","梓萱","雨桐","可欣","佳怡","诗涵","梦琪","依诺","静怡","雨欣","欣妍","婉清","晨曦","雅宣","佳琪","芊芊","欣雨","佳","雨晴","书瑶","梓涵","亦菲","沐晴","语嫣","昕怡","诗琪","一诺","予安","清欢","南栀","念安","星辰","子墨","予希","嘉禾","子衿","明玥"];

  // 生成随机不重复姓名
  const nameSet = new Set(mustNames);
  while (nameSet.size < 50) {
    const n = family[randInt(0, family.length - 1)] + given[randInt(0, given.length - 1)];
    nameSet.add(n);
  }
  const names = Array.from(nameSet);

  // 生成 50 用户
  const users = names.map((name, idx) => {
    const i = idx + 1;
    return {
      openid: `mock_openid_${pad2(i)}_${randInt(1000, 9999)}`,
      account: `2026${pad2(randInt(10, 99))}${pad2(randInt(10, 99))}${pad2(i)}`, // 类似账号
      name
    };
  });

  // 生成每个用户的跑步记录
  const runsByOpenid = {}; // oid -> runs[]
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  // 最近 30 天范围
  const daysRange = 30;

  users.forEach(u => {
    const runCount = randInt(6, 40); // 每人 6~40 条
    const runs = [];

    for (let k = 0; k < runCount; k++) {
      const backDays = randInt(0, daysRange - 1);
      const d = new Date(today.getTime() - backDays * 24 * 3600 * 1000);

      // 距离 1.0 ~ 12.0km
      const distanceKm = Number(randFloat(1.0, 12.0, 2));
      // 配速大约 4'30" ~ 9'00" => 秒/公里 270~540
      const secPerKm = randInt(270, 540);
      const durationSec = Math.floor(distanceKm * secPerKm);

      const avgSpeedKmh = (distanceKm / (durationSec / 3600));
      const lastSpeedKmh = avgSpeedKmh * (randInt(90, 110) / 100);

      runs.push({
        _id: `mock_run_${u.openid}_${k}_${randInt(10000, 99999)}`,
        _openid: u.openid,
        type: "run",
        dateStr: dateToStr(d),
        distanceKm: distanceKm.toFixed(2),
        duration: durationSec,
        durationStr: secToStr(durationSec),
        paceStr: paceFrom(distanceKm, durationSec),
        movingPaceStr: paceFrom(distanceKm, Math.floor(durationSec * randInt(92, 100) / 100)),
        avgSpeedKmh: avgSpeedKmh.toFixed(1),
        lastSpeedKmh: lastSpeedKmh.toFixed(1)
      });
    }

    // 按日期倒序
    runs.sort((a, b) => (b.dateStr > a.dateStr ? 1 : -1));
    runsByOpenid[u.openid] = runs;
  });

  return { users, runsByOpenid };
}

// 构建用户统计数据
function buildUserStats(mock) {
  const { users, runsByOpenid } = mock;

  let totalRuns = 0;
  let totalDistance = 0;
  let totalDurationSec = 0;

  const userStats = users.map(u => {
    const runs = runsByOpenid[u.openid] || [];
    const cnt = runs.length;

    let dist = 0;
    let dur = 0;

    runs.forEach(r => {
      dist += Number(r.distanceKm);
      dur += Number(r.duration);
    });

    totalRuns += cnt;
    totalDistance += dist;
    totalDurationSec += dur;

    return {
      openid: u.openid,
      account: u.account,
      name: u.name,
      runCount: cnt,
      totalDistance: dist.toFixed(2),
      totalDurationSec: dur,
      totalDurationStr: formatDurationHuman(dur),
      avgDistance: cnt ? (dist / cnt).toFixed(2) : "0.00"
    };
  });

  // 排序：次数 desc，其次里程 desc
  userStats.sort((a, b) => (b.runCount - a.runCount) || (Number(b.totalDistance) - Number(a.totalDistance)));

  return {
    userStats,
    totalUsers: userStats.length,
    totalRuns,
    totalDistance: totalDistance.toFixed(2),
    totalDurationSec,
    totalDurationStr: formatDurationHuman(totalDurationSec)
  };
}

// 构建图表数据
function buildChartSeries(mock, days = 14, type = "runs") {
  const { runsByOpenid } = mock;
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  // labels: 从旧到新
  const labels = [];
  const statMap = {}; // dateStr -> {runs, durationSec}

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 3600 * 1000);
    const ds = dateToStr(d);
    labels.push(ds.slice(5)); // MM-DD 更紧凑
    statMap[ds] = { runs: 0, durationSec: 0 };
  }

  Object.keys(runsByOpenid).forEach(oid => {
    (runsByOpenid[oid] || []).forEach(r => {
      const ds = r.dateStr;
      if (statMap[ds]) {
        statMap[ds].runs += 1;
        statMap[ds].durationSec += Number(r.duration);
      }
    });
  });

  const values = Object.keys(statMap).map(ds => {
    const v = statMap[ds];
    if (type === "duration") {
      // 用“分钟”显示更直观
      return Math.round((v.durationSec || 0) / 60);
    }
    return v.runs || 0;
  });

  return { labels, values };
}

// 渲染用户运动统计列表
function renderSportList(users) {
  const sportList = document.getElementById('sportList');
  sportList.innerHTML = '';

  users.forEach(user => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="px-6 py-4 whitespace-nowrap">
        <div class="flex items-center">
          <div class="flex-shrink-0 h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
            <span class="text-green-600">${user.name.charAt(0)}</span>
          </div>
          <div class="ml-4">
            <div class="text-sm font-medium text-gray-900">${user.name}</div>
            <div class="text-sm text-gray-500">${user.openid}</div>
          </div>
        </div>
      </td>
      <td class="px-6 py-4 whitespace-nowrap">
        <div class="text-sm text-gray-900">${user.account}</div>
      </td>
      <td class="px-6 py-4 whitespace-nowrap">
        <div class="text-sm text-gray-900">${user.runCount}</div>
      </td>
      <td class="px-6 py-4 whitespace-nowrap">
        <div class="text-sm text-gray-900">${user.totalDistance}</div>
      </td>
      <td class="px-6 py-4 whitespace-nowrap">
        <div class="text-sm text-gray-900">${user.totalDurationStr}</div>
      </td>
      <td class="px-6 py-4 whitespace-nowrap">
        <div class="text-sm text-gray-900">${user.avgDistance}</div>
      </td>
      <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
        <button onclick="viewUserDetail('${user.openid}')" class="text-green-600 hover:text-green-900">查看</button>
      </td>
    `;
    sportList.appendChild(tr);
  });
}

// 查看用户运动详情
function viewUserDetail(openid) {
  // 实现详情查看功能
  alert('查看用户运动详情：' + openid);
}

// 初始化图表 - 蓝绿色科技水光动感风格
let trendChart = null;
function initChart(labels, values, type = 'runs') {
  const ctx = document.getElementById('trendChart').getContext('2d');
  
  // 创建渐变背景
  const gradient = ctx.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, 'rgba(0, 211, 212, 0.6)');
  gradient.addColorStop(0.5, 'rgba(0, 188, 212, 0.3)');
  gradient.addColorStop(1, 'rgba(0, 150, 136, 0.05)');
  
  if (trendChart) {
    trendChart.destroy();
  }
  
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: type === 'runs' ? '运动次数' : '运动时长（分钟）',
        data: values,
        borderColor: '#00D4D4',
        backgroundColor: gradient,
        borderWidth: 3,
        tension: 0.5,
        fill: true,
        pointBackgroundColor: '#00D4D4',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 10,
        pointShadowBlur: 15,
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
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(0, 105, 112, 0.9)',
          titleColor: '#E0F2F1',
          bodyColor: '#B2DFDB',
          borderColor: '#00D4D4',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          callbacks: {
            label: function(context) {
              return type === 'runs' 
                ? ' 运动次数: ' + context.parsed.y + ' 次'
                : ' 运动时长: ' + context.parsed.y + ' 分钟';
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
}

// 加载运动统计
let mockData = null;
async function loadSportStats() {
  try {
    // 生成假数据
    mockData = generateMockData();
    
    // 生成表格统计
    const summary = buildUserStats(mockData);
    
    // 更新统计卡片
    document.getElementById('totalUsers').textContent = summary.totalUsers;
    document.getElementById('totalRuns').textContent = summary.totalRuns;
    document.getElementById('totalDistance').textContent = summary.totalDistance;
    document.getElementById('totalDurationStr').textContent = summary.totalDurationStr;
    document.getElementById('totalRecords').textContent = summary.totalUsers;
    
    // 渲染用户列表
    renderSportList(summary.userStats);
    
    // 生成图表数据
    const { labels, values } = buildChartSeries(mockData, 14, 'runs');
    
    // 初始化图表
    initChart(labels, values, 'runs');
  } catch (error) {
    console.error('加载运动统计失败:', error);
  }
}

// 切换图表类型
function switchChartType(type) {
  if (!mockData) return;
  
  // 更新按钮状态
  document.getElementById('chartTypeRuns').className = type === 'runs' ? 'px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-200' : 'px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-green-600 hover:text-white transition duration-200';
  document.getElementById('chartTypeDuration').className = type === 'duration' ? 'px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-200' : 'px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-green-600 hover:text-white transition duration-200';
  
  // 生成图表数据
  const { labels, values } = buildChartSeries(mockData, 14, type);
  
  // 更新图表
  initChart(labels, values, type);
}

// 导出汇总
function exportSummary() {
  if (!mockData) return;
  
  const summary = buildUserStats(mockData);
  const rows = [];
  rows.push(["姓名", "账号", "运动次数", "累计里程(km)", "总运动时长", "平均每次(km)"]);
  
  summary.userStats.forEach(u => {
    rows.push([
      u.name || "",
      u.account || "",
      u.runCount || 0,
      u.totalDistance || "0.00",
      u.totalDurationStr || "",
      u.avgDistance || "0.00"
    ]);
  });
  
  // 最后一行加总览
  rows.push([]);
  rows.push(["总览", "", `参与总用户=${summary.totalUsers}`, `总里程=${summary.totalDistance}km`, `总时长=${summary.totalDurationStr}`, `总次数=${summary.totalRuns}`]);
  
  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `运动统计_汇总_${Date.now()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// 导出明细
function exportDetails() {
  if (!mockData) return;
  
  const { users, runsByOpenid } = mockData;
  const userMap = {};
  users.forEach(u => { userMap[u.openid] = u; });
  
  const rows = [];
  rows.push(["姓名", "账号", "日期", "距离(km)", "用时", "配速", "移动配速", "均速(km/h)", "末速(km/h)"]);
  
  let totalLines = 0;
  
  Object.keys(runsByOpenid).forEach(oid => {
    const u = userMap[oid] || { name: "", account: "" };
    const runs = runsByOpenid[oid] || [];
    runs.forEach(r => {
      rows.push([
        u.name || "",
        u.account || "",
        r.dateStr || "",
        r.distanceKm || "0.00",
        r.durationStr || "",
        r.paceStr || "",
        r.movingPaceStr || "",
        r.avgSpeedKmh || "",
        r.lastSpeedKmh || ""
      ]);
      totalLines++;
    });
  });
  
  if (totalLines === 0) return;
  
  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `运动统计_明细_${Date.now()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
    loadSportStats();

    // 绑定退出登录事件
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // 绑定搜索按钮事件
    document.getElementById('searchBtn').addEventListener('click', function() {
        const keyword = document.getElementById('searchKeyword').value;
        // 实现搜索功能
        console.log('搜索:', keyword);
    });

    // 绑定图表类型切换事件
    document.getElementById('chartTypeRuns').addEventListener('click', function() {
        switchChartType('runs');
    });
    
    document.getElementById('chartTypeDuration').addEventListener('click', function() {
        switchChartType('duration');
    });

    // 绑定导出按钮事件
    document.getElementById('exportSummary').addEventListener('click', exportSummary);
    document.getElementById('exportDetails').addEventListener('click', exportDetails);

    // 绑定模态框关闭事件
    document.getElementById('closeModal').addEventListener('click', function() {
        document.getElementById('sportModal').classList.add('hidden');
    });

    // 绑定分页按钮事件
    document.getElementById('prevPage').addEventListener('click', function() {
        // 实现分页逻辑
    });

    document.getElementById('nextPage').addEventListener('click', function() {
        // 实现分页逻辑
    });
});