
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

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.LIST);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('');
  
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
      // 1. 尝试加载项目预设数据
      const projectData = await loadInitialDataFromProject();
      if (projectData && projectData.length > 0) {
        await importQuestions(projectData);
      }
      
      // 2. 刷新视图
      refreshAll();
    };
    init();
  }, []);

  // 聊天自动滚动
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
    if (name === 'Other') {
      alert('不能删除默认分类 Other');
      return;
    }
    if (confirm(`确定要删除分类 "${name}" 吗？该分类下的题目将自动归为 Other。`)) {
      removeCategory(name);
      refreshAll();
    }
  };

  // AI 聊天处理
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
      const modelText = result.text || "No response received.";
      setChatHistory(prev => [...prev, { role: 'model', text: modelText }]);
    } catch (error) {
      setChatHistory(prev => [...prev, { role: 'model', text: "抱歉，我遇到了点问题，请稍后再试。" }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleGenerateAnswer = async () => {
    if (!formData.text.trim()) {
      alert('请先输入题目');
      return;
    }
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
      alert('生成答案失败，请检查网络或 API 配置');
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

  const handleExportMarkdown = () => {
    let md = "# Interview Questions\n\n";
    questions.forEach(q => {
      md += `## [${q.category}] ${q.text}\n\n`;
      if (q.companyTag) md += `**Company:** ${q.companyTag}\n\n`;
      md += `### Answer\n${q.answer}\n\n`;
      if (q.sources && q.sources.length > 0) {
        md += `### Sources\n`;
        q.sources.forEach(s => md += `- [${s.web?.title}](${s.web?.uri})\n`);
        md += `\n`;
      }
      md += `---\n\n`;
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "questions.md";
    a.click();
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
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(sheet);
          await importQuestions(json as Question[]);
          refreshAll();
        }
      } catch (err) {
        alert('导入失败，请检查文件格式');
      }
    };

    if (file.name.endsWith('.json')) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
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

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-10">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Interview Master</h1>
            <p className="text-slate-500 mt-1">AI-powered interview preparation toolkit</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleImportClick}
              className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              title="Import Questions"
            >
              <UploadIcon />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept=".json,.xlsx,.xls"
            />
            <div className="relative group">
              <button className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                <DownloadIcon />
              </button>
              <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all z-10">
                <button onClick={handleExportExcel} className="w-full flex items-center gap-2 px-4 py-2 hover:bg-slate-50 text-sm">
                  <ExcelIcon /> Export Excel
                </button>
                <button onClick={handleExportMarkdown} className="w-full flex items-center gap-2 px-4 py-2 hover:bg-slate-50 text-sm">
                  <MarkdownIcon /> Export Markdown
                </button>
              </div>
            </div>
            <button 
              onClick={handleCreateNew}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition-all shadow-md hover:shadow-lg"
            >
              <PlusIcon /> New Question
            </button>
          </div>
        </header>

        {view === AppView.LIST && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-1 space-y-6">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Categories</h3>
                  <button 
                    onClick={() => setView(AppView.MANAGE_CATEGORIES)}
                    className="p-1 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-indigo-50 transition-colors"
                    title="Manage Categories"
                  >
                    <PencilIcon />
                  </button>
                </div>
                <div className="space-y-1">
                  <button
                    onClick={() => setSelectedCategory('All')}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedCategory === 'All' 
                        ? 'bg-indigo-50 text-indigo-700 font-medium' 
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    All
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        selectedCategory === cat 
                          ? 'bg-indigo-50 text-indigo-700 font-medium' 
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Filters</h3>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Created Date</label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input 
                      type="date" 
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="md:col-span-3 space-y-4">
              <div className="relative">
                <SearchIcon className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Search questions or companies..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              {filteredQuestions.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {filteredQuestions.map(q => (
                    <div 
                      key={q.id}
                      onClick={() => handleViewDetail(q)}
                      className="group bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
                    >
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${getCategoryColor(q.category)?.split(' ')[1] || 'bg-slate-200'}`} />
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${getCategoryColor(q.category)}`}>
                          {q.category}
                        </span>
                        <div className="flex items-center gap-1">
                          {q.isAiGenerated && <SparklesIcon className="w-4 h-4 text-indigo-500" />}
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleEdit(q); }}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <PencilIcon />
                          </button>
                          <button 
                            onClick={(e) => handleDelete(q.id, e)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                      <h3 className="text-lg font-semibold text-slate-800 line-clamp-2 mb-2 group-hover:text-indigo-600 transition-colors">
                        {q.text}
                      </h3>
                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        {q.companyTag && (
                          <span className="flex items-center gap-1">
                            <BuildingIcon className="w-3 h-3" /> {q.companyTag}
                          </span>
                        )}
                        <span>Updated {formatDate(q.updatedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
                  <p className="text-slate-400">No questions found. Try a different filter or create one!</p>
                </div>
              )}
            </div>
          </div>
        )}

        {view === AppView.MANAGE_CATEGORIES && (
          <div className="max-w-2xl mx-auto">
            <button onClick={() => setView(AppView.LIST)} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors mb-6">
              <ChevronLeftIcon /> Back to list
            </button>
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Manage Categories</h2>
                <p className="text-sm text-slate-500 mt-1">Add, rename or remove categories. Note: Renaming will update all associated questions.</p>
              </div>

              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="New category name..."
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <button 
                  onClick={handleAddCategory}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-all font-bold"
                >
                  Add
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {categories.map(cat => (
                  <div key={cat} className="py-4 flex items-center justify-between group">
                    {editingCat?.old === cat ? (
                      <div className="flex-1 flex gap-2">
                        <input 
                          autoFocus
                          type="text" 
                          value={editingCat.current}
                          onChange={(e) => setEditingCat({...editingCat, current: e.target.value})}
                          onKeyDown={(e) => e.key === 'Enter' && handleRenameCat(editingCat.old, editingCat.current)}
                          className="flex-1 px-3 py-1 border border-indigo-500 rounded-lg outline-none text-sm"
                        />
                        <button onClick={() => handleRenameCat(editingCat.old, editingCat.current)} className="text-xs font-bold text-indigo-600">Save</button>
                        <button onClick={() => setEditingCat(null)} className="text-xs font-bold text-slate-400">Cancel</button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${getCategoryColor(cat).split(' ')[1]}`} />
                          <span className="font-medium text-slate-700">{cat}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => setEditingCat({ old: cat, current: cat })}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-md transition-colors"
                          >
                            <PencilIcon />
                          </button>
                          <button 
                            onClick={() => handleRemoveCat(cat)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-md transition-colors"
                          >
                            <TrashIcon />
                          </button>
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
          <div className="max-w-4xl mx-auto space-y-6">
            <button onClick={() => setView(AppView.LIST)} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors mb-4">
              <ChevronLeftIcon /> Back to list
            </button>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Question Text</label>
                    <textarea 
                      value={formData.text}
                      onChange={(e) => setFormData({...formData, text: e.target.value})}
                      placeholder="Enter the interview question..."
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl min-h-[100px] focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                      <select 
                        value={formData.category}
                        onChange={(e) => setFormData({...formData, category: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Company (Optional)</label>
                      <input 
                        type="text"
                        value={formData.companyTag}
                        onChange={(e) => setFormData({...formData, companyTag: e.target.value})}
                        placeholder="e.g. Google, TikTok"
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-medium text-slate-700">Answer</label>
                      <button 
                        onClick={handleGenerateAnswer}
                        disabled={isGenerating}
                        className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                      >
                        {isGenerating ? 'Generating...' : <><SparklesIcon className="w-4 h-4" /> AI Generate</>}
                      </button>
                    </div>
                    <textarea 
                      value={formData.answer}
                      onChange={(e) => setFormData({...formData, answer: e.target.value})}
                      placeholder="Write your answer or use AI to help..."
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl min-h-[300px] focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <button onClick={() => setView(AppView.LIST)} className="px-6 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-md transition-all">
                      {isCategorizing ? 'Saving...' : 'Save Question'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-1 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col h-[600px]">
                <div className="p-4 border-b border-slate-200 bg-white rounded-t-2xl flex items-center gap-2">
                  <SparklesIcon className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-semibold text-slate-800">AI Assistant</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {chatHistory.length === 0 && (
                    <div className="text-center py-10">
                      <p className="text-xs text-slate-400 px-6">Ask for help refining your answer, generating examples, or explaining concepts.</p>
                    </div>
                  )}
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                        msg.role === 'user' 
                          ? 'bg-indigo-600 text-white rounded-tr-none' 
                          : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-slate-200 px-3 py-2 rounded-2xl rounded-tl-none shadow-sm flex gap-1">
                        <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" />
                        <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce delay-75" />
                        <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce delay-150" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="p-4 bg-white border-t border-slate-200 rounded-b-2xl">
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                      placeholder="How can I improve this?"
                      className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <button 
                      onClick={handleChatSend}
                      disabled={isChatLoading || !chatInput.trim()}
                      className="bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center"
                    >
                      <PlusIcon />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === AppView.DETAIL && currentQuestion && (
          <div className="max-w-3xl mx-auto">
            <button onClick={() => setView(AppView.LIST)} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors mb-6">
              <ChevronLeftIcon /> Back to list
            </button>
            
            <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex justify-between items-start">
                <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest border ${getCategoryColor(currentQuestion.category)}`}>
                  {currentQuestion.category}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(currentQuestion)} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
                    <PencilIcon />
                  </button>
                  <button onClick={() => handleDelete(currentQuestion.id)} className="p-2 text-slate-400 hover:text-red-600 transition-colors">
                    <TrashIcon />
                  </button>
                </div>
              </div>

              <h2 className="text-3xl font-bold text-slate-900 leading-tight">
                {currentQuestion.text}
              </h2>

              <div className="flex items-center gap-4 text-sm text-slate-500 pb-6 border-b border-slate-100">
                {currentQuestion.companyTag && (
                  <span className="flex items-center gap-1.5 bg-slate-100 px-3 py-1 rounded-full">
                    <BuildingIcon /> {currentQuestion.companyTag}
                  </span>
                )}
                <span>Updated on {formatDate(currentQuestion.updatedAt)}</span>
                {currentQuestion.isAiGenerated && (
                  <span className="flex items-center gap-1 text-indigo-600 font-medium italic">
                    <SparklesIcon className="w-4 h-4" /> AI Generated
                  </span>
                )}
              </div>

              <div className="prose prose-slate max-w-none">
                <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">Sample Answer</h4>
                <div className="whitespace-pre-wrap text-slate-700 leading-relaxed bg-slate-50 p-6 rounded-2xl border border-slate-100 font-sans">
                  {currentQuestion.answer || "No answer provided yet."}
                </div>
              </div>

              {currentQuestion.sources && currentQuestion.sources.length > 0 && (
                <SourceList sources={currentQuestion.sources} />
              )}
            </article>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
