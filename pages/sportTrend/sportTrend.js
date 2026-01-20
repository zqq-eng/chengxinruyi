const app = getApp();

// 爪印等级
function getSportIcon(level) {
  if (level === 1) return "🐾";
  if (level === 2) return "🐾🐾";
  if (level === 3) return "✨🐾✨";
  return " ";
}

Page({
  data: {
    days: [],
    distList: [],
    timeList: [],
    icons: [],
    maxDistance: 1,
    maxMinutes: 1
  },

  onLoad() {
    this.loadRunStats();
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  // =============================
  // 加载运动数据
  // =============================
  async loadRunStats() {
    const db = wx.cloud.database();
    const _ = db.command;

    const today = new Date();
    const past30 = new Date(today - 29 * 86400000);

    const start = this.formatDate(past30);
    const end = this.formatDate(today);

    const res = await db.collection("runs")
      .where({
        openid: app.globalData.openid,
        dateStr: _.gte(start).and(_.lte(end))
      })
      .get();

    const raw = res.data;
    const map = {};

    raw.forEach(r =>{
      let level = 0;
      const km = Number(r.distanceKm);

      if (km >= 5) level = 3;
      else if (km >= 1) level = 2;
      else if (km > 0) level = 1;

      map[r.dateStr] = {
        distance: km,
        minutes: Math.floor(r.duration / 60),
        level
      };
    });

    const days = [], dist = [], time = [], icons = [];

    for (let i=0;i<30;i++){
      const d = new Date(today - (29-i)*86400000);
      const ds = this.formatDate(d);

      const info = map[ds] || {distance:0, minutes:0, level:0};

      days.push(ds.substring(5));
      dist.push(info.distance);
      time.push(info.minutes);
      icons.push(getSportIcon(info.level));
    }

    this.setData({
      days,
      distList: dist,
      timeList: time,
      icons,
      maxDistance: Math.max(...dist,1),
      maxMinutes: Math.max(...time,1)
    });

    this.drawCharts();
  },

  formatDate(d){
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  },

  // =============================
  // 绘制图表
  // =============================
  drawCharts(){
    this.drawBarChart("barCanvas", this.data.distList, this.data.maxDistance);
    this.drawLineChart("lineCanvas", this.data.timeList, this.data.maxMinutes);
  },


  // ⭐ 带坐标轴的动态柱状图
  drawBarChart(id, list, max){
    const ctx = wx.createCanvasContext(id, this);
    const W=310, H=160, pad=30;
    const axis="#5876b7";

    let progress=0;

    const animate=()=>{
      progress+=0.05;
      if(progress>1) progress=1;

      ctx.setFillStyle("#eef3ff");
      ctx.fillRect(0,0,W,H);

      const baseY = H-pad;

      // 坐标轴
      ctx.setStrokeStyle(axis);
      ctx.setLineWidth(2);

      ctx.beginPath(); ctx.moveTo(pad, pad-10); ctx.lineTo(pad, baseY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, baseY); ctx.lineTo(W-pad+5, baseY); ctx.stroke();

      // Y刻度
      const steps = 4;
      ctx.setFontSize(10);
      ctx.setFillStyle("#3a4f82");

      for(let i=0;i<=steps;i++){
        const yVal = Math.round((max/steps)*i);
        const y = baseY - ( (H-pad*2) * (i/steps) );

        ctx.fillText(`${yVal}`, pad-22, y+4);

        ctx.setStrokeStyle("#d6def5");
        ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W-pad, y); ctx.stroke();
      }

      // 柱状图
      const barW=8, gap=10;
      list.forEach((v,i)=>{
        const x = pad + i*(barW+gap);
        const h = (v/max)*(H-pad*2)*progress;
        ctx.setFillStyle("#6a9bff");
        ctx.fillRect(x, baseY-h, barW, h);
      });

      // X 日期
      ctx.setFillStyle("#4d5f80");
      ctx.setFontSize(9);
      this.data.days.forEach((d,i)=>{
        const x = pad + i*(barW+gap);
        ctx.fillText(d, x-6, baseY+14);
      });

      ctx.draw();
      if(progress<1) setTimeout(animate,16);
    };
    animate();
  },

  goStats() {
    wx.navigateTo({
      url: '/pages/sportStats/sportStats'
    });
  },
  
  // ⭐ 带坐标轴的动态折线图
  drawLineChart(id, list, max){
    const ctx = wx.createCanvasContext(id, this);
    const W=310, H=160, pad=30;
    const axis="#5876b7";

    let progress=0;

    const animate=()=>{
      progress+=0.05;
      if(progress>1) progress=1;

      ctx.setFillStyle("#eef3ff");
      ctx.fillRect(0,0,W,H);

      const baseY = H-pad;

      // 坐标轴
      ctx.setStrokeStyle(axis);
      ctx.setLineWidth(2);
      ctx.beginPath(); ctx.moveTo(pad, pad-10); ctx.lineTo(pad, baseY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, baseY); ctx.lineTo(W-pad+5, baseY); ctx.stroke();

      // Y刻度
      const steps=4;
      ctx.setFontSize(10);
      ctx.setFillStyle("#3a4f82");

      for(let i=0;i<=steps;i++){
        const yVal = Math.round((max/steps)*i);
        const y = baseY - ((H-pad*2)*(i/steps));

        ctx.fillText(`${yVal}`, pad-22, y+4);

        ctx.setStrokeStyle("#d6def5");
        ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(W-pad,y); ctx.stroke();
      }

      // 折线
      const gap=10;
      ctx.setStrokeStyle("#3b6cff");
      ctx.setLineWidth(2);
      ctx.beginPath();

      list.forEach((v,i)=>{
        const x = pad + i*gap;
        const y = baseY - ((v/max)*(H-pad*2))*progress;
        if(i===0) ctx.moveTo(x,y);
        else ctx.lineTo(x,y);
      });

      ctx.stroke();

      // X 日期
      ctx.setFillStyle("#4d5f80");
      ctx.setFontSize(9);
      this.data.days.forEach((d,i)=>{
        const x = pad + i*gap;
        ctx.fillText(d, x-6, baseY+14);
      });

      ctx.draw();
      if(progress<1) setTimeout(animate,16);
    };

    animate();
  }

});
