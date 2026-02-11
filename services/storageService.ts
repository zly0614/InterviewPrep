
import { Question, DEFAULT_CATEGORIES } from '../types';

const STORAGE_KEY = 'interview_prep_questions_v1';
const CATEGORIES_KEY = 'interview_prep_categories_v1';
const DATA_FILE_URL = '/data/interview_questions.json';

export const getCategories = (): string[] => {
  const stored = localStorage.getItem(CATEGORIES_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  return DEFAULT_CATEGORIES;
};

export const saveCategories = (categories: string[]) => {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
};

export const getQuestions = (): Question[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return [];
  } catch (e) {
    console.error('Failed to load questions from localStorage', e);
    return [];
  }
};

export const renameCategory = (oldName: string, newName: string) => {
  const categories = getCategories();
  const index = categories.indexOf(oldName);
  if (index === -1) return;
  
  categories[index] = newName;
  saveCategories(categories);

  const questions = getQuestions();
  let updated = false;
  questions.forEach(q => {
    if (q.category === oldName) {
      q.category = newName;
      updated = true;
    }
  });

  if (updated) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
  }
};

export const removeCategory = (name: string) => {
  const categories = getCategories().filter(c => c !== name);
  saveCategories(categories);

  const questions = getQuestions();
  let updated = false;
  questions.forEach(q => {
    if (q.category === name) {
      q.category = 'Other';
      updated = true;
    }
  });

  if (updated) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
  }
};

export const loadInitialDataFromProject = async (): Promise<Question[] | null> => {
  try {
    const response = await fetch(DATA_FILE_URL);
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch (e) {
    console.debug('Project data file not found at:', DATA_FILE_URL);
  }
  return null;
};

export const saveQuestion = async (question: Question): Promise<void> => {
  const questions = getQuestions();
  const existingIndex = questions.findIndex((q) => q.id === question.id);
  
  if (existingIndex >= 0) {
    questions[existingIndex] = question;
  } else {
    questions.unshift(question);
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
};

export const deleteQuestion = async (id: string): Promise<void> => {
  const questions = getQuestions().filter((q) => q.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
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
};

export const exportQuestions = () => {
  const data = getQuestions();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `interview_questions_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
