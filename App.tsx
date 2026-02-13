
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AppView, Question, QuestionDraft, getCategoryColor, GroundingChunk, DateFilter } from './types';
import { 
  getQuestions, 
  saveQuestion, 
  deleteQuestion, 
  loadInitialDataFromProject,
  getCategories,
  importQuestions,
  exportQuestions
} from './services/storageService';
import { generateInterviewAnswer, autoCategorize, createAiChatSession } from './services/geminiService';
import { PlusIcon, ChevronLeftIcon, SparklesIcon, TrashIcon, PencilIcon, SearchIcon, CalendarIcon, BuildingIcon, DownloadIcon, UploadIcon } from './components/Icons';
import { SourceList } from './components/SourceList';
import { Chat, GenerateContentResponse } from "@google/genai";

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleDateString();
};

/**
 * 核心：专业公式渲染组件
 */
const MathContent: React.FC<{ content: string; className?: string }> = ({ content, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!content) return;
    const render = () => {
      if (containerRef.current && (window as any).renderMathInElement) {
        try {
          (window as any).renderMathInElement(containerRef.current, {
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '$', right: '$', display: false },
              { left: '\\(', right: '\\)', display: false },
              { left: '\\[', right: '\\]', display: true }
            ],
            throwOnError: false,
            trust: true,
          });
        } catch (err) { console.warn("KaTeX Error:", err); }
      } else { setTimeout(render, 300); }
    };
    render();
  }, [content]);

  return (
    <div ref={containerRef} className={`${className} math-container prose prose-slate max-w-none`}>
      <div className="whitespace-pre-wrap break-words leading-relaxed text-slate-700">
        {content.replace(/\\\[/g, '$$$$').replace(/\\\]/g, '$$$$').replace(/\\\(/g, '$').replace(/\\\)/g, '$')}
      </div>
    </div>
  );
};

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  sources?: GroundingChunk[];
}

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.LIST);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  const [sidebarWidth, setSidebarWidth] = useState(500);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const initialWidth = useRef(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState<QuestionDraft>({
    text: '',
    answer: '',
    category: 'Other',
    companyTag: '',
    isAiGenerated: false,
    sources: [],
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatSessionRef = useRef<Chat | null>(null);

  useEffect(() => {
    const init = async () => {
      const projectData = await loadInitialDataFromProject();
      if (projectData && projectData.length > 0) {
        const localData = getQuestions();
        if (localData.length === 0) await importQuestions(projectData);
      }
      refreshAll();
    };
    init();
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const delta = dragStartX.current - e.clientX;
      const newWidth = initialWidth.current + delta;
      if (newWidth > 350 && newWidth < window.innerWidth * 0.9) setSidebarWidth(newWidth);
    };
    const onMouseUp = () => setIsDragging(false);
    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const refreshAll = () => {
    setQuestions(getQuestions());
    setCategories(getCategories());
  };

  const handleCreateNew = () => {
    setFormData({ text: '', answer: '', category: 'Other', companyTag: '', isAiGenerated: false, sources: [] });
    setCurrentQuestion(null);
    setChatHistory([]);
    chatSessionRef.current = null;
    setView(AppView.FORM);
  };

  const handleEdit = (q: Question) => {
    setCurrentQuestion(q);
    setFormData({
      text: q.text,
      answer: q.answer,
      category: q.category || 'Other',
      companyTag: q.companyTag || '',
      isAiGenerated: q.isAiGenerated,
      sources: q.sources || [],
    });
    setChatHistory([]);
    chatSessionRef.current = null;
    setView(AppView.FORM);
  };

  const handleViewDetail = (q: Question) => {
    setCurrentQuestion(q);
    setView(AppView.DETAIL);
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (confirm('确定要删除这道题吗？')) {
      await deleteQuestion(id);
      refreshAll();
      if (view === AppView.DETAIL) setView(AppView.LIST);
    }
  };

  const handleSave = async () => {
    if (!formData.text.trim()) return;
    let finalCategory = formData.category;
    if (!currentQuestion && formData.category === 'Other') {
      try { finalCategory = await autoCategorize(formData.text); } catch(e) {}
    }
    const now = Date.now();
    const newQuestion: Question = {
      id: currentQuestion ? currentQuestion.id : crypto.randomUUID(),
      createdAt: currentQuestion ? currentQuestion.createdAt : now,
      updatedAt: now,
      text: formData.text,
      answer: formData.answer,
      category: finalCategory,
      companyTag: formData.companyTag,
      isAiGenerated: formData.isAiGenerated,
      sources: formData.sources,
    };
    await saveQuestion(newQuestion);
    refreshAll();
    setView(AppView.LIST);
  };

  const handleChatSend = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    if (!process.env.API_KEY) {
      alert("未检测到 API Key，请检查 .env.local 文件配置。");
      return;
    }
    
    const msg = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: msg }]);
    setIsChatLoading(true);

    try {
      if (!chatSessionRef.current) {
        chatSessionRef.current = createAiChatSession(formData.text, formData.answer);
      }
      const result: GenerateContentResponse = await chatSessionRef.current.sendMessage({ message: msg });
      const chunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources = chunks
        .filter((chunk: any) => chunk.web?.uri && chunk.web?.title)
        .map((chunk: any) => ({
          web: { uri: chunk.web.uri, title: chunk.web.title }
        })) as GroundingChunk[];

      setChatHistory(prev => [...prev, { 
        role: 'model', 
        text: result.text || "AI 暂时无法回答。",
        sources: sources.length > 0 ? sources : undefined
      }]);
    } catch (e) {
      console.error(e);
      setChatHistory(prev => [...prev, { role: 'model', text: "抱歉，对话解析时出现了错误，请检查网络或 API Key。" }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleGenerateAnswer = async () => {
    if (!formData.text.trim()) return;
    setIsGenerating(true);
    try {
      const result = await generateInterviewAnswer(formData.text);
      setFormData(prev => ({
        ...prev,
        answer: result.answer,
        category: result.category,
        isAiGenerated: true,
        sources: result.sources
      }));
    } catch (error) {
      alert('生成答案失败，请检查配置');
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredQuestions = useMemo(() => {
    const now = Date.now();
    return questions.filter(q => {
      const matchCategory = selectedCategory === 'All' || q.category === selectedCategory;
      let matchDate = true;
      if (dateFilter !== 'all') {
        const diff = now - q.updatedAt;
        const oneDay = 24 * 60 * 60 * 1000;
        if (dateFilter === 'today') matchDate = diff < oneDay;
        else if (dateFilter === 'week') matchDate = diff < oneDay * 7;
        else if (dateFilter === 'month') matchDate = diff < oneDay * 30;
        else if (dateFilter === 'year') matchDate = diff < oneDay * 365;
      }
      const matchSearch = q.text.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (q.companyTag && q.companyTag.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCategory && matchDate && matchSearch;
    });
  }, [questions, selectedCategory, dateFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-10">
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
             <div className="p-4 bg-indigo-600 rounded-[1.2rem] shadow-2xl shadow-indigo-200">
               <SparklesIcon className="w-7 h-7 text-white" />
             </div>
             <div>
               <h1 className="text-4xl font-black bg-gradient-to-br from-slate-900 to-indigo-600 bg-clip-text text-transparent tracking-tight">Interview Master</h1>
               <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">AI 联网增强面试系统</p>
             </div>
          </div>
          <button onClick={handleCreateNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl transition-all shadow-xl font-black text-sm active:scale-95">
            <PlusIcon /> 新增面试题
          </button>
        </header>

        {view === AppView.LIST && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            <div className="md:col-span-1 space-y-8">
              {/* 题库分类 */}
              <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">题库分类</h3>
                <div className="space-y-2">
                  <button onClick={() => setSelectedCategory('All')} className={`w-full text-left px-5 py-4 rounded-2xl text-sm transition-all font-bold ${selectedCategory === 'All' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'text-slate-500 hover:bg-slate-50'}`}>全部</button>
                  {categories.map(cat => (
                    <button key={cat} onClick={() => setSelectedCategory(cat)} className={`w-full text-left px-5 py-4 rounded-2xl text-sm transition-all font-bold ${selectedCategory === cat ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'text-slate-500 hover:bg-slate-50'}`}>{cat}</button>
                  ))}
                </div>
              </div>

              {/* 时间范围筛选 */}
              <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-6">
                  <CalendarIcon className="w-4 h-4 text-slate-400" />
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">时间范围</h3>
                </div>
                <div className="space-y-2">
                  {[
                    { id: 'all', label: '全部时间' },
                    { id: 'today', label: '今日新增' },
                    { id: 'week', label: '本周' },
                    { id: 'month', label: '本月' },
                    { id: 'year', label: '本年' }
                  ].map(item => (
                    <button 
                      key={item.id} 
                      onClick={() => setDateFilter(item.id as DateFilter)} 
                      className={`w-full text-left px-5 py-3 rounded-xl text-sm transition-all font-bold ${dateFilter === item.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 数据中心 */}
              <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">数据中心</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={exportQuestions} className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-50 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 rounded-2xl transition-all border border-slate-100"><DownloadIcon className="w-5 h-5" /><span className="text-[9px] font-black uppercase">导出</span></button>
                  <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-50 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 rounded-2xl transition-all border border-slate-100"><UploadIcon className="w-5 h-5" /><span className="text-[9px] font-black uppercase">导入</span></button>
                  <input type="file" ref={fileInputRef} onChange={(e) => {
                    const file = e.target.files?.[0];
                    if(!file) return;
                    const reader = new FileReader();
                    reader.onload = async (ev) => { try { await importQuestions(JSON.parse(ev.target?.result as string)); refreshAll(); } catch(err){alert("格式错误");}};
                    reader.readAsText(file);
                  }} accept=".json" className="hidden" />
                </div>
              </div>
            </div>

            <div className="md:col-span-3 space-y-8">
              <div className="relative">
                <SearchIcon className="absolute left-7 top-1/2 -translate-y-1/2 w-7 h-7 text-slate-300" />
                <input type="text" placeholder="搜索题目内容、公司标签..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-16 pr-8 py-6 bg-white border-none rounded-[2.5rem] shadow-xl outline-none text-2xl font-bold focus:ring-8 focus:ring-indigo-50 transition-all" />
              </div>
              <div className="grid grid-cols-1 gap-6">
                {filteredQuestions.length === 0 ? (
                  <div className="text-center py-20 bg-white rounded-[2.5rem] border border-dashed border-slate-200"><p className="text-slate-400 font-bold uppercase tracking-widest text-sm">暂无匹配题目</p></div>
                ) : (
                  filteredQuestions.map(q => (
                    <div key={q.id} onClick={() => handleViewDetail(q)} className="group bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-2xl transition-all cursor-pointer relative overflow-hidden">
                      <div className={`absolute left-0 top-0 bottom-0 w-2 ${getCategoryColor(q.category).split(' ')[1] || 'bg-indigo-600'}`} />
                      <div className="flex justify-between items-start mb-6">
                        <span className={`text-[9px] font-black px-4 py-2 rounded-full uppercase border ${getCategoryColor(q.category)}`}>{q.category}</span>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={(e) => { e.stopPropagation(); handleEdit(q); }} className="p-3 bg-slate-50 hover:bg-indigo-600 text-slate-400 hover:text-white rounded-xl transition-all"><PencilIcon /></button>
                          <button onClick={(e) => handleDelete(q.id, e)} className="p-3 bg-slate-50 hover:bg-red-600 text-slate-400 hover:text-white rounded-xl transition-all"><TrashIcon /></button>
                        </div>
                      </div>
                      <h3 className="text-3xl font-black text-slate-800 line-clamp-2 mb-6 leading-tight">{q.text}</h3>
                      <div className="flex items-center gap-8 text-[11px] font-black text-slate-300 uppercase tracking-widest">
                        {q.companyTag && <span className="bg-slate-50 text-indigo-500 px-4 py-2 rounded-xl border border-slate-100">{q.companyTag}</span>}
                        <span>{formatDate(q.updatedAt)}</span>
                        {q.isAiGenerated && <span className="text-indigo-600 font-black flex items-center gap-1"><SparklesIcon className="w-3 h-3" /> AI 联网增强</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {(view === AppView.FORM) && (
          <div className="w-full">
            <button onClick={() => setView(AppView.LIST)} className="flex items-center gap-3 text-slate-400 hover:text-indigo-600 font-black text-sm uppercase mb-10 transition-all"><ChevronLeftIcon /> 返回列表</button>
            <div className="flex items-stretch gap-0 h-[80vh] relative">
              <div className="flex-1 min-w-0 pr-10 overflow-y-auto no-scrollbar pb-20">
                <div className="bg-white p-14 rounded-[4rem] border border-slate-200 shadow-xl space-y-12">
                  <textarea value={formData.text} onChange={(e) => setFormData({...formData, text: e.target.value})} placeholder="输入面试题目内容..." className="w-full px-10 py-8 bg-slate-50 border-none rounded-[3rem] min-h-[160px] outline-none text-4xl font-black focus:bg-white focus:ring-[12px] focus:ring-indigo-50 transition-all" />
                  <div className="grid grid-cols-2 gap-12">
                    <select value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} className="w-full px-10 py-6 bg-slate-50 rounded-[2rem] outline-none font-black appearance-none focus:ring-4 focus:ring-indigo-50 transition-all">
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="text" value={formData.companyTag} onChange={(e) => setFormData({...formData, companyTag: e.target.value})} placeholder="公司标签..." className="w-full px-10 py-6 bg-slate-50 rounded-[2rem] outline-none font-black focus:bg-white transition-all" />
                  </div>
                  <div className="space-y-5">
                    <div className="flex justify-between items-center mb-2 px-4">
                      <div className="flex flex-col">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">记录答案 / 推导过程</label>
                        <span className="text-[10px] text-slate-300 font-bold uppercase mt-1">支持手写录入 & LaTeX 公式</span>
                      </div>
                      <button onClick={handleGenerateAnswer} disabled={isGenerating || !formData.text.trim()} className="flex items-center gap-3 text-xs font-black text-white bg-indigo-600 px-8 py-4 rounded-2xl shadow-xl hover:scale-105 transition-all disabled:opacity-40">
                        {isGenerating ? '正在联网推演...' : <><SparklesIcon className="w-5 h-5" /> 联网 AI 生成步骤</>}
                      </button>
                    </div>
                    {/* 模拟手写笔记区域 */}
                    <div className="relative group">
                      <textarea value={formData.answer} onChange={(e) => setFormData({...formData, answer: e.target.value})} placeholder="在此手动记录解析，公式用 $ 包裹..." className="w-full px-12 py-12 bg-slate-50 rounded-[3.5rem] min-h-[500px] outline-none font-medium text-xl leading-relaxed text-slate-700 focus:bg-white transition-all border-2 border-transparent focus:border-indigo-100" />
                      <div className="absolute top-4 right-8 opacity-20 group-hover:opacity-100 transition-opacity">
                        <PencilIcon className="w-8 h-8 text-slate-400" />
                      </div>
                    </div>
                  </div>
                  {formData.sources && formData.sources.length > 0 && <SourceList sources={formData.sources} />}
                  <div className="flex justify-end gap-5">
                    <button onClick={() => setView(AppView.LIST)} className="px-14 py-6 border border-slate-100 rounded-[2rem] font-black uppercase text-slate-400 hover:bg-slate-50 transition-all">取消</button>
                    <button onClick={handleSave} className="px-20 py-6 bg-slate-900 text-white rounded-[2.2rem] font-black shadow-2xl hover:bg-indigo-600 transition-all active:scale-95">确认保存</button>
                  </div>
                </div>
              </div>
              
              {/* Sidebar Dragger */}
              <div className="group w-8 -mx-4 cursor-col-resize z-30 flex items-center justify-center" onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); dragStartX.current = e.clientX; initialWidth.current = sidebarWidth; }}>
                <div className={`w-1.5 h-32 rounded-full transition-all ${isDragging ? 'bg-indigo-600 h-64' : 'bg-slate-300 group-hover:bg-indigo-500'}`} />
              </div>

              {/* AI Assistant Sidebar */}
              <div className={`bg-white rounded-[4rem] border border-slate-200 shadow-2xl flex flex-col overflow-hidden shrink-0 transition-[width] duration-300 relative`} style={{ width: isSidebarExpanded ? '90%' : `${sidebarWidth}px` }}>
                <div className="p-10 border-b flex items-center justify-between bg-white/50 backdrop-blur-md">
                  <div className="flex items-center gap-3">
                    <SparklesIcon className="text-indigo-600" /> 
                    <h3 className="font-black text-slate-800 text-xl tracking-tight">AI 联网对话助手</h3>
                  </div>
                  <button onClick={() => setIsSidebarExpanded(!isSidebarExpanded)} className="text-slate-300 hover:text-indigo-600 transition-all">
                    {isSidebarExpanded ? <ChevronLeftIcon className="rotate-180" /> : <PlusIcon className="rotate-45" />}
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-12 space-y-10 bg-slate-50/20 no-scrollbar pb-32">
                  {chatHistory.length === 0 && (
                    <div className="text-center py-24 opacity-30 flex flex-col items-center">
                       <SearchIcon className="w-16 h-16 mb-6 text-slate-300" />
                       <p className="font-black text-sm uppercase tracking-widest text-slate-500">在此针对细节进行追问 (支持联网检索)</p>
                    </div>
                  )}
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[96%] shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-[2.2rem] rounded-tr-none' : 'bg-white border border-slate-100 text-slate-800 rounded-[2.8rem] rounded-tl-none'} px-10 py-8`}>
                        <MathContent content={msg.text} className={`text-lg leading-[1.6] ${msg.role === 'model' ? 'font-medium' : 'font-bold'}`} />
                        {msg.sources && msg.sources.length > 0 && <SourceList sources={msg.sources} />}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-slate-100 px-8 py-4 rounded-[2rem] text-xs font-black text-slate-400 animate-pulse uppercase flex items-center gap-2"><SparklesIcon className="w-3 h-3" /> 联网推演原理中...</div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-10 bg-white/80 backdrop-blur-md border-t">
                  <div className="flex gap-5">
                    <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleChatSend()} placeholder="追问详细推导或背景..." className="flex-1 bg-slate-100 border-none rounded-[1.8rem] px-10 py-6 text-lg outline-none font-bold focus:bg-white transition-all shadow-inner" />
                    <button onClick={handleChatSend} disabled={isChatLoading || !chatInput.trim()} className="bg-slate-900 text-white p-6 rounded-[1.8rem] shadow-xl hover:bg-indigo-600 transition-all disabled:opacity-30"><PlusIcon /></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === AppView.DETAIL && currentQuestion && (
          <div className="max-w-6xl mx-auto">
            <button onClick={() => setView(AppView.LIST)} className="flex items-center gap-3 text-slate-400 hover:text-indigo-600 mb-10 font-black uppercase text-sm tracking-widest transition-all"><ChevronLeftIcon /> 返回列表</button>
            <article className="bg-white p-20 rounded-[4.5rem] border border-slate-200 shadow-2xl space-y-14">
              <span className={`text-[10px] font-black px-6 py-3 rounded-full uppercase border ${getCategoryColor(currentQuestion.category)}`}>{currentQuestion.category}</span>
              <h2 className="text-6xl font-black text-slate-900 leading-tight tracking-tighter">{currentQuestion.text}</h2>
              <div className="flex gap-10 text-[11px] font-black text-slate-300 uppercase pb-14 border-b">
                {currentQuestion.companyTag && <div className="flex items-center gap-3 bg-slate-50 text-indigo-600 px-8 py-4 rounded-2xl border"><BuildingIcon />{currentQuestion.companyTag}</div>}
                <div className="flex items-center gap-3"><CalendarIcon /> 更新于 {formatDate(currentQuestion.updatedAt)}</div>
                {currentQuestion.isAiGenerated && <div className="text-indigo-600 font-black">联网 AI 辅助解析</div>}
              </div>
              <div className="pt-6">
                <MathContent content={currentQuestion.answer || "暂无记录解析内容。"} className="text-slate-700 bg-slate-50/40 p-16 rounded-[4rem] text-[1.6rem] font-medium leading-relaxed" />
              </div>
              {currentQuestion.sources && <SourceList sources={currentQuestion.sources} />}
              <div className="flex justify-end gap-5 pt-10">
                <button onClick={() => handleEdit(currentQuestion)} className="flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-xl hover:bg-indigo-700 transition-all"><PencilIcon className="w-4 h-4" /> 编辑题目</button>
                <button onClick={() => handleDelete(currentQuestion.id)} className="flex items-center gap-2 px-8 py-4 border border-red-100 text-red-500 rounded-2xl font-black text-sm hover:bg-red-50 transition-all"><TrashIcon className="w-4 h-4" /> 删除题目</button>
              </div>
            </article>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
