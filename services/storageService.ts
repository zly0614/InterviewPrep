import { Question } from '../types';

const STORAGE_KEY = 'interview_prep_questions_v1';
const LEGACY_KEYS = ['interview_questions', 'interview_prep_questions', 'interview_app_data'];

// 用于存储文件夹句柄，以便持久化同步
let directoryHandle: any = null;

export const getQuestions = (): Question[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }

    for (const legacyKey of LEGACY_KEYS) {
      const legacyData = localStorage.getItem(legacyKey);
      if (legacyData) {
        try {
          const parsed = JSON.parse(legacyData);
          if (Array.isArray(parsed) && parsed.length > 0) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
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

/**
 * 设置本地同步文件夹
 */
export const setSyncDirectory = async () => {
  try {
    // 调起浏览器文件夹选择器
    const handle = await (window as any).showDirectoryPicker({
      mode: 'readwrite'
    });
    directoryHandle = handle;
    // 初始同步一次
    await syncToLocalFile(getQuestions());
    return true;
  } catch (e) {
    console.error('Directory picker cancelled or failed', e);
    return false;
  }
};

/**
 * 将数据同步到本地 JSON 文件
 */
const syncToLocalFile = async (questions: Question[]) => {
  if (!directoryHandle) return;

  try {
    // 1. 获取或创建 data 文件夹
    const dataDirHandle = await directoryHandle.getDirectoryHandle('data', { create: true });
    
    // 2. 获取或创建 interview_questions.json 文件
    const fileHandle = await dataDirHandle.getFileHandle('interview_questions.json', { create: true });
    
    // 3. 写入内容
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(questions, null, 2));
    await writable.close();
    console.log('Successfully synced to local project folder: data/interview_questions.json');
  } catch (e) {
    console.error('Failed to sync to local file', e);
  }
};

export const saveQuestion = async (question: Question): Promise<void> => {
  const questions = getQuestions();
  const existingIndex = questions.findIndex((q) => q.id === question.id);
  
  if (existingIndex >= 0) {
    questions[existingIndex] = question;
  } else {
    questions.unshift(question);
  }
  
  const dataString = JSON.stringify(questions);
  localStorage.setItem(STORAGE_KEY, dataString);
  
  // 自动触发本地文件同步
  await syncToLocalFile(questions);
};

export const deleteQuestion = async (id: string): Promise<void> => {
  const questions = getQuestions().filter((q) => q.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
  
  // 自动触发本地文件同步
  await syncToLocalFile(questions);
};

export const importQuestions = async (newQuestions: Question[]): Promise<void> => {
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
  
  // 自动触发本地文件同步
  await syncToLocalFile(merged);
};

export const isSyncEnabled = () => !!directoryHandle;
