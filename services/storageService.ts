import { Question } from '../types';

const STORAGE_KEY = 'interview_prep_questions_v1';
// 以前可能用过的关键词，用于数据迁移/找回
const LEGACY_KEYS = ['interview_questions', 'interview_prep_questions', 'interview_app_data'];

export const getQuestions = (): Question[] => {
  try {
    // 1. 尝试从当前版本 Key 获取
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }

    // 2. 如果当前版本为空，尝试从旧版本 Key 找回数据
    for (const legacyKey of LEGACY_KEYS) {
      const legacyData = localStorage.getItem(legacyKey);
      if (legacyData) {
        try {
          const parsed = JSON.parse(legacyData);
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.log(`Found legacy data in ${legacyKey}, migrating...`);
            // 迁移到新 Key
            localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
            // (可选) 迁移后可以清理旧 Key，这里为了安全先保留
            return parsed;
          }
        } catch (e) {
          continue;
        }
      }
    }

    return [];
  } catch (e) {
    console.error('Failed to load questions', e);
    return [];
  }
};

export const saveQuestion = (question: Question): void => {
  const questions = getQuestions();
  const existingIndex = questions.findIndex((q) => q.id === question.id);
  
  if (existingIndex >= 0) {
    questions[existingIndex] = question;
  } else {
    questions.unshift(question); // Add to top
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
};

export const deleteQuestion = (id: string): void => {
  const questions = getQuestions().filter((q) => q.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
};

export const importQuestions = (newQuestions: Question[]): void => {
  if (!Array.isArray(newQuestions)) {
    throw new Error('Invalid data format');
  }
  
  const currentQuestions = getQuestions();
  const currentMap = new Map(currentQuestions.map(q => [q.id, q]));
  
  newQuestions.forEach(q => {
    if (q.id && q.text) {
       currentMap.set(q.id, q);
    }
  });
  
  const merged = Array.from(currentMap.values()).sort((a, b) => b.createdAt - a.createdAt);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
};