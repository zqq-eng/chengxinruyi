// cloudfunctions/ai_analyze/index.js
const cloud = require("wx-server-sdk");
const axios = require("axios");
const crypto = require("crypto");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/* ---------------- utils ---------------- */
function pad2(x) { return String(x).padStart(2, "0"); }
function nowStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function safeStr(s){ return (s===null||s===undefined) ? "" : String(s); }
function clip(s,maxLen=4000){ s=safeStr(s); return s.length<=maxLen ? s : (s.slice(0,maxLen)+"…"); }
function sha1(obj){ return crypto.createHash("sha1").update(JSON.stringify(obj||{})).digest("hex"); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

/* ---------------- cache (10 min) ---------------- */
async function readCache(cacheKey){
  try{
    const res = await db.collection("ai_cache").doc(cacheKey).get();
    const data = res.data;
    if(!data) return null;
    const ts = data.createdAtMs || 0;
    if(Date.now() - ts > 10 * 60 * 1000) return null;
    return data.payload || null;
  }catch(e){
    return null;
  }
}
async function writeCache(cacheKey,payload){
  try{
    await db.collection("ai_cache").doc(cacheKey).set({
      data:{ createdAtMs: Date.now(), payload }
    });
  }catch(e){}
}

/* ---------------- history render ---------------- */
function renderHistory(history=[]){
  const arr = Array.isArray(history) ? history : [];
  return arr.slice(-12).map(m=>{
    const role = m.role === "assistant" ? "AI" : "用户";
    const text = safeStr(m.text).replace(/\n/g," ");
    return `${role}：${clip(text,220)}`;
  }).join("\n");
}

/* ---------------- JSON helpers ---------------- */
function stripCodeFence(s){
  s = safeStr(s).trim();
  s = s.replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();
  return s;
}
function tryParseJSON(s){
  s = stripCodeFence(s);
  if(!s) return null;
  try{ return JSON.parse(s); }catch(e){}
  const start = s.indexOf("{"), end = s.lastIndexOf("}");
  if(start >= 0 && end > start){
    const cut = s.slice(start, end+1);
    try{ return JSON.parse(cut); }catch(e){}
  }
  return null;
}
function normArr(a){ return Array.isArray(a) ? a.map(x=>safeStr(x).trim()).filter(Boolean) : []; }
function normExtracted(ex){
  ex = ex && typeof ex==="object" ? ex : {};
  return {
    foods: normArr(ex.foods),
    drinks: normArr(ex.drinks),
    exercise: normArr(ex.exercise),
    sleep: normArr(ex.sleep),
    emotions: normArr(ex.emotions),
    stressors: normArr(ex.stressors),
    numbers: normArr(ex.numbers)
  };
}
function isValidLevel(x){ return ["健康","一般","偏高风险","高风险","无法判断"].includes(x); }

/* ✅ 把“模型原话”优先当作回复（不再动不动走固定兜底模板） */
function buildDataFromRawText(rawText, type){
  const t = safeStr(rawText).trim();
  const reply = t || "我收到了，但这次模型没有返回有效内容。你再发一句我马上继续。";
  return {
    type,
    assistantReply: reply,
    healthCheck: { level: "一般", reasons: ["基于当前对话给出的综合建议（非诊断）"] },
    advice: [],
    followUpQuestion: "",
    extracted: { foods:[],drinks:[],exercise:[],sleep:[],emotions:[],stressors:[],numbers:[] }
  };
}

function validateAndFixJSON(obj, type){
  if(!obj || typeof obj!=="object") return null;

  const assistantReply = safeStr(obj.assistantReply||obj.reply||obj.message).trim();
  const hcObj = obj.healthCheck && typeof obj.healthCheck==="object" ? obj.healthCheck : {};
  const levelRaw = safeStr(hcObj.level||obj.level).trim();
  const reasons = normArr(hcObj.reasons||obj.reasons).slice(0,6);
  const advice = normArr(obj.advice).slice(0,8);
  const followUpQuestion = safeStr(obj.followUpQuestion||obj.question||obj.followUp).trim();
  const extracted = normExtracted(obj.extracted);

  const level = isValidLevel(levelRaw) ? levelRaw : "一般";
  const finalReasons = reasons.length ? reasons : ["基于当前描述给出综合建议（非诊断）"];

  // ✅ 不强行塞“固定三条建议”，避免你觉得每次都一样
  const finalAdvice = advice; // 允许为空
  const q = followUpQuestion || "";

  // ✅ assistantReply 必须有，没有就组装一个轻量版（仍然变化依赖内容）
  let reply = assistantReply;
  if(!reply){
    reply =
      `【你目前的状况】\n` +
      `我已收到你的描述，会基于现有信息先给建议（非诊断）。\n\n` +
      `【建议】\n` +
      (finalAdvice.length ? finalAdvice.map((x,i)=>`${i+1}）${x}`).join("\n") : "你可以再补充一点细节（如目标/频率/份量），我能更具体。") +
      (q ? `\n\n【我想再确认一句】\n${q}` : "");
  }

  return {
    type,
    assistantReply: reply,
    healthCheck: { level, reasons: finalReasons },
    advice: finalAdvice,
    followUpQuestion: q,
    extracted
  };
}

/* =========================================================
   ✅ 方舟 Responses API：超鲁棒提取文本
   关键修复：以前抓不到 text → raw 为空 → 每次走固定兜底
   ========================================================= */

function deepCollectText(node, out, depth){
  if(node === null || node === undefined) return;
  if(depth > 8) return; // 防爆

  const t = typeof node;
  if(t === "string"){
    const s = node.trim();
    // 避免把 key/短字符串也塞进来
    if(s.length >= 2) out.push(s);
    return;
  }
  if(t !== "object") return;

  if(Array.isArray(node)){
    for(const it of node) deepCollectText(it, out, depth+1);
    return;
  }

  // 对常见字段优先提取
  const candidates = ["output_text", "text", "content", "message", "answer"];
  for(const k of candidates){
    if(Object.prototype.hasOwnProperty.call(node, k)){
      deepCollectText(node[k], out, depth+1);
    }
  }

  // 再遍历所有字段兜底
  for(const k of Object.keys(node)){
    deepCollectText(node[k], out, depth+1);
  }
}

function pickTextFromArk(respData){
  if(!respData) return "";

  // 常见：output_text
  if(typeof respData.output_text === "string" && respData.output_text.trim()){
    return respData.output_text.trim();
  }

  // 常见：output[].content[].text / output[].content[].output_text
  const output = respData.output;
  if(Array.isArray(output)){
    const texts = [];
    for(const item of output){
      const content = item && item.content;
      if(Array.isArray(content)){
        for(const c of content){
          if(c && typeof c.text === "string" && c.text.trim()) texts.push(c.text.trim());
          if(c && typeof c.output_text === "string" && c.output_text.trim()) texts.push(c.output_text.trim());
        }
      }
    }
    if(texts.length) return texts.join("\n").trim();
  }

  // 递归兜底：把所有 text 收集出来，再拼最大块
  const bag = [];
  deepCollectText(respData, bag, 0);

  // 过滤明显不是答案的噪声（模型id、baseUrl 之类）
  const cleaned = bag
    .map(s=>s.trim())
    .filter(s=>s.length >= 10) // 答案一般更长
    .filter(s=>!/^https?:\/\//i.test(s));

  if(!cleaned.length) return "";

  // 取最长的那段作为“模型主输出”
  cleaned.sort((a,b)=>b.length-a.length);
  return cleaned[0].trim();
}

async function callArkResponses({ model, systemText, userText, timeoutMs=20000, maxRetry=2 }){
  const apiKey = process.env.ARK_API_KEY || "";
  if(!apiKey){
    console.error("❌ 缺少 ARK_API_KEY 环境变量");
    return "";
  }

  const baseUrl = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com";
  const url = baseUrl.replace(/\/$/,"") + "/api/v3/responses";

  // ✅ 云函数里必须 stream:false（你截图 curl 是 true，但那是终端流式）
  const payload = {
    model,
    stream: false,
    input: [
      { role: "system", content: [{ type: "input_text", text: systemText }] },
      { role: "user", content: [{ type: "input_text", text: userText }] }
    ],
    temperature: 0.55, // 更像正常聊天
    top_p: 0.9
  };

  let lastErr = null;
  for(let i=0;i<=maxRetry;i++){
    try{
      const resp = await axios.post(url, payload, {
        timeout: timeoutMs,
        headers: {
          "Content-Type":"application/json",
          Authorization:"Bearer " + apiKey
        }
      });

      const txt = pickTextFromArk(resp.data);
      return safeStr(txt).trim();
    }catch(err){
      lastErr = err;
      if(i < maxRetry) await sleep(300 + Math.floor(Math.random()*200));
    }
  }

  console.error("❌ 方舟调用失败:", lastErr && (lastErr.message || lastErr));
  return "";
}

/* ---------------- main ---------------- */
exports.main = async (event, context) => {
  const {
    targetType="",
    message="",
    history=[],
    foodImageUrl: foodImageFileId="",
    userProfile={}
  } = event || {};

  const type = (targetType==="body"||targetType==="food"||targetType==="stress") ? targetType : "body";
  const userMsg = safeStr(message).trim();
  const histText = renderHistory(history);

  // food: fileID -> temp URL（保留）
  let foodImageUrl = "";
  if(type==="food" && foodImageFileId){
    try{
      const res = await cloud.getTempFileURL({ fileList:[foodImageFileId] });
      const file = res.fileList && res.fileList[0];
      if(file && file.tempFileURL) foodImageUrl = file.tempFileURL;
    }catch(e){
      console.error("❌ 获取图片 tempFileURL 失败:", e);
    }
  }

  // 空输入提示
  const noInput = !userMsg && !(type==="food" && foodImageFileId);
  if(noInput){
    const data = {
      type,
      assistantReply:
        "我还没收到你的具体内容～\n" +
        "你用一句话告诉我就行：\n" +
        (type==="body"
          ? "例如：身高170cm 体重60kg 一周运动3次 睡眠6小时（目标：减脂）"
          : type==="food"
            ? "例如：晚饭米饭一碗+红烧肉+奶茶（大概份量/是否全糖）"
            : "例如：最近压力来自考试，持续两周，睡眠变差"),
      healthCheck:{ level:"无法判断", reasons:["没有收到有效描述，无法分析"] },
      advice:[],
      followUpQuestion:"你愿意用一句话把情况描述一下吗？",
      extracted:{ foods:[],drinks:[],exercise:[],sleep:[],emotions:[],stressors:[],numbers:[] }
    };
    return { ok:true, data, cached:false, at: nowStr() };
  }

  // ✅ 默认 model 用你截图这个
  const model = process.env.ARK_MODEL_ID || "deepseek-v3-2-251201";

  // ✅ system：取消“信息不足只追问”的死板约束
  const systemText =
    "你是一个“健康分析对话助手”，像正常AI聊天：自然、具体、可执行，不要像问卷。\n" +
    "输出必须是严格 JSON（不要 markdown/代码块/多余文字）。\n" +
    "不管信息够不够，你都要先给分析和建议，再决定是否追问。\n" +
    "不要编造用户没说过的数据；可以推断但要写“可能/建议核实”。\n" +
    "不要下诊断结论，用“可能原因/建议检查/如有症状请就医”。\n" +
    "followUpQuestion：只有真的缺关键变量才问1句，否则输出空字符串。";

  const prompt =
`只输出 JSON，结构必须完全符合：
{
  "type":"${type}",
  "assistantReply":"",
  "healthCheck":{"level":"健康/一般/偏高风险/高风险/无法判断","reasons":[]},
  "advice":[],
  "followUpQuestion":"",
  "extracted":{"foods":[],"drinks":[],"exercise":[],"sleep":[],"emotions":[],"stressors":[],"numbers":[]}
}

对话上下文：
${histText || "（无）"}

用户本句：
${userMsg}

补充信息：
- userProfile：${clip(JSON.stringify(userProfile||{}), 900)}
- 若为饮食且有图片：${foodImageUrl ? "用户上传了食物图片（你可以提醒用户补充菜名/份量）" : "无图片"}

要求（必须做到）：
1) assistantReply 必须包含：
   【你目前的身体状况】/【最优先的3个建议】/【需要注意或何时就医】/（可选）【我想再确认一句】
2) 先分析、先给建议，不要先问一堆问题。
3) 每次回复必须紧扣用户这句内容（引用关键词/数字/食物/症状），不要套话。
4) followUpQuestion 可为空字符串。
`;

  // ✅ 缓存：为了避免“看起来永远一样”，允许通过环境变量关闭缓存
  const useCache = (process.env.AI_USE_CACHE || "1") !== "0";
  const cacheKey = sha1({
    type,
    model,
    msg: clip(userMsg, 1400),
    hist: clip(histText, 1400),
    img: foodImageUrl ? "1" : "0"
  });

  if(useCache){
    const cached = await readCache(cacheKey);
    if(cached) return { ok:true, data: cached, cached:true, at: nowStr() };
  }

  const raw = await callArkResponses({
    model,
    systemText,
    userText: prompt,
    timeoutMs: 20000,
    maxRetry: 2
  });

  // ✅ 关键修复：就算 JSON 解析失败，也把模型原话返回（不再固定兜底）
  const json = tryParseJSON(raw);
  let data = validateAndFixJSON(json, type);
  if(!data){
    data = buildDataFromRawText(raw, type);
  }

  if(useCache) await writeCache(cacheKey, data);
  return { ok:true, data, cached:false, at: nowStr() };
};
