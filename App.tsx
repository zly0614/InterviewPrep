
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AppView, Question, QuestionDraft, getCategoryColor, GroundingChunk, DateFilter } from './types';
import { 
  getQuestions, 
  saveQuestion, 
  deleteQuestion, 
  loadInitialDataFromProject,
  getCategories,
  saveCategories,
  renameCategory,
  removeCategory,
  importQuestions,
  exportQuestions
} from './services/storageService';
import { generateInterviewAnswer, autoCategorize, createAiChatSession } from './services/geminiService';
import { 
  PlusIcon, 
  ChevronLeftIcon, 
  SparklesIcon, 
  TrashIcon, 
  PencilIcon, 
  SearchIcon, 
  CalendarIcon, 
  BuildingIcon, 
  DownloadIcon, 
  UploadIcon,
  Cog6ToothIcon,
  CheckIcon
} from './components/Icons';
import { SourceList } from './components/SourceList';
import { Chat, GenerateContentResponse } from "@google/genai";

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleDateString();
};

/**
 * Enhanced handwriting component with responsive scaling
 */
const HandwritingCanvas: React.FC<{ value?: string; onChange: (data: string) => void; readOnly?: boolean }> = ({ value, onChange, readOnly }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = 500 * 2;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(2, 2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2.5;
      ctxRef.current = ctx;
      
      if (value) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, 500);
        img.src = value;
      }
    }
  };

  useEffect(() => {
    initCanvas();
    window.addEventListener('resize', initCanvas);
    return () => window.removeEventListener('resize', initCanvas);
  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (readOnly) return;
    setIsDrawing(true);
    const { x, y } = getCoordinates(e);
    ctxRef.current?.beginPath();
    ctxRef.current?.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || readOnly) return;
    const { x, y } = getCoordinates(e);
    ctxRef.current?.lineTo(x, y);
    ctxRef.current?.stroke();
  };

  const stopDrawing = () => {
    if (readOnly) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL());
  };

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden bg-slate-50 rounded-[2.5rem] border-2 border-slate-100 shadow-inner">
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={(e) => { e.preventDefault(); startDrawing(e); }}
        onTouchMove={(e) => { e.preventDefault(); draw(e); }}
        onTouchEnd={stopDrawing}
        className={`w-full h-[500px] cursor-crosshair ${readOnly ? 'pointer-events-none' : ''}`}
        style={{ touchAction: 'none' }}
      />
      {!readOnly && (
        <div className="absolute top-6 right-6 flex gap-3">
          <button 
            onClick={() => {
              const ctx = ctxRef.current;
              if (ctx && canvasRef.current) {
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                onChange('');
              }
            }} 
            className="px-5 py-2 bg-white/90 backdrop-blur rounded-xl text-rose-500 shadow-lg hover:bg-rose-50 font-black text-[10px] uppercase transition-all"
          >
            清空画布
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * CSP-Safe Math Rendering Component
 */
const MathContent: React.FC<{ content: string; className?: string }> = ({ content, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!content || !containerRef.current) return;
    
    const text = content
      .replace(/\\\[/g, '$$$$')
      .replace(/\\\]/g, '$$$$')
      .replace(/\\\(/g, '$')
      .replace(/\\\)/g, '$');
    
    const parts = text.split(/(\$\$.*?\$\$|\$.*?\$)/gs);
    containerRef.current.innerHTML = '';
    
    parts.forEach(part => {
      if (!part) return;
      if (part.startsWith('$$') && part.endsWith('$$')) {
        const math = part.slice(2, -2);
        const div = document.createElement('div');
        div.className = 'my-6 flex justify-center overflow-x-auto py-2';
        try {
          (window as any).katex.render(math, div, { displayMode: true, throwOnError: false });
        } catch (e) { div.innerText = part; }
        containerRef.current?.appendChild(div);
      } else if (part.startsWith('$') && part.endsWith('$')) {
        const math = part.slice(1, -1);
        const span = document.createElement('span');
        span.className = 'inline-block px-1';
        try {
          (window as any).katex.render(math, span, { displayMode: false, throwOnError: false });
        } catch (e) { span.innerText = part; }
        containerRef.current?.appendChild(span);
      } else {
        const span = document.createElement('span');
        span.innerText = part;
        containerRef.current?.appendChild(span);
      }
    });
  }, [content]);

  return <div ref={containerRef} className={`${className} whitespace-pre-wrap break-words leading-relaxed text-slate-700 font-medium`} />;
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
  
  const [editMode, setEditMode] = useState<'text' | 'drawing'>('text');
  const [formData, setFormData] = useState<QuestionDraft>({
    text: '',
    answer: '',
    drawing: '',
    category: 'Other',
    companyTag: '',
    isAiGenerated: false,
    sources: [],
  });
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState<string[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatSessionRef = useRef<Chat | null>(null);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryIndex, setEditingCategoryIndex] = useState<number | null>(null);
  const [editingCategoryValue, setEditingCategoryValue] = useState('');

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
    setFormData({ text: '', answer: '', drawing: '', category: 'Other', companyTag: '', isAiGenerated: false, sources: [] });
    setCurrentQuestion(null);
    setChatHistory([]);
    setEditMode('text');
    chatSessionRef.current = null;
    setView(AppView.FORM);
  };

  const handleEdit = (q: Question) => {
    setCurrentQuestion(q);
    setFormData({
      text: q.text,
      answer: q.answer,
      drawing: q.drawing || '',
      category: q.category || 'Other',
      companyTag: q.companyTag || '',
      isAiGenerated: q.isAiGenerated,
      sources: q.sources || [],
    });
    setChatHistory([]);
    setEditMode(q.drawing ? 'drawing' : 'text');
    chatSessionRef.current = null;
    setView(AppView.FORM);
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
      drawing: formData.drawing,
      category: finalCategory,
      companyTag: formData.companyTag,
      isAiGenerated: formData.isAiGenerated,
      sources: formData.sources,
    };
    await saveQuestion(newQuestion);
    refreshAll();
    setView(AppView.LIST);
  };

  const handleGenerateAnswer = async () => {
    if (!formData.text.trim()) return;
    setIsGenerating(true);
    setGenStatus(['📡 启动联网搜索引擎...']);
    
    try {
      setTimeout(() => setGenStatus(prev => [...prev, '🔍 检索行业最佳实践及深度资料...']), 800);
      setTimeout(() => setGenStatus(prev => [...prev, '🧠 分析题目结构及推演逻辑...']), 1600);
      setTimeout(() => setGenStatus(prev => [...prev, '✍️ 整理 LaTeX 公式及专业解答...']), 2400);

      const result = await generateInterviewAnswer(formData.text);
      
      setFormData(prev => ({
        ...prev,
        answer: result.answer,
        category: result.category,
        isAiGenerated: true,
        sources: result.sources
      }));
      setEditMode('text');
    } catch (error) {
      alert('生成答案失败，请检查 API 配置');
    } finally {
      setTimeout(() => {
        setIsGenerating(false);
        setGenStatus([]);
      }, 500);
    }
  };

  // Fix: Added handleViewDetail to resolve missing reference in List view
  const handleViewDetail = (q: Question) => {
    setCurrentQuestion(q);
    setView(AppView.DETAIL);
  };

  // Fix: Added handleChatSend to resolve missing reference in AI Chat Assistant
  const handleChatSend = async () => {
    if (!chatInput.trim()) return;

    const userMessage: ChatMessage = { role: 'user', text: chatInput };
    setChatHistory(prev => [...prev, userMessage]);
    
    const textToSubmit = chatInput;
    setChatInput('');
    setIsChatLoading(true);

    try {
      if (!chatSessionRef.current) {
        // Initialize conversational session with technical reasoning model
        chatSessionRef.current = createAiChatSession(formData.text, formData.answer);
      }

      // Use sendMessage to interact with the persistent chat session
      const response = await chatSessionRef.current.sendMessage({ message: textToSubmit });
      const responseText = response.text || "";
      
      // Extract grounding metadata to display sources as required by Gemini guidelines
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources = chunks
        .filter((chunk: any) => chunk.web?.uri && chunk.web?.title)
        .map((chunk: any) => ({
          web: {
            uri: chunk.web.uri,
            title: chunk.web.title
          }
        })) as GroundingChunk[];

      setChatHistory(prev => [...prev, { 
        role: 'model', 
        text: responseText, 
        sources: sources.length > 0 ? sources : undefined 
      }]);
    } catch (error) {
      console.error("AI Assistant Error:", error);
      setChatHistory(prev => [...prev, { 
        role: 'model', 
        text: "抱歉，AI 助手请求超时或发生错误。请检查您的 API Key 状态。" 
      }]);
    } finally {
      setIsChatLoading(false);
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
        <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-6">
             <div className="p-5 bg-indigo-600 rounded-[1.5rem] shadow-2xl shadow-indigo-200">
               <SparklesIcon className="w-8 h-8 text-white" />
             </div>
             <div>
               <h1 className="text-4xl font-black bg-gradient-to-br from-slate-900 to-indigo-600 bg-clip-text text-transparent tracking-tight">Interview Master</h1>
               <p className="text-slate-400 font-bold uppercase tracking-widest text-[11px] mt-1 flex items-center gap-2">
                 <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                 AI 联网增强面试库
               </p>
             </div>
          </div>
          <button onClick={handleCreateNew} className="flex items-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-5 rounded-[1.5rem] transition-all shadow-xl font-black text-sm active:scale-95">
            <PlusIcon /> 新增面试题
          </button>
        </header>

        {view === AppView.LIST && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
            <aside className="md:col-span-1 space-y-10">
              <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">题库分类</h3>
                  <button onClick={() => setView(AppView.MANAGE_CATEGORIES)} className="text-slate-300 hover:text-indigo-600 transition-colors p-2">
                    <Cog6ToothIcon className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-3">
                  <button onClick={() => setSelectedCategory('All')} className={`w-full text-left px-6 py-5 rounded-2xl text-sm transition-all font-black ${selectedCategory === 'All' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'text-slate-500 hover:bg-slate-50'}`}>全部题库</button>
                  {categories.map(cat => (
                    <button key={cat} onClick={() => setSelectedCategory(cat)} className={`w-full text-left px-6 py-5 rounded-2xl text-sm transition-all font-black ${selectedCategory === cat ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'text-slate-500 hover:bg-slate-50'}`}>{cat}</button>
                  ))}
                </div>
              </div>

              <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-8">
                  <CalendarIcon className="w-5 h-5 text-slate-400" />
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">记录时间</h3>
                </div>
                <div className="space-y-3">
                  {['all', 'today', 'week', 'month'].map(item => (
                    <button 
                      key={item} 
                      onClick={() => setDateFilter(item as DateFilter)} 
                      className={`w-full text-left px-6 py-4 rounded-2xl text-sm transition-all font-black ${dateFilter === item ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                      {item === 'all' ? '全部时间' : item === 'today' ? '今日新增' : item === 'week' ? '本周记录' : '本月记录'}
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <main className="md:col-span-3 space-y-10">
              <div className="relative group">
                <SearchIcon className="absolute left-8 top-1/2 -translate-y-1/2 w-8 h-8 text-slate-300 group-focus-within:text-indigo-500 transition-colors" />
                <input 
                  type="text" 
                  placeholder="搜索题目核心关键词或公司名称..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className="w-full pl-20 pr-10 py-8 bg-white border-none rounded-[3rem] shadow-xl outline-none text-2xl font-black focus:ring-8 focus:ring-indigo-50 transition-all placeholder:text-slate-200" 
                />
              </div>

              <div className="grid grid-cols-1 gap-8">
                {filteredQuestions.length === 0 ? (
                  <div className="text-center py-32 bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
                    <p className="text-slate-300 font-black uppercase tracking-[0.2em] text-sm">暂无匹配的面试题目</p>
                  </div>
                ) : (
                  filteredQuestions.map(q => (
                    <div 
                      key={q.id} 
                      onClick={() => handleViewDetail(q)} 
                      className="group bg-white p-12 rounded-[3rem] border border-slate-200 shadow-sm hover:shadow-2xl transition-all cursor-pointer relative overflow-hidden"
                    >
                      <div className={`absolute left-0 top-0 bottom-0 w-2.5 ${getCategoryColor(q.category).split(' ')[1]}`} />
                      <div className="flex justify-between items-start mb-8">
                        <span className={`text-[10px] font-black px-5 py-2.5 rounded-full uppercase border ${getCategoryColor(q.category)} shadow-sm`}>{q.category}</span>
                        <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={(e) => { e.stopPropagation(); handleEdit(q); }} className="p-3.5 bg-slate-50 hover:bg-indigo-600 text-slate-400 hover:text-white rounded-2xl transition-all shadow-sm"><PencilIcon /></button>
                          <button onClick={(e) => { e.stopPropagation(); deleteQuestion(q.id).then(refreshAll); }} className="p-3.5 bg-slate-50 hover:bg-red-600 text-slate-400 hover:text-white rounded-2xl transition-all shadow-sm"><TrashIcon /></button>
                        </div>
                      </div>
                      <h3 className="text-3xl font-black text-slate-800 line-clamp-2 mb-8 leading-tight tracking-tight">{q.text}</h3>
                      <div className="flex items-center gap-10 text-[11px] font-black text-slate-300 uppercase tracking-widest">
                        {q.companyTag && <span className="bg-slate-50 text-indigo-500 px-5 py-2.5 rounded-xl border border-slate-100">{q.companyTag}</span>}
                        <span>{formatDate(q.updatedAt)}</span>
                        {q.isAiGenerated && <span className="text-indigo-600 font-black flex items-center gap-2"><SparklesIcon className="w-4 h-4" /> AI ENHANCED</span>}
                        {q.drawing && <span className="text-rose-400 font-black flex items-center gap-2"><PencilIcon className="w-4 h-4" /> HANDWRITTEN</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </main>
          </div>
        )}

        {(view === AppView.FORM) && (
          <div className="w-full">
            <button onClick={() => setView(AppView.LIST)} className="flex items-center gap-3 text-slate-400 hover:text-indigo-600 font-black text-sm uppercase mb-10 transition-all active:scale-95"><ChevronLeftIcon /> 返回题库列表</button>
            <div className="flex items-stretch gap-0 h-[82vh] relative">
              <div className="flex-1 min-w-0 pr-12 overflow-y-auto no-scrollbar pb-32">
                <div className="bg-white p-16 rounded-[4.5rem] border border-slate-200 shadow-2xl space-y-16">
                  <div className="space-y-4">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-4">面试题目</label>
                    <textarea 
                      value={formData.text} 
                      onChange={(e) => setFormData({...formData, text: e.target.value})} 
                      placeholder="请粘贴或输入面试题目..." 
                      className="w-full px-12 py-10 bg-slate-50 border-none rounded-[3.5rem] min-h-[140px] outline-none text-4xl font-black focus:bg-white focus:ring-[14px] focus:ring-indigo-50 transition-all shadow-inner" 
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-12">
                    <div className="space-y-4">
                      <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-4">题目分类</label>
                      <select value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} className="w-full px-12 py-7 bg-slate-50 rounded-[2.5rem] outline-none font-black appearance-none focus:ring-4 focus:ring-indigo-50 transition-all shadow-inner border-none">
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="space-y-4">
                      <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-4">面试公司</label>
                      <input type="text" value={formData.companyTag} onChange={(e) => setFormData({...formData, companyTag: e.target.value})} placeholder="例如: Google, ByteDance..." className="w-full px-12 py-7 bg-slate-50 rounded-[2.5rem] outline-none font-black focus:bg-white transition-all shadow-inner border-none" />
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div className="flex justify-between items-end px-4">
                      <div className="space-y-3">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block">详解内容</label>
                        <div className="flex gap-4">
                          <button onClick={() => setEditMode('text')} className={`text-[10px] font-black uppercase px-6 py-3 rounded-xl border-2 transition-all ${editMode === 'text' ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white text-slate-400 border-slate-100 hover:border-indigo-100'}`}>文本推导</button>
                          <button onClick={() => setEditMode('drawing')} className={`text-[10px] font-black uppercase px-6 py-3 rounded-xl border-2 transition-all ${editMode === 'drawing' ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-white text-slate-400 border-slate-100 hover:border-indigo-100'}`}>手写过程</button>
                        </div>
                      </div>
                      <button 
                        onClick={handleGenerateAnswer} 
                        disabled={isGenerating || !formData.text.trim()} 
                        className="flex items-center gap-3 text-xs font-black text-white bg-indigo-600 px-10 py-5 rounded-[1.5rem] shadow-2xl hover:scale-105 transition-all disabled:opacity-40 relative group overflow-hidden"
                      >
                        <span className="relative z-10 flex items-center gap-2">
                          {isGenerating ? <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" /> : <SparklesIcon className="w-5 h-5" />}
                          {isGenerating ? 'AI 推演中' : '联网生成详解'}
                        </span>
                        {isGenerating && <div className="absolute inset-0 bg-indigo-500 animate-pulse" />}
                      </button>
                    </div>

                    {isGenerating && genStatus.length > 0 && (
                      <div className="mx-4 p-8 bg-indigo-50/50 rounded-[2rem] border border-indigo-100 space-y-3 animate-in fade-in slide-in-from-top-4 duration-500">
                        {genStatus.map((status, i) => (
                          <div key={i} className="flex items-center gap-3 text-xs font-black text-indigo-600 animate-in fade-in slide-in-from-left-2" style={{ animationDelay: `${i * 200}ms` }}>
                             {i === genStatus.length - 1 ? <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping" /> : <CheckIcon className="w-3 h-3" />}
                             {status}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {editMode === 'text' ? (
                      <textarea 
                        value={formData.answer} 
                        onChange={(e) => setFormData({...formData, answer: e.target.value})} 
                        placeholder="在此手动记录题目解析，LaTeX 公式请用 $ 包裹..." 
                        className="w-full px-12 py-12 bg-slate-50 rounded-[3.5rem] min-h-[600px] outline-none font-medium text-xl leading-relaxed text-slate-700 focus:bg-white transition-all shadow-inner border-none" 
                      />
                    ) : (
                      <HandwritingCanvas value={formData.drawing} onChange={(data) => setFormData({...formData, drawing: data})} />
                    )}
                  </div>

                  <div className="flex justify-end gap-6 pt-10">
                    <button onClick={() => setView(AppView.LIST)} className="px-12 py-6 border-2 border-slate-100 rounded-[2rem] font-black uppercase text-slate-400 hover:bg-slate-50 transition-all text-sm">取消</button>
                    <button onClick={handleSave} className="px-20 py-6 bg-slate-900 text-white rounded-[2.2rem] font-black shadow-2xl hover:bg-indigo-600 transition-all active:scale-95 text-sm">确认并保存</button>
                  </div>
                </div>
              </div>
              
              <div 
                className="group w-8 -mx-4 cursor-col-resize z-30 flex items-center justify-center" 
                onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); dragStartX.current = e.clientX; initialWidth.current = sidebarWidth; }}
              >
                <div className={`w-1.5 h-32 rounded-full transition-all ${isDragging ? 'bg-indigo-600 h-64' : 'bg-slate-200 group-hover:bg-indigo-400'}`} />
              </div>

              <div 
                className={`bg-white rounded-[4.5rem] border border-slate-200 shadow-2xl flex flex-col overflow-hidden shrink-0 transition-[width] duration-500 relative`} 
                style={{ width: isSidebarExpanded ? '90%' : `${sidebarWidth}px` }}
              >
                <div className="p-10 border-b flex items-center justify-between bg-white/70 backdrop-blur-xl sticky top-0 z-20">
                  <div className="flex items-center gap-4">
                    <SparklesIcon className="text-indigo-600 w-7 h-7" /> 
                    <h3 className="font-black text-slate-800 text-2xl tracking-tight">AI 对话助手</h3>
                  </div>
                  <button onClick={() => setIsSidebarExpanded(!isSidebarExpanded)} className="text-slate-300 hover:text-indigo-600 transition-all p-2 rounded-xl hover:bg-slate-50">
                    {isSidebarExpanded ? <ChevronLeftIcon className="rotate-180" /> : <PlusIcon className="rotate-45" />}
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-12 space-y-12 bg-slate-50/10 no-scrollbar pb-40">
                  {chatHistory.length === 0 && (
                    <div className="text-center py-32 opacity-20 flex flex-col items-center">
                       <SearchIcon className="w-20 h-20 mb-8 text-slate-200" />
                       <p className="font-black text-base uppercase tracking-widest text-slate-400">在此针对解析细节进行深度追问</p>
                       <p className="text-xs font-bold text-slate-300 mt-2">支持联网实时检索技术文档及最新方案</p>
                    </div>
                  )}
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[92%] shadow-lg ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-[2.5rem] rounded-tr-none' : 'bg-white border border-slate-100 text-slate-800 rounded-[3rem] rounded-tl-none'} px-10 py-9`}>
                        <MathContent content={msg.text} className={`text-xl leading-[1.7] ${msg.role === 'model' ? 'font-medium' : 'font-bold'}`} />
                        {msg.sources && <SourceList sources={msg.sources} />}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-slate-100 px-10 py-6 rounded-[2.5rem] text-sm font-black text-slate-400 animate-pulse flex items-center gap-3">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" />
                        AI 联网思考中...
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-10 bg-white/80 backdrop-blur-xl border-t border-slate-100">
                  <div className="flex gap-6 items-center">
                    <input 
                      type="text" 
                      value={chatInput} 
                      onChange={(e) => setChatInput(e.target.value)} 
                      onKeyDown={(e) => e.key === 'Enter' && handleChatSend()} 
                      placeholder="询问原理、边界情况 or 实际案例..." 
                      className="flex-1 bg-slate-100 border-none rounded-[2rem] px-10 py-7 text-xl outline-none font-bold focus:bg-white transition-all shadow-inner focus:ring-4 focus:ring-indigo-50" 
                    />
                    <button 
                      onClick={handleChatSend} 
                      disabled={isChatLoading || !chatInput.trim()} 
                      className="bg-slate-900 text-white p-7 rounded-[2rem] shadow-xl hover:bg-indigo-600 transition-all disabled:opacity-30 active:scale-90"
                    >
                      <PlusIcon className="w-7 h-7" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === AppView.DETAIL && currentQuestion && (
          <div className="max-w-6xl mx-auto pb-32">
            <button onClick={() => setView(AppView.LIST)} className="flex items-center gap-3 text-slate-400 hover:text-indigo-600 mb-12 font-black uppercase text-sm tracking-widest transition-all"><ChevronLeftIcon /> 返回题库列表</button>
            <article className="bg-white p-20 rounded-[5rem] border border-slate-200 shadow-2xl space-y-16">
              <span className={`text-[11px] font-black px-7 py-3 rounded-full uppercase border ${getCategoryColor(currentQuestion.category)} shadow-sm`}>{currentQuestion.category}</span>
              <h2 className="text-6xl font-black text-slate-900 leading-[1.15] tracking-tight">{currentQuestion.text}</h2>
              <div className="flex flex-wrap gap-10 text-[12px] font-black text-slate-300 uppercase pb-16 border-b border-slate-100">
                {currentQuestion.companyTag && <div className="flex items-center gap-4 bg-slate-50 text-indigo-600 px-8 py-4 rounded-2xl border"><BuildingIcon />{currentQuestion.companyTag}</div>}
                <div className="flex items-center gap-4"><CalendarIcon /> 最后更新: {formatDate(currentQuestion.updatedAt)}</div>
                {currentQuestion.isAiGenerated && <div className="text-indigo-600 font-black flex items-center gap-2"><SparklesIcon className="w-4 h-4" /> 联网 AI 辅助解析</div>}
              </div>
              <div className="pt-8 space-y-16">
                {currentQuestion.answer && (
                  <div className="bg-slate-50/30 p-16 rounded-[4rem] border border-slate-100">
                    <MathContent content={currentQuestion.answer} className="text-slate-700 text-[1.75rem] font-medium leading-relaxed" />
                  </div>
                )}
                {currentQuestion.drawing && (
                  <div className="bg-white p-12 rounded-[4rem] border border-slate-200 shadow-xl overflow-hidden">
                    <h4 className="text-[11px] font-black text-slate-300 uppercase tracking-[0.3em] mb-10 text-center">手写推导笔记</h4>
                    <img src={currentQuestion.drawing} alt="Handwritten Note" className="w-full h-auto rounded-3xl shadow-sm" />
                  </div>
                )}
                {!currentQuestion.answer && !currentQuestion.drawing && <p className="text-slate-300 font-black text-center py-24 text-xl uppercase tracking-widest opacity-30">暂未记录任何解析内容</p>}
              </div>
              {currentQuestion.sources && <SourceList sources={currentQuestion.sources} />}
              <div className="flex justify-end gap-6 pt-12">
                <button onClick={() => handleEdit(currentQuestion)} className="flex items-center gap-3 px-10 py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-sm shadow-xl hover:bg-indigo-700 transition-all active:scale-95"><PencilIcon className="w-5 h-5" /> 编辑题目</button>
                <button onClick={() => deleteQuestion(currentQuestion.id).then(() => setView(AppView.LIST))} className="flex items-center gap-3 px-10 py-5 border-2 border-red-50 text-red-500 rounded-[1.5rem] font-black text-sm hover:bg-red-50 transition-all"><TrashIcon className="w-5 h-5" /> 永久删除</button>
              </div>
            </article>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
