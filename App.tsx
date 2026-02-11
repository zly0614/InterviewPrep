import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { AppView, Question, QuestionDraft, GroundingChunk, CATEGORIES, CATEGORY_COLORS } from './types';
import { getQuestions, saveQuestion, deleteQuestion, importQuestions } from './services/storageService';
import { generateInterviewAnswer, autoCategorize, createAiChatSession } from './services/geminiService';
import { PlusIcon, ChevronLeftIcon, SparklesIcon, TrashIcon, PencilIcon, DownloadIcon, UploadIcon, SearchIcon, CalendarIcon, BuildingIcon, ExcelIcon, MarkdownIcon } from './components/Icons';
import { SourceList } from './components/SourceList';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.LIST);
  const [questions, setQuestions] = useState<Question[]>([]);
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

  // AI 聊天状态
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatSessionRef = useRef<any>(null);

  // 初始化加载
  useEffect(() => {
    const data = getQuestions();
    setQuestions(data);
  }, []);

  // 聊天自动滚动
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const refreshQuestions = () => {
    const loaded = getQuestions();
    setQuestions(loaded);
  };

  const filteredQuestions = useMemo(() => {
    return questions.filter(q => {
      const matchesCategory = selectedCategory === 'All' || q.category === selectedCategory;
      const query = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || 
        q.text.toLowerCase().includes(query) || 
        q.answer.toLowerCase().includes(query) || 
        (q.companyTag && q.companyTag.toLowerCase().includes(query));
      
      let matchesDate = true;
      if (dateFilter) {
        const filterTime = new Date(dateFilter).setHours(0, 0, 0, 0);
        const questionTime = new Date(q.createdAt).setHours(0, 0, 0, 0);
        matchesDate = questionTime === filterTime;
      }
      return matchesCategory && matchesSearch && matchesDate;
    });
  }, [questions, selectedCategory, searchQuery, dateFilter]);

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
      sources: q.sources,
    });
    setChatHistory([]);
    chatSessionRef.current = null;
    setView(AppView.FORM);
  };

  const handleViewDetail = (q: Question) => {
    setCurrentQuestion(q);
    setView(AppView.DETAIL);
  };

  const handleDelete = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (confirm('确定要删除这道题吗？')) {
      deleteQuestion(id);
      refreshQuestions();
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

    saveQuestion(newQuestion);
    refreshQuestions();
    setView(AppView.LIST);
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
      const modelText = result.text;
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

  // --- 导出逻辑 ---
  const downloadFile = (content: string, fileName: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getISODate = () => new Date().toISOString().slice(0, 10);

  const handleExportJSON = () => {
    const data = JSON.stringify(questions, null, 2);
    downloadFile(data, `面试题备份_${getISODate()}.json`, 'application/json');
  };

  const handleExportExcel = () => {
    if (questions.length === 0) return alert('没有题目可以导出');
    const exportData = questions.map(q => ({
      '题目': q.text,
      '答案': q.answer,
      '分类': q.category,
      '公司标签': q.companyTag,
      'AI生成': q.isAiGenerated ? '是' : '否',
      '创建时间': new Date(q.createdAt).toLocaleString(),
      '来源': q.sources?.map(s => s.web?.uri).join('\n') || ''
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '题库');
    XLSX.writeFile(workbook, `面试题集_${getISODate()}.xlsx`);
  };

  const generateMarkdown = (qs: Question[]) => {
    let markdown = `# 面试题库导出 - ${new Date().toLocaleDateString()}\n\n`;
    qs.forEach((q, i) => {
      markdown += `## ${i + 1}. ${q.text}\n\n`;
      markdown += `> **分类**: ${q.category} | **公司**: ${q.companyTag || '无'} | **AI生成**: ${q.isAiGenerated ? '是' : '否'}\n\n`;
      markdown += `### 答案\n\n${q.answer || '_暂无内容_'}\n\n`;
      if (q.sources && q.sources.length > 0) {
        markdown += `### 参考链接\n\n`;
        q.sources.forEach(s => markdown += `- [${s.web?.title || s.web?.uri}](${s.web?.uri})\n`);
        markdown += `\n`;
      }
      markdown += `---\n\n`;
    });
    return markdown;
  };

  const handleExportMarkdown = () => {
    if (questions.length === 0) return alert('没有题目可以导出');
    const md = generateMarkdown(questions);
    downloadFile(md, `面试题全集_${getISODate()}.md`, 'text/markdown');
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        const parsed = JSON.parse(json);
        importQuestions(parsed);
        refreshQuestions();
        alert('导入成功！');
      } catch (err) {
        alert('导入失败，请确保文件格式正确');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const formatTimestamp = (ts: number) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  // --- 视图渲染 ---
  const renderList = () => (
    <div className="pb-24">
      <header className="bg-white sticky top-0 z-20 shadow-sm">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between border-b border-slate-50">
          <h1 className="text-xl font-bold text-slate-800">面试<span className="text-indigo-600">小助手</span></h1>
          <div className="flex items-center gap-1">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
            <button onClick={handleImportClick} title="从备份文件导入" className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-full transition-colors"><UploadIcon /></button>
            <div className="w-px h-4 bg-slate-200 mx-1"></div>
            <button onClick={handleExportExcel} title="导出为 Excel" className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-full transition-colors"><ExcelIcon /></button>
            <button onClick={handleExportMarkdown} title="导出为 Markdown" className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-full transition-colors"><MarkdownIcon /></button>
            <button onClick={handleExportJSON} title="导出 JSON 备份" className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-full transition-colors"><DownloadIcon /></button>
          </div>
        </div>

        <div className="px-4 py-2 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1 group">
              <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text"
                placeholder="搜索题目、公司或标签..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-100 border-transparent border focus:bg-white focus:border-indigo-200 focus:ring-4 focus:ring-indigo-50 rounded-xl outline-none transition-all text-sm"
              />
            </div>
            <div className="relative group flex-shrink-0">
              <input 
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-10 h-10 p-2 bg-slate-100 border-transparent border focus:bg-white focus:border-indigo-200 rounded-xl outline-none transition-all text-transparent relative z-10 cursor-pointer"
              />
              <div className={`absolute inset-0 flex items-center justify-center pointer-events-none rounded-xl ${dateFilter ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 bg-slate-100'}`}>
                <CalendarIcon className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex overflow-x-auto no-scrollbar gap-2 px-4 py-3 bg-white border-t border-slate-50">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                selectedCategory === cat ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-500 border-slate-200'
              }`}
            >
              {cat === 'All' ? '全部' : cat}
            </button>
          ))}
        </div>
      </header>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {filteredQuestions.length === 0 ? (
          <div className="text-center py-20 text-slate-400 px-6">
            <div className="mb-4 flex justify-center"><SparklesIcon className="w-12 h-12 text-slate-200" /></div>
            <p className="text-lg font-bold">列表空空如也</p>
            <p className="text-sm mt-1">记录您的第一道面试题吧</p>
          </div>
        ) : (
          filteredQuestions.map(q => (
            <div key={q.id} onClick={() => handleViewDetail(q)} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 group active:scale-[0.98] transition-all cursor-pointer hover:shadow-lg relative">
              <div className="flex justify-between items-start mb-3">
                <div className="flex flex-wrap gap-2 pr-4">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider ${CATEGORY_COLORS[q.category || 'Other']}`}>{q.category || 'Other'}</span>
                  {q.companyTag && <span className="bg-slate-50 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-md border border-slate-200 flex items-center gap-1"><BuildingIcon className="w-3 h-3" /> {q.companyTag}</span>}
                </div>
                <div className="flex gap-2">
                   <button 
                    onClick={(e) => { e.stopPropagation(); handleEdit(q); }} 
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                    title="编辑"
                   >
                     <PencilIcon />
                   </button>
                   <button 
                    onClick={(e) => handleDelete(q.id, e)} 
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                    title="删除"
                   >
                     <TrashIcon />
                   </button>
                </div>
              </div>
              <h3 className="font-bold text-slate-800 line-clamp-2 leading-snug mb-2 pr-12">{q.text}</h3>
              <p className="text-sm text-slate-500 line-clamp-2">{q.answer || '点击记录答案...'}</p>
            </div>
          ))
        )}
      </div>

      <button onClick={handleCreateNew} className="fixed bottom-6 right-6 bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-2xl shadow-xl z-30 transition-transform active:scale-90"><PlusIcon /></button>
    </div>
  );

  const renderDetail = () => {
    if (!currentQuestion) return null;
    return (
      <div className="bg-white min-h-screen flex flex-col">
        <header className="sticky top-0 bg-white/95 border-b border-slate-100 z-10 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setView(AppView.LIST)} className="p-2 -ml-2 text-slate-600"><ChevronLeftIcon /></button>
          <div className="flex gap-1">
            <button onClick={() => handleEdit(currentQuestion)} className="p-2 text-slate-400 hover:text-indigo-600"><PencilIcon /></button>
            <button onClick={(e) => handleDelete(currentQuestion.id, e)} className="p-2 text-slate-400 hover:text-red-600"><TrashIcon /></button>
          </div>
        </header>
        <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
          <div className="flex flex-wrap gap-2 items-center mb-6">
            <div className={`text-xs font-bold px-3 py-1 rounded-full border ${CATEGORY_COLORS[currentQuestion.category || 'Other']}`}>{currentQuestion.category || 'Other'}</div>
            {currentQuestion.companyTag && <div className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-600"><BuildingIcon className="w-3.5 h-3.5" /> {currentQuestion.companyTag}</div>}
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-8 leading-tight">{currentQuestion.text}</h1>
          <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100 mb-8">
             <div className="prose prose-slate prose-sm max-w-none whitespace-pre-wrap text-slate-700 leading-relaxed font-medium">{currentQuestion.answer || '无内容'}</div>
             <SourceList sources={currentQuestion.sources || []} />
          </div>
          <div className="text-[10px] text-slate-300 font-bold uppercase tracking-widest text-center mt-auto py-8">
            最后修改: {new Date(currentQuestion.updatedAt).toLocaleString()}
          </div>
        </main>
      </div>
    );
  };

  const renderForm = () => (
    <div className="bg-slate-50 min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <button onClick={() => setView(currentQuestion ? AppView.DETAIL : AppView.LIST)} className="p-2 -ml-2 text-slate-600"><ChevronLeftIcon /></button>
        <span className="font-bold">{currentQuestion ? '修改内容' : '记录新面试题'}</span>
        <button onClick={handleSave} disabled={isCategorizing} className={`text-indigo-600 font-black text-sm px-4 py-2 ${isCategorizing ? 'opacity-50' : ''}`}>
          {isCategorizing ? '分类中...' : '保存'}
        </button>
      </header>
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full flex flex-col lg:flex-row gap-8">
        {/* 左侧编辑器 */}
        <div className="flex-1 space-y-8">
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">面试题目</label>
            <textarea value={formData.text} onChange={(e) => setFormData({ ...formData, text: e.target.value })} placeholder="请输入面试题目..." className="w-full p-6 rounded-3xl border-slate-200 border-2 focus:border-indigo-500 outline-none transition-all text-xl font-bold" rows={3} />
          </div>
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">公司 / 备注</label>
                <div className="relative">
                  <BuildingIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input type="text" placeholder="例如：蚂蚁金服一面" value={formData.companyTag} onChange={(e) => setFormData({ ...formData, companyTag: e.target.value })} className="w-full pl-9 pr-4 py-2 text-xs font-bold bg-white border border-slate-200 rounded-xl outline-none" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">分类</label>
                <div className="flex gap-2">
                  <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="text-xs font-bold bg-white border border-slate-200 rounded-full px-4 py-2 outline-none h-10">
                    {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button onClick={handleGenerateAnswer} disabled={isGenerating || !formData.text.trim()} className={`bg-indigo-600 text-white text-xs font-black px-5 py-2.5 rounded-full flex items-center gap-2 shadow-lg h-10 transition-all ${isGenerating ? 'opacity-50 scale-95' : 'hover:scale-105 active:scale-95'}`}>
                    <SparklesIcon className="w-4 h-4" /> {isGenerating ? 'AI生成中...' : 'AI 一键生成'}
                  </button>
                </div>
              </div>
            </div>
            <div className="relative group">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">详细答案</label>
              <textarea value={formData.answer} onChange={(e) => setFormData({ ...formData, answer: e.target.value })} placeholder="手写或通过右侧 AI 助手协助完善答案..." className="w-full p-6 rounded-3xl border-slate-200 border-2 focus:border-indigo-500 outline-none h-96 text-slate-700 leading-relaxed font-medium" />
              {isGenerating && <div className="absolute inset-0 bg-white/80 backdrop-blur-md rounded-3xl flex items-center justify-center z-10"><div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div></div>}
            </div>
            {formData.sources && formData.sources.length > 0 && <SourceList sources={formData.sources} />}
          </div>
        </div>

        {/* 右侧 AI 助手聊天 */}
        <div className="w-full lg:w-80 flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm h-[600px] overflow-hidden">
          <div className="p-4 bg-indigo-600 text-white flex items-center gap-2">
            <SparklesIcon className="w-4 h-4" />
            <span className="font-bold text-sm">AI 助手 (支持联网)</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
            {chatHistory.length === 0 && (
              <div className="text-center py-8 px-4">
                <p className="text-xs text-slate-400 font-bold leading-relaxed">针对这道题，你可以问我：<br/>“如何优化这个回答？”<br/>“这个技术的最新进展是什么？”</p>
              </div>
            )}
            {chatHistory.map((chat, idx) => (
              <div key={idx} className={`flex flex-col ${chat.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[90%] p-3 rounded-2xl text-xs font-medium leading-relaxed ${
                  chat.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}>
                  {chat.text}
                </div>
                {chat.role === 'model' && (
                  <button 
                    onClick={() => setFormData(prev => ({ ...prev, answer: chat.text }))}
                    className="mt-1 text-[10px] font-bold text-indigo-600 hover:underline"
                  >
                    采用此答案
                  </button>
                )}
              </div>
            ))}
            {isChatLoading && (
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 animate-pulse">
                <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
                AI 正在搜索并思考...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t border-slate-100 flex gap-2">
            <input 
              type="text" 
              value={chatInput} 
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
              placeholder="向 AI 提问..."
              className="flex-1 px-3 py-2 bg-slate-100 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all font-medium"
            />
            <button 
              onClick={handleChatSend} 
              disabled={isChatLoading || !chatInput.trim()}
              className="p-2 bg-indigo-600 text-white rounded-xl active:scale-90 disabled:opacity-50 transition-all"
            >
              <PlusIcon />
            </button>
          </div>
        </div>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 selection:bg-indigo-100">
      <style>{`.no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
      {view === AppView.LIST && renderList()}
      {view === AppView.DETAIL && renderDetail()}
      {view === AppView.FORM && renderForm()}
    </div>
  );
};

export default App;