// cloudfunctions/ai_analyze/index.js
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// 统一封装：调用大模型
async function callBigModel(content) {
  const apiKey =
    process.env.ZHIPU_API_KEY||
    '在这里改成你自己的大模型 API Key'; // 建议改成环境变量

  const url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

  try {
    const resp = await axios.post(
      url,
      {
        model: 'glm-4-flash',
        messages: [
          {
            role: 'user',
            content
          }
        ]
      },
      {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + apiKey
        }
      }
    );

    const choice = resp.data?.choices?.[0];
    const text = choice?.message?.content || '';
    return text;
  } catch (err) {
    console.error('❌ AI 请求出错:', err);
    return '';
  }
}

exports.main = async (event, context) => {
  console.log('收到 event:', JSON.stringify(event, null, 2));

  const { manualInput = {}, userProfile = {}, foodImageFileId = '' } = event;
  const {
    body = '',
    food = '',
    stress = ''
  } = manualInput || {};

  // ==== 1. 处理食物图片：把 fileID 换成 HTTPS 链接 ====
  let foodImageUrl = '';
  if (foodImageFileId) {
    try {
      const res = await cloud.getTempFileURL({
        fileList: [foodImageFileId]
      });
      const file = res.fileList && res.fileList[0];
      if (file && file.tempFileURL) {
        foodImageUrl = file.tempFileURL;
        console.log('✅ 获取到 food 图片临时链接:', foodImageUrl);
      }
    } catch (e) {
      console.error('❌ 获取食物图片 tempFileURL 失败:', e);
    }
  }

  // ==== 2. 构造三个不同维度的提示词 ====

  // 2.1 身体情况（加上年龄 + 性别）
  const age = userProfile.age || '';
  const gender = userProfile.gender || ''; // 建议前端以后也加上

  let bodyPrompt =
    '你是一名非常温柔、细致的健康管理师，要帮用户写一份「身体健康小报告」。保证每次生成都是稳定的格式，不饿能随意缩减\n' +
    '请用亲切、安慰的语气，像和好朋友聊天一样，但内容要尽量专业、详细，分小标题、分条列出并且男女生成的格式都一样详细。\n\n';

  if (age || gender) {
    bodyPrompt += '已知基本信息：\n';
    if (age) bodyPrompt += `- 年龄：${age} 岁\n`;
    if (gender) bodyPrompt += `- 性别：${gender}\n`;
  }

  if (body && body.trim()) {
    bodyPrompt += `\n【用户填写的身体情况】\n${body}\n\n`;
  }

  bodyPrompt +=
    '请按照下面结构输出（小标题可以用正式一点的风格）：\n' +
    '① 【体型与指标概览】\n' +
    '- 用 2～3 句话整体评价当前身高体重是否匹配、体重大致处于偏瘦/正常/偏重哪个区间（如果缺少数据就根据常见情况温柔说明，不要吓人）。\n' +
    '- 如果能估算 BMI，就给出大致范围和对应的健康解释。\n\n' +
    '② 【生活习惯深度点评】\n' +
    '- 分别点评：运动频率、运动强度、作息与睡眠情况、饮食节奏（有无常吃外卖、三餐是否规律等，可以适当合理推断）。\n' +
    '- 每一点用 1～2 句话说明“哪里做得很好”“哪里可以再小小优化”。\n\n' +
    '③ 【潜在小风险提醒】\n' +
    '- 列出 2～4 条“可能需要留意”的小风险，比如：长期熬夜、久坐、饮食结构单一、体脂可能偏高或偏低等。\n' +
    '- 每条后面都要加一句安抚的话，强调“只是提醒，并不是严重问题”。\n\n' +
    '④ 【可以立刻开始的小改变】\n' +
    '- 给出「今天就可以做的 3 件小事」，要求非常具体，比如“今晚 23:30 前躺到床上，手机调成勿扰”等。\n' +
    '- 给出一个「未来一周的轻计划」，按照 周一～周日，用很简短的方式写（例如：周一：20 分钟快走 + 早点睡；周二：拉伸 10 分钟 等）。\n\n' +
    '⑤ 【温柔收尾】\n' +
    '- 用 2～3 句话鼓励对方，强调“你已经做得很好了”“慢慢来就好”，禁止用任何吓人的词语（比如“严重”“危险”“必须立刻”之类不要出现）。\n';
  // 2.2 饮食与食物（图片和文字分开逻辑）
  let foodPrompt = '';
  if (foodImageUrl) {
    // ✅ 有图片：只基于图片识别，不和文字混在一起
    foodPrompt =
      `你是一名专业营养师，请只根据这张食物照片进行分析。\n` +
      `图片地址：${foodImageUrl}\n\n` +
      `请完成以下内容：\n` +
      `1）图片中主要食物大概是什么（例如：奶茶、炸鸡、汉堡、披萨等）；\n` +
      `2）估算整份食物的大致热量区间（举例：300～400 千卡）；\n` +
      `3）从减脂/保持身材角度，这样的食物一周大概可以吃几次比较合适；\n` +
      `4）给出 2～3 条温柔、不苛刻的饮食建议（比如：可以换成什么更轻盈一点的搭配）。\n\n` +
      `回答时请用第二人称“你”，语气温柔一点。`;
  } else if (food && food.trim()) {
    // ✅ 没图片，只有文字：按饮食习惯分析
    foodPrompt =
      `你是一名专业营养师，请根据下面这段饮食描述，从热量、营养均衡、对体重的影响等方面做分析，并给出简单可执行的调整建议。\n\n` +
      `【饮食描述】${food}\n\n` +
      `请分条回答：\n1）整体热量和饮食结构的评价；\n2）可能会导致发胖或不适的点；\n3）可以马上尝试的 3 条小调整建议。`;
  }

  // 2.3 心理压力
  let stressPrompt = '';
  if (stress && stress.trim()) {
    stressPrompt =
      `你是一名温柔的心理咨询师，请用非常温暖、理解的语气，回应下面这段心理压力/情绪描述。\n\n` +
      `【心理感受】${stress}\n\n` +
      `请：\n1）先共情，对 TA 的感受表示理解；\n2）帮 TA 梳理可能的压力来源；\n3）给出 2～3 条很具体、能立刻尝试的小建议（比如可以先完成什么小目标，如何跟身边的人沟通，如何给自己一点鼓励）。`;
  }

  // ==== 3. 并行调用大模型 ====
  const tasks = [];

  // 身体
  if (bodyPrompt.trim() && body.trim()) {
    tasks.push(callBigModel(bodyPrompt));
  } else {
    tasks.push(Promise.resolve(''));
  }

  // 食物：优先图片，其次文字，都没有就不分析
  if (foodPrompt.trim()) {
    tasks.push(callBigModel(foodPrompt));
  } else {
    tasks.push(Promise.resolve(''));
  }

  // 心理
  if (stressPrompt.trim()) {
    tasks.push(callBigModel(stressPrompt));
  } else {
    tasks.push(Promise.resolve(''));
  }

  const [bodyReply, foodReply, stressReply] = await Promise.all(tasks);

  // ==== 4. 兜底文案 ====
  const finalBody =
    bodyReply ||
    '根据你填写的身高、体重和作息情况，目前整体看是比较健康的。保持适量运动和规律睡眠，就是对身体最好的温柔。';

  let finalFood = '';
  if (foodReply) {
    finalFood = foodReply;
  } else if (foodImageUrl) {
    finalFood =
      '我没有成功从图片中识别出具体食物种类，但一般来说，甜饮料、油炸和高脂肪零食的热量都比较高，适当控制频率，多搭配蔬菜和蛋白质，会更有利于身材和健康。';
  } else if (food && food.trim()) {
    finalFood =
      '你已经开始关注自己的饮食，这是很棒的一步。可以从少糖、少油、多蔬菜和优质蛋白开始一点点调整，慢慢来就好。';
  } else {
    finalFood =
      '还没有记录饮食情况。如果方便的话，可以简单写写你最近几天都吃了些什么，我就可以帮你看一看热量和搭配啦。';
  }

  const finalStress =
    stressReply ||
    '如果最近你觉得还挺平稳的，那就继续好好照顾自己。如果哪天觉得累了、难过了，也可以随时把感受写下来，让别人和 AI 一起来听你说。';

  const ret = {
    ok: true,
    data: {
      body: finalBody,
      food: finalFood,
      stress: finalStress
    }
  };

  console.log('返回结果:', JSON.stringify(ret, null, 2));
  return ret;
};
