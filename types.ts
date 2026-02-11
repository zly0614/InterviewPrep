
export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface Question {
  id: string;
  text: string;
  answer: string;
  category: string;
  companyTag: string;
  createdAt: number;
  updatedAt: number;
  isAiGenerated: boolean;
  sources?: GroundingChunk[];
}

export enum AppView {
  LIST = 'LIST',
  FORM = 'FORM',
  DETAIL = 'DETAIL',
  MANAGE_CATEGORIES = 'MANAGE_CATEGORIES'
}

export type QuestionDraft = Omit<Question, 'id' | 'createdAt' | 'updatedAt'>;

export const DEFAULT_CATEGORIES = [
  'Algorithm',
  'Reinforcement Learning',
  'SFT',
  'Machine Learning',
  'NLP',
  'Multimodal',
  'Software Engineering',
  'Behavioral',
  'Other'
];

export const CATEGORY_COLORS: Record<string, string> = {
  'Algorithm': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Reinforcement Learning': 'bg-orange-100 text-orange-700 border-orange-200',
  'SFT': 'bg-pink-100 text-pink-700 border-pink-200',
  'Machine Learning': 'bg-blue-100 text-blue-700 border-blue-200',
  'NLP': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Multimodal': 'bg-purple-100 text-purple-700 border-purple-200',
  'Software Engineering': 'bg-slate-100 text-slate-700 border-slate-200',
  'Behavioral': 'bg-rose-100 text-rose-700 border-rose-200',
  'Other': 'bg-gray-100 text-gray-700 border-gray-200',
};

// Fallback color for dynamic categories
export const getCategoryColor = (category: string) => {
  return CATEGORY_COLORS[category] || 'bg-indigo-50 text-indigo-700 border-indigo-100';
};
