// cloudfunctions/knowledgeFeed/index.js
const cloud = require("wx-server-sdk");
const https = require("https");
const http = require("http");
const { URL } = require("url");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/** ========== “涨知识”关键词（命中越多越像科普/知识性文章） ========== */
const KNOWLEDGE_KEYWORDS = [
  // 通用知识
  "科普", "知识", "百科", "解读", "指南", "建议", "提示", "须知", "问答", "常见问题",
  "原理", "机制", "原因", "影响", "风险", "注意事项", "如何", "怎么", "为什么", "误区",
  "方法", "步骤", "要点", "判断", "区别", "正确", "避免", "预防", "处理", "应对",

  // 健康与生活（保留）
  "健康", "营养", "膳食", "饮食", "盐", "糖", "油", "蛋白质", "维生素", "矿物质",
  "体重", "BMI", "减重", "控重",
  "运动", "锻炼", "有氧", "力量", "拉伸", "热身", "心率", "配速", "耐力", "柔韧",
  "睡眠", "失眠", "作息", "心理", "情绪", "压力",
  "高血压", "糖尿病", "血脂", "冠心病", "心脑血管",
  "传染病", "流感", "新冠", "结核", "登革热", "诺如", "乙肝", "艾滋", "手足口",
  "疫苗", "接种", "免疫", "口腔", "龋齿", "牙周",
  "妇幼", "孕", "哺乳", "儿童", "青少年", "老年",
  "急救", "中暑", "外伤", "溺水",

  // ✅ 运动专项：减脂塑形 / 增肌增重 / 运动康复（新增）
  "减脂", "燃脂", "塑形", "体脂", "热量缺口", "卡路里", "能量消耗", "基础代谢",
  "间歇", "HIIT", "LISS", "有氧训练", "力量训练", "抗阻训练", "阻力训练",
  "增肌", "肌肉", "肌肥大", "肌力", "1RM", "训练量", "训练强度", "训练频率", "超量恢复",
  "增重", "体重增加", "瘦体重", "蛋白", "蛋白质摄入", "碳水", "脂肪摄入",
  "深蹲", "硬拉", "卧推", "引体向上", "跑步", "步频", "跑姿", "关节", "韧带", "肌腱",
  "运动损伤", "康复", "恢复", "疼痛", "肩颈", "腰背", "膝", "踝",

  // ✅ 女性 / 男性专业健康（新增）
  "女性健康", "月经", "经期", "痛经", "更年期", "盆底", "乳腺",
  "男性健康", "前列腺", "睾酮", "雄激素",
];

/** ❌ 排除词（明显不是科普文章，或是通知类） */
const EXCLUDE_KEYWORDS = [
  "招聘", "招募", "招标", "采购", "中标", "征集", "公示", "公告", "通告",
  "会议", "培训", "活动", "专题", "领导", "讲话", "批复", "要闻",
  "党建", "学习", "宣传", "纪检", "财务", "预算", "统计报表",
  "下载", "表格", "附件", "申请"
];

/** ========== 文章外信息强拒绝（只要出现就丢弃） ========== */
const OUTSIDE_PATTERNS = [
  /ICP备|icp/i,
  /公安备案|网安备/i,
  /版权所有|版权声明|免责声明/i,
  /主办单位|承办单位|主管单位|协办单位/i,
  /技术支持|网站维护|站点地图|网站地图|无障碍|隐私|政策/i,
  /联系我们|联系方式|联系地址|地址[:：]/i,
  /邮编|传真|邮箱[:：]/i,
  /电话[:：]|热线|咨询电话|服务电话|投诉电话/i,
  /12320|010-\d{7,8}|\d{3,4}-\d{7,8}/,
  /\b1\d{10}\b/,
  /责任编辑|编辑[:：]|来源[:：]|打印|关闭窗口|附件|下载/i,
  /访问量|浏览次数|点击次数/i
];

function hitExclude(text = "") {
  const t = (text || "").toLowerCase();
  return EXCLUDE_KEYWORDS.some(k => t.includes(k.toLowerCase()));
}

function hasOutsideInfo(text = "") {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  return OUTSIDE_PATTERNS.some(r => r.test(t));
}

// 计算命中分数：用于挑选更“知识性”的
function scoreKnowledge(text = "") {
  const t = (text || "").toLowerCase();
  let s = 0;
  for (const k of KNOWLEDGE_KEYWORDS) {
    if (t.includes(k.toLowerCase())) s += 1;
  }
  return s;
}

function isKnowledgeCandidateByTitleUrl(title, url) {
  const combined = `${title || ""} ${url || ""}`;
  if (hitExclude(combined)) return false;
  return scoreKnowledge(combined) >= 1;
}

/** ========== ✅ 分类：大类标签 ========== */
function classifyCategory(title = "", summary = "") {
  const t = `${title} ${summary}`.toLowerCase();

  const rules = [
    { name: "女性健康", keys: ["女性", "月经", "经期", "痛经", "更年期", "盆底", "乳腺", "孕", "哺乳"] },
    { name: "男性健康", keys: ["男性", "男士", "男人", "前列腺", "睾酮", "雄激素", "精子", "精液", "勃起", "性功能", "泌尿", "生殖", "生育"] },

    { name: "减脂塑形", keys: ["减脂", "燃脂", "塑形", "体脂", "热量缺口", "卡路里", "hiit", "间歇", "有氧"] },
    { name: "增肌增重", keys: ["增肌", "肌肉", "肌肥大", "抗阻", "阻力训练", "力量训练", "1rm", "训练量", "蛋白", "增重", "瘦体重"] },
    { name: "运动知识", keys: ["跑步", "配速", "心率", "步频", "跑姿", "热身", "拉伸", "耐力", "柔韧", "运动损伤", "康复", "恢复", "肩", "颈", "腰", "膝", "踝", "关节", "韧带", "肌腱"] },
    { name: "营养饮食", keys: ["营养", "膳食", "饮食", "蛋白质", "维生素", "矿物质", "盐", "糖", "油", "碳水", "脂肪"] },
    { name: "睡眠心理", keys: ["睡眠", "失眠", "作息", "心理", "情绪", "压力"] },
    { name: "疾病预防", keys: ["传染病", "流感", "新冠", "结核", "登革热", "诺如", "乙肝", "疫苗", "接种", "高血压", "糖尿病", "血脂", "冠心病"] },
    { name: "急救安全", keys: ["急救", "中暑", "外伤", "溺水", "自救", "避险", "食品安全", "用药", "过敏", "中毒"] },
  ];

  for (const r of rules) {
    if (r.keys.some(k => t.includes(k))) return r.name;
  }
  return "健康常识";
}

/** ========== ✅ 主题椭圆标签：点进去之前就知道这条主要讲什么 ========== */
function buildTopicTag(title = "", summary = "") {
  const text = `${title} ${summary}`.replace(/\s+/g, " ").trim();
  const low = text.toLowerCase();

  const rules = [
    { tag: "减脂：热量缺口", keys: ["热量缺口", "能量缺口", "卡路里缺口"] },
    { tag: "HIIT 间歇训练", keys: ["hiit", "间歇训练"] },
    { tag: "有氧 vs 力量", keys: ["有氧", "力量训练"] },
    { tag: "增肌：训练量/蛋白", keys: ["增肌", "肌肥大", "训练量", "蛋白质摄入"] },
    { tag: "增重：健康增重", keys: ["增重", "体重增加", "瘦体重"] },
    { tag: "跑步：配速/心率", keys: ["配速", "心率", "步频", "跑姿"] },
    { tag: "拉伸与热身", keys: ["拉伸", "热身"] },
    { tag: "运动损伤与康复", keys: ["运动损伤", "康复", "恢复", "疼痛", "关节"] },

    { tag: "女性：经期健康", keys: ["月经", "经期", "痛经"] },
    { tag: "女性：更年期", keys: ["更年期"] },
    { tag: "男性：前列腺", keys: ["前列腺"] },

    { tag: "营养：蛋白/碳水/脂肪", keys: ["蛋白质", "碳水", "脂肪"] },
    { tag: "睡眠：作息改善", keys: ["睡眠", "失眠", "作息"] },
    { tag: "心理：压力与情绪", keys: ["压力", "情绪", "心理"] },

    { tag: "疾病预防", keys: ["预防", "疫苗", "接种", "传染病", "流感"] },
    { tag: "急救安全", keys: ["急救", "中暑", "溺水", "外伤"] },
  ];

  for (const r of rules) {
    if (r.keys.some(k => low.includes(String(k).toLowerCase()))) return r.tag;
  }

  // 兜底：用大类当主题标签
  return classifyCategory(title, summary);
}

function requestText(urlStr, redirectLeft = 5) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(urlStr);
      const lib = u.protocol === "https:" ? https : http;

      const req = lib.request(
        urlStr,
        {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          timeout: 12000,
        },
        (res) => {
          const status = res.statusCode || 0;
          const loc = res.headers.location;

          if ([301, 302, 303, 307, 308].includes(status) && loc && redirectLeft > 0) {
            const next = loc.startsWith("http") ? loc : new URL(loc, urlStr).toString();
            res.resume();
            return resolve(requestText(next, redirectLeft - 1));
          }

          let data = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve({ status, text: data, finalUrl: urlStr }));
        }
      );

      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", reject);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

function stripHtml(s = "") {
  return (s || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isWafBlocked(html = "") {
  const s = (html || "").toLowerCase();
  return (
    s.includes("waf.tencent.com") ||
    s.includes("501page") ||
    s.includes("访问拦截") ||
    s.includes("安全验证") ||
    s.includes("请在浏览器中打开") ||
    s.includes("request blocked")
  );
}

function pickMetaDescription(html = "") {
  const m1 = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  if (m1 && m1[1]) return stripHtml(m1[1]);

  const m2 = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  if (m2 && m2[1]) return stripHtml(m2[1]);

  return "";
}

/** ========== 从 HTML 提取“最像正文”的主内容块 ========== */
function extractMainHtml(html = "") {
  if (!html) return "";

  // 1) 最优：article
  const mArticle = html.match(/<article[\s\S]*?<\/article>/i);
  if (mArticle) return mArticle[0];

  // 2) 次优：常见正文容器（id/class）
  const mContent =
    html.match(/<div[^>]+id=["']?(content|article|main|zoom|con|detail|txt|text|TRS_Editor|vsb_content|UCAP-CONTENT)["']?[^>]*>[\s\S]*?<\/div>/i) ||
    html.match(/<div[^>]+class=["'][^"']*(content|article|main|zoom|con|detail|txt|text|TRS_Editor|vsb_content|UCAP-CONTENT)[^"']*["'][^>]*>[\s\S]*?<\/div>/i);
  if (mContent) return mContent[0];

  // 3) 兜底：用“文本密度/长度”选最大正文块
  const divs = html.match(/<div[\s\S]*?<\/div>/gi) || [];
  let best = "";
  let bestScore = 0;

  for (const d of divs.slice(0, 220)) {
    const txt = stripHtml(d);
    if (!txt || txt.length < 220) continue;

    const outsidePenalty = hasOutsideInfo(txt) ? 600 : 0;
    const punct = (txt.match(/[。！？!?]/g) || []).length;
    const score = txt.length + punct * 60 - outsidePenalty;

    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }

  return best || html;
}

/** ========== 从主内容块提取正文段落（只取正文） ========== */
function extractParagraphsFromMain(mainHtml = "") {
  const ps = [];
  const reg = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;

  while ((m = reg.exec(mainHtml)) !== null) {
    const t = stripHtml(m[1] || "");
    if (!t) continue;

    if (hasOutsideInfo(t)) continue;
    if (hitExclude(t)) continue;
    if (t.length < 18) continue;

    ps.push(t);
    if (ps.length >= 30) break;
  }

  // 某些页面不用 <p>，兜底：从纯文本按句取
  if (ps.length < 3) {
    const text = stripHtml(mainHtml);
    const sentences = text
      .split(/(?<=[。！？!?])/)
      .map(s => s.trim())
      .filter(Boolean);

    for (const s of sentences) {
      if (s.length < 18) continue;
      if (hasOutsideInfo(s)) continue;
      if (hitExclude(s)) continue;
      ps.push(s);
      if (ps.length >= 30) break;
    }
  }

  return ps;
}

/** ========== 生成“总结文章内容”的摘要（确保不是页脚/导航） ========== */
function buildArticleSummary(paragraphs = [], maxLen = 260) {
  if (!paragraphs || paragraphs.length === 0) return "";

  const corpus = paragraphs.join(" ").replace(/\s+/g, " ").trim();
  if (!corpus || corpus.length < 140) return "";

  // 拆句
  const sentences = corpus
    .split(/(?<=[。！？!?])/)
    .map(s => s.trim())
    .filter(s => s.length >= 12);

  // 只从“像知识点”的句子里挑（命中关键词）
  const scored = sentences
    .map(s => ({ s, sc: scoreKnowledge(s) }))
    .filter(x => x.sc >= 1)
    .sort((a, b) => b.sc - a.sc);

  const picked = [];
  for (const it of scored) {
    if (picked.length >= 3) break;
    if (hasOutsideInfo(it.s)) continue;
    if (hitExclude(it.s)) continue;
    if (picked.some(p => p.includes(it.s.slice(0, 8)))) continue;
    picked.push(it.s);
  }

  let summary = picked.join("").replace(/\s+/g, " ").trim();
  if (!summary) return "";

  if (hasOutsideInfo(summary)) return "";

  if (summary.length > maxLen) summary = summary.slice(0, maxLen) + "…";
  return summary;
}

function uniqByUrl(list) {
  const seen = new Set();
  const out = [];
  for (const it of list) {
    const key = (it.url || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 中国疾控：从列表页抓文章链接（尽量限定 /jkkp/） */
function parseChinaCdcList(html, baseUrl) {
  const items = [];
  const aReg = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let m;
  while ((m = aReg.exec(html)) !== null) {
    let href = (m[1] || "").trim();
    let titleRaw = stripHtml(m[2] || "");
    if (!href || !titleRaw) continue;
    if (href.startsWith("javascript:")) continue;

    let url = href;
    if (href.startsWith("/")) url = "https://www.chinacdc.cn" + href;
    else if (!href.startsWith("http")) url = baseUrl.replace(/\/+$/, "") + "/" + href.replace(/^\/+/, "");

    if (!url.includes("chinacdc.cn")) continue;
    if (!url.includes("/jkkp/")) continue;

    if (!isKnowledgeCandidateByTitleUrl(titleRaw, url)) continue;

    const around = html.slice(Math.max(0, m.index), Math.min(html.length, m.index + 400));
    const dateMatch = around.match(/(20\d{2}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : "";

    items.push({
      title: titleRaw,
      url,
      source: "中国疾控",
      date,
      summary: "",
      category: "",
      topicTag: ""
    });

    if (items.length > 80) break;
  }

  return items;
}

/** 卫健委：健康科普平台抓链接 */
function parseNhcList(html) {
  const items = [];
  const aReg = /<a[^>]+href="([^"]+\.shtml[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

  let m;
  while ((m = aReg.exec(html)) !== null) {
    let href = (m[1] || "").trim();
    let title = stripHtml(m[2] || "");
    if (!href || !title) continue;

    if (!href.includes("/kppypt/")) continue;

    let url = href;
    if (href.startsWith("/")) url = "https://www.nhc.gov.cn" + href;
    else if (!href.startsWith("http")) url = "https://www.nhc.gov.cn/" + href.replace(/^\/+/, "");

    if (!isKnowledgeCandidateByTitleUrl(title, url)) continue;

    const around = html.slice(Math.max(0, m.index), Math.min(html.length, m.index + 250));
    const dateMatch = around.match(/(20\d{2}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : "";

    items.push({
      title,
      url,
      source: "国家卫健委",
      date,
      summary: "",
      category: "",
      topicTag: ""
    });

    if (items.length > 80) break;
  }

  return items;
}

/** ✅ 新增：国家体育总局（科学健身指导）抓链接（content.html） */
function parseSportGovList(html, baseUrl) {
  const items = [];
  const aReg = /<a[^>]+href="([^"]+content\.html[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

  let m;
  while ((m = aReg.exec(html)) !== null) {
    let href = (m[1] || "").trim();
    let title = stripHtml(m[2] || "");
    if (!href || !title) continue;

    if (href.includes("beian.miit.gov.cn") || href.includes("bszs.conac.cn")) continue;
    if (href.startsWith("javascript:")) continue;

    let url = href;
    if (href.startsWith("/")) url = "https://www.sport.gov.cn" + href;
    else if (!href.startsWith("http")) url = baseUrl.replace(/\/+$/, "") + "/" + href.replace(/^\/+/, "");

    if (!url.includes("sport.gov.cn")) continue;

    if (!isKnowledgeCandidateByTitleUrl(title, url)) continue;

    const around = html.slice(Math.max(0, m.index), Math.min(html.length, m.index + 400));
    const dateMatch = around.match(/(20\d{2}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : "";

    items.push({
      title,
      url,
      source: "国家体育总局",
      date,
      summary: "",
      category: "",
      topicTag: ""
    });

    if (items.length > 120) break;
  }

  return items;
}

/**
 * ✅ 最终保证：
 * - summary 必须是“正文提炼总结”（不包含页脚/备案/联系方式/下载等）
 * - 抓不到正文、总结失败、或总结含文章外信息 => 直接丢弃
 * - ✅ 通过后补 category + topicTag
 */
async function fillSummaryAndFilter(item) {
  try {
    const { status, text } = await requestText(item.url);
    if (!text || status >= 400) return null;
    if (isWafBlocked(text)) return null;

    // meta 仅作辅助判定（不作为最终summary）
    const metaRaw = pickMetaDescription(text);
    const metaOk =
      metaRaw &&
      metaRaw.length >= 40 &&
      !hasOutsideInfo(metaRaw) &&
      !hitExclude(metaRaw) &&
      scoreKnowledge(metaRaw) >= 1;
    void metaOk;

    const mainHtml = extractMainHtml(text);
    if (!mainHtml) return null;

    const paragraphs = extractParagraphsFromMain(mainHtml);
    if (!paragraphs || paragraphs.length < 3) return null;

    const summaryFromBody = buildArticleSummary(paragraphs, 260);
    if (!summaryFromBody || summaryFromBody.length < 40) return null;

    if (hasOutsideInfo(summaryFromBody)) return null;
    if (hitExclude(summaryFromBody)) return null;

    if (scoreKnowledge(summaryFromBody) < 1) return null;

    item.summary = summaryFromBody;

    // ✅ 分类标识（大类）
    item.category = classifyCategory(item.title || "", item.summary || "");

    // ✅ 椭圆主旨标签：点进去之前就能看出主要内容是什么
    item.topicTag = buildTopicTag(item.title || "", item.summary || "");

    return item;
  } catch (e) {
    return null;
  }
}

exports.main = async (event) => {
  const limit = Math.max(1, Math.min(Number(event?.limit || 10), 10));

  const nhcUrl = "https://www.nhc.gov.cn/kppypt/index.shtml";
  const cdcListPages = [
    "https://www.chinacdc.cn/jkkp/yyjk/",
    "https://www.chinacdc.cn/jkkp/mxfcrb/shfk/",
    "https://www.chinacdc.cn/jkkp/yckz/ycwh/",
    "https://www.chinacdc.cn/jkkp/crb/bcr/"
  ];

  // ✅ 新增：体育总局科学健身指导入口
  const sportGovListPages = [
    "https://www.sport.gov.cn/n4/n24581921/index.html"
  ];

  let candidates = [];

  // CDC 候选
  for (const url of cdcListPages) {
    try {
      const r = await requestText(url);
      if (!r.text || r.status >= 400) continue;
      if (isWafBlocked(r.text)) continue;
      candidates = candidates.concat(parseChinaCdcList(r.text, url));
    } catch (e) {}
  }

  // NHC 候选
  try {
    const r = await requestText(nhcUrl);
    if (r.text && r.status < 400 && !isWafBlocked(r.text)) {
      candidates = candidates.concat(parseNhcList(r.text));
    }
  } catch (e) {}

  // 体育总局候选
  for (const url of sportGovListPages) {
    try {
      const r = await requestText(url);
      if (!r.text || r.status >= 400) continue;
      if (isWafBlocked(r.text)) continue;
      candidates = candidates.concat(parseSportGovList(r.text, url));
    } catch (e) {}
  }

  candidates = uniqByUrl(candidates);

  // 候选按“知识性”排序（提高命中率；最终仍以正文总结为准）
  candidates.sort((a, b) => {
    const sa = scoreKnowledge((a.title || "") + " " + (a.url || ""));
    const sb = scoreKnowledge((b.title || "") + " " + (b.url || ""));
    return sb - sa;
  });

  // 扩大候选池
  const pool = shuffle(candidates.slice(0, 160));

  const result = [];
  for (const it of pool) {
    if (result.length >= limit) break;
    const okItem = await fillSummaryAndFilter(it);
    if (okItem) result.push(okItem);
  }

  return { ok: true, list: result };
};
