export type LittleWorldImage = {
  url: string;
  prompt?: string;
};

export type LittleWorldScene = {
  id: string;
  title: string;
  line: string;
  prompt: string;
  src?: string;
};

export function generateLittleWorldPrompts({
  catName,
  mbti,
  tags,
  description,
}: {
  catName: string;
  mbti: string;
  tags: string[];
  description: string;
}): LittleWorldScene[] {
  const personality = tags.slice(0, 5).join("、") || "温柔、好奇、安静";
  const identity = `${catName}，${mbti}，性格关键词：${personality}。人格描述：${description}`;
  const sharedStyle =
    "梦幻治愈系竖版插画，柔和粉紫与奶油色光影，细腻、有故事感；严格保留参考猫咪的真实毛色、脸型、眼睛颜色与面部特征，不改变品种，不拟人化，不添加文字";

  return [
    {
      id: "window-solitude",
      title: "靠窗发呆",
      line: `${personality.split("、")[0]}的它，也享受安静独处。`,
      prompt: `${identity}。场景：猫咪靠在窗边发呆，午后微光、轻纱窗帘、安静独处与被治愈的氛围。${sharedStyle}`,
    },
    {
      id: "quiet-company",
      title: "偷偷陪伴",
      line: "它用自己的方式，悄悄守在你身边。",
      prompt: `${identity}。场景：夜晚书房，主人伏案时猫咪安静待在近旁，台灯暖光与窗外深蓝夜色，表达克制而亲密的陪伴。${sharedStyle}`,
    },
    {
      id: "inner-kingdom",
      title: "心里的小王国",
      line: `${mbti}的秘密，被它藏进温柔梦境。`,
      prompt: `${identity}。场景：以猫咪人格为象征的心灵小王国，用与${personality}对应的植物、星光、城堡或云朵构成隐喻，猫咪是画面唯一主角。${sharedStyle}`,
    },
  ];
}
