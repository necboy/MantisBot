const pptxgen = require("pptxgenjs");

let pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';
pres.title = '2026年AI发展趋势';
pres.author = 'MantisBot';

// Color palette - Ocean Gradient (科技感)
const colors = {
  primary: "065A82",      // 深蓝
  secondary: "1C7293",    // 青色
  accent: "21295C",       // 深午夜蓝
  light: "F5F8FA",        // 浅色背景
  white: "FFFFFF",
  text: "2D3748",
  highlight: "00D9FF"     // 亮青色强调
};

// ========== Slide 1: 封面 ==========
let slide1 = pres.addSlide();
slide1.background = { color: colors.primary };

// 装饰性圆形背景
slide1.addShape(pres.shapes.OVAL, {
  x: -1.5, y: -1.5, w: 4, h: 4,
  fill: { color: colors.secondary, transparency: 30 }
});
slide1.addShape(pres.shapes.OVAL, {
  x: 7.5, y: 3.5, w: 4, h: 4,
  fill: { color: colors.accent, transparency: 40 }
});

// 主标题
slide1.addText("2026年AI发展趋势", {
  x: 0.5, y: 1.8, w: 9, h: 1.2,
  fontSize: 48, fontFace: "Microsoft YaHei", bold: true,
  color: colors.white, align: "left"
});

// 副标题
slide1.addText("从技术突破到产业落地", {
  x: 0.5, y: 3.1, w: 9, h: 0.6,
  fontSize: 24, fontFace: "Microsoft YaHei",
  color: colors.highlight, align: "left"
});

// 底部信息
slide1.addText("AI趋势分析报告  |  2026", {
  x: 0.5, y: 4.8, w: 9, h: 0.4,
  fontSize: 14, fontFace: "Microsoft YaHei",
  color: colors.white, transparency: 50, align: "left"
});

// ========== Slide 2: AI Agent ==========
let slide2 = pres.addSlide();
slide2.background = { color: colors.light };

// 顶部装饰条
slide2.addShape(pres.shapes.RECTANGLE, {
  x: 0, y: 0, w: 10, h: 0.08,
  fill: { color: colors.primary }
});

// 标题
slide2.addText("AI Agent 爆发元年", {
  x: 0.5, y: 0.4, w: 9, h: 0.7,
  fontSize: 36, fontFace: "Microsoft YaHei", bold: true,
  color: colors.primary, align: "left"
});

// 左侧大数字
slide2.addText("Agent", {
  x: 0.5, y: 1.3, w: 3.5, h: 1.5,
  fontSize: 72, fontFace: "Arial Black", bold: true,
  color: colors.primary, align: "left"
});

slide2.addText("从被动工具到主动助手", {
  x: 0.5, y: 2.9, w: 3.5, h: 0.5,
  fontSize: 16, fontFace: "Microsoft YaHei",
  color: colors.text, align: "left"
});

// 右侧内容卡片
slide2.addShape(pres.shapes.ROUNDED_RECTANGLE, {
  x: 4.2, y: 1.3, w: 5.3, h: 3.8,
  fill: { color: colors.white },
  shadow: { type: "outer", color: "000000", blur: 10, offset: 3, angle: 135, opacity: 0.1 }
});

// 卡片内容
slide2.addText("核心变化", {
  x: 4.5, y: 1.5, w: 4.7, h: 0.5,
  fontSize: 18, fontFace: "Microsoft YaHei", bold: true,
  color: colors.primary
});

slide2.addText([
  { text: "• 自主规划与执行能力", options: { bullet: false, breakLine: true } },
  { text: "• 多Agent协作系统兴起", options: { bullet: false, breakLine: true } },
  { text: "• 企业级Agent应用爆发", options: { bullet: false, breakLine: true } },
  { text: "• 从Copilot到Autopilot", options: { bullet: false } }
], {
  x: 4.5, y: 2.1, w: 4.7, h: 2.0,
  fontSize: 14, fontFace: "Microsoft YaHei",
  color: colors.text, align: "left"
});

slide2.addText("预计2026年企业Agent市场规模增长 200%+", {
  x: 4.5, y: 4.2, w: 4.7, h: 0.5,
  fontSize: 13, fontFace: "Microsoft YaHei", bold: true,
  color: colors.highlight
});

// ========== Slide 3: 多模态AI ==========
let slide3 = pres.addSlide();
slide3.background = { color: colors.light };

slide3.addShape(pres.shapes.RECTANGLE, {
  x: 0, y: 0, w: 10, h: 0.08,
  fill: { color: colors.secondary }
});

slide3.addText("多模态AI成熟", {
  x: 0.5, y: 0.4, w: 9, h: 0.7,
  fontSize: 36, fontFace: "Microsoft YaHei", bold: true,
  color: colors.secondary, align: "left"
});

// 三个并排卡片
const cards = [
  { title: "视觉理解", desc: "视频理解、视频生成进入实用阶段", x: 0.5 },
  { title: "语音交互", desc: "实时语音对话、情感识别落地", x: 3.5 },
  { title: "3D/空间", desc: "3D生成、空间理解突破", x: 6.5 }
];

cards.forEach((card, i) => {
  slide3.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: card.x, y: 1.4, w: 2.9, h: 2.8,
    fill: { color: colors.white },
    shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 135, opacity: 0.08 }
  });
  
  // 序号圆圈
  slide3.addShape(pres.shapes.OVAL, {
    x: card.x + 0.2, y: 1.6, w: 0.5, h: 0.5,
    fill: { color: colors.primary }
  });
  slide3.addText(String(i + 1), {
    x: card.x + 0.2, y: 1.6, w: 0.5, h: 0.5,
    fontSize: 16, fontFace: "Arial", bold: true,
    color: colors.white, align: "center", valign: "middle"
  });
  
  slide3.addText(card.title, {
    x: card.x + 0.2, y: 2.3, w: 2.5, h: 0.5,
    fontSize: 18, fontFace: "Microsoft YaHei", bold: true,
    color: colors.primary, align: "left"
  });
  
  slide3.addText(card.desc, {
    x: card.x + 0.2, y: 2.9, w: 2.5, h: 1.0,
    fontSize: 13, fontFace: "Microsoft YaHei",
    color: colors.text, align: "left"
  });
});

// 底部强调
slide3.addText("→ AI从"理解"走向"创造"，内容生产效率提升10倍+", {
  x: 0.5, y: 4.6, w: 9, h: 0.5,
  fontSize: 16, fontFace: "Microsoft YaHei", bold: true,
  color: colors.accent, align: "left"
});

// ========== Slide 4: AI安全与治理 ==========
let slide4 = pres.addSlide();
slide4.background = { color: colors.light };

slide4.addShape(pres.shapes.RECTANGLE, {
  x: 0, y: 0, w: 10, h: 0.08,
  fill: { color: colors.accent }
});

slide4.addText("AI安全与治理", {
  x: 0.5, y: 0.4, w: 9, h: 0.7,
  fontSize: 36, fontFace: "Microsoft YaHei", bold: true,
  color: colors.accent, align: "left"
});

// 左侧：挑战
slide4.addShape(pres.shapes.ROUNDED_RECTANGLE, {
  x: 0.5, y: 1.3, w: 4.3, h: 3.2,
  fill: { color: colors.white },
  shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 135, opacity: 0.08 }
});

slide4.addText("核心挑战", {
  x: 0.7, y: 1.5, w: 3.9, h: 0.5,
  fontSize: 18, fontFace: "Microsoft YaHei", bold: true,
  color: "E53E3E", align: "left"
});

slide4.addText([
  { text: "• AI幻觉与可靠性问题", options: { breakLine: true } },
  { text: "• 深度伪造与信息战", options: { breakLine: true } },
  { text: "• 数据隐私与合规", options: { breakLine: true } },
  { text: "• 模型偏见与公平性", options: {} }
], {
  x: 0.7, y: 2.1, w: 3.9, h: 2.2,
  fontSize: 13, fontFace: "Microsoft YaHei",
  color: colors.text, align: "left"
});

// 右侧：应对
slide4.addShape(pres.shapes.ROUNDED_RECTANGLE, {
  x: 5.2, y: 1.3, w: 4.3, h: 3.2,
  fill: { color: colors.white },
  shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 135, opacity: 0.08 }
});

slide4.addText("应对方向", {
  x: 5.4, y: 1.5, w: 3.9, h: 0.5,
  fontSize: 18, fontFace: "Microsoft YaHei", bold: true,
  color: "38A169", align: "left"
});

slide4.addText([
  { text: "• RAG技术广泛应用", options: { breakLine: true } },
  { text: "• AI治理框架落地", options: { breakLine: true } },
  { text: "• 水印与检测技术", options: { breakLine: true } },
  { text: "• 开源安全工具爆发", options: {} }
], {
  x: 5.4, y: 2.1, w: 3.9, h: 2.2,
  fontSize: 13, fontFace: "Microsoft YaHei",
  color: colors.text, align: "left"
});

// ========== Slide 5: 总结 ==========
let slide5 = pres.addSlide();
slide5.background = { color: colors.primary };

slide5.addShape(pres.shapes.OVAL, {
  x: 6, y: -2, w: 5, h: 5,
  fill: { color: colors.secondary, transparency: 40 }
});
slide5.addShape(pres.shapes.OVAL, {
  x: -1, y: 4, w: 3, h: 3,
  fill: { color: colors.accent, transparency: 30 }
});

slide5.addText("2026年AI关键趋势", {
  x: 0.5, y: 1.0, w: 9, h: 0.8,
  fontSize: 40, fontFace: "Microsoft YaHei", bold: true,
  color: colors.white, align: "left"
});

// 三个要点
const takeaways = [
  { num: "01", text: "AI Agent从概念走向落地，企业应用爆发" },
  { num: "02", text: "多模态能力成熟，AI进入"创造"时代" },
  { num: "03", text: "安全治理成为必修课，技术与规范并进" }
];

takeaways.forEach((item, i) => {
  slide5.addText(item.num, {
    x: 0.5, y: 2.0 + i * 0.85, w: 0.6, h: 0.6,
    fontSize: 24, fontFace: "Arial", bold: true,
    color: colors.highlight, align: "left"
  });
  
  slide5.addText(item.text, {
    x: 1.2, y: 2.0 + i * 0.85, w: 8, h: 0.6,
    fontSize: 18, fontFace: "Microsoft YaHei",
    color: colors.white, align: "left"
  });
});

// 底部
slide5.addText("拥抱AI，拥抱未来", {
  x: 0.5, y: 4.6, w: 9, h: 0.5,
  fontSize: 16, fontFace: "Microsoft YaHei",
  color: colors.highlight, align: "left"
});

// 保存文件
pres.writeFile({ fileName: "/Users/necboy/AI_Trends_2026.pptx" })
  .then(() => console.log("PPT created: AI_Trends_2026.pptx"))
  .catch(err => console.error(err));
