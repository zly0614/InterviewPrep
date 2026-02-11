
import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { AppView, Question, QuestionDraft, GroundingChunk, CATEGORY_COLORS, getCategoryColor } from './types';
import { 
  getQuestions, 
  saveQuestion, 
  deleteQuestion, 
  importQuestions, 
  loadInitialDataFromProject,
  getCategories,
  saveCategories,
  renameCategory,
  removeCategory
} from './services/storageService';
import { generateInterviewAnswer, autoCategorize, createAiChatSession } from './services/geminiService';
import { PlusIcon, ChevronLeftIcon, SparklesIcon, TrashIcon, PencilIcon, DownloadIcon, UploadIcon, SearchIcon, CalendarIcon, BuildingIcon, ExcelIcon, MarkdownIcon } from './components/Icons';
import { SourceList } from './components/SourceList';

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleDateString();
};

// Component to handle KaTeX rendering
const MathContent: React.FC<{ content: string; className?: string }> = ({ content, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && (window as any).renderMathInElement) {
      (window as any).renderMathInElement(containerRef.current, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false
      });
    }
  }, [content]);

  return (
    <div ref={containerRef} className={className}>
      {content}
    </div>
  );
};

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.LIST);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('');
  
  // Resizing state
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const isResizing = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // 表单状态
  const [formData, setFormData] = useState<QuestionDraft>({
    text: '',
    answer: '',
    category: 'Other',
    companyTag: '',
    isAiGenerated: false,
    sources: [],
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);

  // 分类管理状态
  const [newCatName, setNewCatName] = useState('');
  const [editingCat, setEditingCat] = useState<{ old: string, current: string } | null>(null);

  // AI 聊天状态
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatSessionRef = useRef<any>(null);

  // 初始化加载
  useEffect(() => {
    const init = async () => {
      const projectData = await loadInitialDataFromProject();
      if (projectData && projectData.length > 0) {
        const localData = getQuestions();
        if (localData.length === 0) {
          await importQuestions(projectData);
        }
      }
      refreshAll();
    };
    init();
  }, []);

  // Handle Resizing logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      // Calculate from the right edge
      const newWidth = window.innerWidth - e.clientX - 24; // 24 is roughly the gap/padding
      if (newWidth >= 300 && newWidth <= 800) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResizing = (e: React.MouseEvent) => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

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
    if (!formData.text.trim()) {
      alert('请输入题目内容');
      return;
    }

    let finalCategory = formData.category;
    if (!currentQuestion && formData.category === 'Other') {
      setIsCategorizing(true);
      finalCategory = await autoCategorize(formData.text);
      setIsCategorizing(false);
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

  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    if (categories.includes(newCatName.trim())) {
      alert('分类已存在');
      return;
    }
    const updated = [...categories, newCatName.trim()];
    saveCategories(updated);
    setCategories(updated);
    setNewCatName('');
  };

  const handleRenameCat = (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) {
      setEditingCat(null);
      return;
    }
    renameCategory(oldName, newName);
    setEditingCat(null);
    refreshAll();
  };

  const handleRemoveCat = (name: string) => {
    if (name === 'Other') return;
    if (confirm(`确定要删除分类 "${name}" 吗？该分类下的题目将自动归为 Other。`)) {
      removeCategory(name);
      refreshAll();
    }
  };

  const handleChatSend = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    if (!chatSessionRef.current) {
      chatSessionRef.current = createAiChatSession(formData.text, formData.answer);
    }
    const userMessage = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsChatLoading(true);
    try {
      const result = await chatSessionRef.current.sendMessage({ message: userMessage });
      setChatHistory(prev => [...prev, { role: 'model', text: result.text || "AI 暂时无法回答。" }]);
    } catch (error) {
      setChatHistory(prev => [...prev, { role: 'model', text: "抱歉，我遇到了点问题，请稍后再试。" }]);
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
      alert('生成答案失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(questions);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Questions");
    XLSX.writeFile(wb, "interview_questions.xlsx");
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = event.target?.result;
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(data as string);
          await importQuestions(parsed);
          refreshAll();
        }
      } catch (err) {
        alert('导入失败');
      }
    };
    reader.readAsText(file);
  };

  const filteredQuestions = useMemo(() => {
    return questions.filter(q => {
      const matchCategory = selectedCategory === 'All' || q.category === selectedCategory;
      const matchSearch = q.text.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (q.companyTag && q.companyTag.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchDate = !dateFilter || new Date(q.createdAt).toISOString().split('T')[0] === dateFilter;
      return matchCategory && matchSearch && matchDate;
    });
  }, [questions, selectedCategory, searchQuery, dateFilter]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-10">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Interview Master</h1>
            <p className="text-slate-500 mt-1">AI 驱动的面试题库记录工具</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleImportClick} className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
              <UploadIcon />
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
            <button onClick={handleExportExcel} className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
              <ExcelIcon />
            </button>
            <button 
              onClick={handleCreateNew}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-md hover:shadow-lg font-bold"
            >
              <PlusIcon /> 新增题目
            </button>
          </div>
        </header>

        {view === AppView.LIST && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-1 space-y-6">
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">题库分类</h3>
                  <button onClick={() => setView(AppView.MANAGE_CATEGORIES)} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors">
                    <PencilIcon />
                  </button>
                </div>
                <div className="space-y-1.5">
                  <button
                    onClick={() => setSelectedCategory('All')}
                    className={`w-full text-left px-4 py-2.5 rounded-xl text-sm transition-all ${selectedCategory === 'All' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    全部题目
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`w-full text-left px-4 py-2.5 rounded-xl text-sm transition-all ${selectedCategory === cat ? 'bg-indigo-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">日期筛选</h3>
                <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none" />
              </div>
            </div>

            <div className="md:col-span-3 space-y-6">
              <div className="relative group">
                <SearchIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="text"
                  placeholder="搜索题目、公司或关键字..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-3xl shadow-sm outline-none text-lg font-medium"
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
                {filteredQuestions.map(q => (
                  <div 
                    key={q.id}
                    onClick={() => handleViewDetail(q)}
                    className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:scale-[1.01] transition-all cursor-pointer relative overflow-hidden"
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${getCategoryColor(q.category)?.split(' ')[1] || 'bg-slate-200'}`} />
                    <div className="flex justify-between items-start mb-4">
                      <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border ${getCategoryColor(q.category)}`}>
                        {q.category}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); handleEdit(q); }} className="p-2 text-slate-400 hover:text-indigo-600"><PencilIcon /></button>
                        <button onClick={(e) => handleDelete(q.id, e)} className="p-2 text-slate-400 hover:text-red-600"><TrashIcon /></button>
                      </div>
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 line-clamp-2 mb-3 leading-snug">{q.text}</h3>
                    <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
                      {q.companyTag && <span className="bg-slate-50 px-2 py-1 rounded-lg">{q.companyTag}</span>}
                      <span>{formatDate(q.updatedAt)}</span>
                      {q.isAiGenerated && <span className="text-indigo-500 uppercase tracking-tighter">AI</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === AppView.MANAGE_CATEGORIES && (
          <div className="max-w-2xl mx-auto">
            <button onClick={() => setView(AppView.LIST)} className="flex items-center gap-2 text-slate-400 hover:text-slate-800 transition-colors mb-6 font-bold">
              <ChevronLeftIcon /> 返回列表
            </button>
            <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-10">
              <h2 className="text-3xl font-black text-slate-900">分类管理</h2>
              <div className="flex gap-3">
                <input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="输入新分类名称..." className="flex-1 px-6 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold" />
                <button onClick={handleAddCategory} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black">添加</button>
              </div>
              <div className="divide-y divide-slate-100">
                {categories.map(cat => (
                  <div key={cat} className="py-5 flex items-center justify-between group">
                    {editingCat?.old === cat ? (
                      <div className="flex-1 flex gap-3">
                        <input autoFocus type="text" value={editingCat.current} onChange={(e) => setEditingCat({...editingCat, current: e.target.value})} className="flex-1 px-4 py-2 bg-indigo-50 rounded-xl outline-none font-bold" />
                        <button onClick={() => handleRenameCat(editingCat.old, editingCat.current)} className="px-4 py-2 bg-indigo-600 text-white font-black rounded-xl">确定</button>
                        <button onClick={() => setEditingCat(null)} className="text-xs font-bold text-slate-400">取消</button>
                      </div>
                    ) : (
                      <>
                        <span className="font-bold text-slate-700 text-lg">{cat}</span>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => setEditingCat({ old: cat, current: cat })} className="p-2 text-slate-400 hover:text-indigo-600"><PencilIcon /></button>
                          {cat !== 'Other' && <button onClick={() => handleRemoveCat(cat)} className="p-2 text-slate-400 hover:text-red-600"><TrashIcon /></button>}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === AppView.FORM && (
          <div className="w-full mx-auto space-y-6">
            <button onClick={() => setView(AppView.LIST)} className="flex items-center gap-2 text-slate-400 hover:text-slate-800 mb-4 font-bold">
              <ChevronLeftIcon /> 返回
            </button>
            
            <div className="flex items-start gap-0 relative">
              {/* Main Content Area */}
              <div className="flex-1 min-w-0 pr-6">
                <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
                  <textarea value={formData.text} onChange={(e) => setFormData({...formData, text: e.target.value})} placeholder="面试题目..." className="w-full px-6 py-5 bg-slate-50 border border-slate-100 rounded-3xl min-h-[120px] outline-none text-xl font-bold" />
                  <div className="grid grid-cols-2 gap-6">
                    <select value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold">
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="text" value={formData.companyTag} onChange={(e) => setFormData({...formData, companyTag: e.target.value})} placeholder="公司标签..." className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold" />
                  </div>
                  <div className="space-y-2 pt-4">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">答案详情</label>
                      <button onClick={handleGenerateAnswer} disabled={isGenerating || !formData.text.trim()} className="flex items-center gap-2 text-xs font-black text-indigo-600">
                        {isGenerating ? '正在生成...' : <><SparklesIcon className="w-4 h-4" /> AI 生成答案</>}
                      </button>
                    </div>
                    <textarea value={formData.answer} onChange={(e) => setFormData({...formData, answer: e.target.value})} placeholder="输入答案..." className="w-full px-6 py-6 bg-slate-50 border border-slate-100 rounded-3xl min-h-[400px] outline-none font-medium leading-relaxed" />
                  </div>
                  <div className="flex justify-end gap-3 pt-6">
                    <button onClick={() => setView(AppView.LIST)} className="px-8 py-3.5 border border-slate-200 rounded-2xl font-bold">取消</button>
                    <button onClick={handleSave} className="px-10 py-3.5 bg-indigo-600 text-white rounded-2xl font-black shadow-xl">保存题目</button>
                  </div>
                </div>
              </div>

              {/* Resize handle */}
              <div 
                className="w-1.5 hover:bg-indigo-400 cursor-col-resize self-stretch transition-colors rounded-full z-10 mx-1"
                onMouseDown={startResizing}
              ></div>

              {/* AI Assistant Sidebar Area */}
              <div 
                className="bg-white rounded-[2rem] border border-slate-200 shadow-sm flex flex-col h-[750px] overflow-hidden sticky top-8 shrink-0"
                style={{ width: `${sidebarWidth}px` }}
              >
                <div className="p-6 border-b border-slate-100 flex items-center gap-2"><SparklesIcon className="w-5 h-5 text-indigo-600" /><h3 className="font-black">AI 助理</h3></div>
                <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/30">
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <MathContent 
                        content={msg.text} 
                        className={`max-w-[95%] px-4 py-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-100 text-slate-700 font-medium'}`} 
                      />
                    </div>
                  ))}
                  {isChatLoading && <div className="text-xs text-slate-400 animate-pulse">AI 正在思考...</div>}
                  <div ref={chatEndRef} />
                </div>
                <div className="p-6 bg-white border-t border-slate-100 flex gap-2">
                  <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleChatSend()} placeholder="向 AI 提问..." className="flex-1 bg-slate-50 rounded-2xl px-5 py-3.5 text-sm outline-none font-bold" />
                  <button onClick={handleChatSend} className="bg-indigo-600 text-white p-3 rounded-2xl shadow-lg active:scale-90"><PlusIcon /></button>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === AppView.DETAIL && currentQuestion && (
          <div className="max-w-4xl mx-auto">
            <button onClick={() => setView(AppView.LIST)} className="flex items-center gap-2 text-slate-400 hover:text-slate-800 mb-6 font-bold"><ChevronLeftIcon /> 返回列表</button>
            <article className="bg-white p-12 rounded-[3rem] border border-slate-200 shadow-sm space-y-8">
              <div className="flex justify-between">
                <span className={`text-[10px] font-black px-4 py-1.5 rounded-full uppercase border ${getCategoryColor(currentQuestion.category)}`}>{currentQuestion.category}</span>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(currentQuestion)} className="p-2.5 text-slate-300 hover:text-indigo-600"><PencilIcon /></button>
                  <button onClick={() => handleDelete(currentQuestion.id)} className="p-2.5 text-slate-300 hover:text-red-600"><TrashIcon /></button>
                </div>
              </div>
              <h2 className="text-4xl font-black text-slate-900 leading-tight">{currentQuestion.text}</h2>
              <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-400 pb-8 border-b border-slate-100">
                {currentQuestion.companyTag && <span className="bg-slate-50 px-4 py-2 rounded-xl">{currentQuestion.companyTag}</span>}
                <span>更新于 {formatDate(currentQuestion.updatedAt)}</span>
                {currentQuestion.isAiGenerated && <span className="text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">AI 联网生成</span>}
              </div>
              <div className="prose prose-slate max-w-none pt-4">
                <MathContent content={currentQuestion.answer || "暂无回答记录。"} className="whitespace-pre-wrap text-slate-700 leading-relaxed bg-slate-50/50 p-10 rounded-[2.5rem] border border-slate-100 text-lg font-medium" />
              </div>
              {currentQuestion.sources && currentQuestion.sources.length > 0 && <SourceList sources={currentQuestion.sources} />}
            </article>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
