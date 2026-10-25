// The 8 conversation themes (contracts §2), upserted by fixed id on every migrate.
export const THEMES = [
  {
    id: 'theme-first-jobs',
    title: 'First jobs',
    prompt_en: 'What was your very first job, and what was a day there like?',
    prompt_zh: '您的第一份工作是什么？那时候一天是怎么过的？',
  },
  {
    id: 'theme-childhood-home',
    title: 'Childhood home',
    prompt_en: 'Tell me about the house or street you grew up on.',
    prompt_zh: '跟我说说您小时候住的房子或者那条街吧。',
  },
  {
    id: 'theme-favorite-meals',
    title: 'Favorite meals',
    prompt_en: 'What meal always made you happy, and who made it best?',
    prompt_zh: '哪道菜总让您特别开心？谁做得最好吃？',
  },
  {
    id: 'theme-music-dancing',
    title: 'Music and dancing',
    prompt_en: 'What songs or dances bring back good memories for you?',
    prompt_zh: '哪些歌或者舞蹈让您想起美好的回忆？',
  },
  {
    id: 'theme-friends-neighbors',
    title: 'Friends and neighbors',
    prompt_en: 'Who was a good friend or neighbor you remember fondly?',
    prompt_zh: '您印象最深的好朋友或者好邻居是谁？',
  },
  {
    id: 'theme-travel-trips',
    title: 'Travel and trips',
    prompt_en: 'What trip or outing do you remember best?',
    prompt_zh: '您记得最清楚的一次旅行或出游是哪一次？',
  },
  {
    id: 'theme-holidays',
    title: 'Holidays',
    prompt_en: 'How did your family celebrate the holidays when you were younger?',
    prompt_zh: '您年轻的时候，家里是怎么过节的？',
  },
  {
    id: 'theme-proud-moments',
    title: 'Proud moments',
    prompt_en: 'What is something you did that you are proud of?',
    prompt_zh: '有什么事情是您做过并且很自豪的？',
  },
].map((t, i) => ({ ...t, sort: i + 1 }));
