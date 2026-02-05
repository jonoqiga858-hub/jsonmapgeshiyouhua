import React, { useState, useRef } from 'react';
import { Upload, FileJson, ArrowRight, Download, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from './components/Button';
import { JsonViewer } from './components/JsonViewer';
import { processJsonKnowledgeBase } from './services/geminiService';
import { KnowledgeItem, ProcessingStatus, ProcessProgress } from './types';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [originalData, setOriginalData] = useState<any | null>(null); // Changed to any to support arbitrary root
  const [processedData, setProcessedData] = useState<any | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessProgress>({ total: 0, current: 0, percentage: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'application/json' && !selectedFile.name.endsWith('.json')) {
        setError("请上传有效的 JSON 文件。");
        return;
      }
      setFile(selectedFile);
      parseFile(selectedFile);
    }
  };

  const parseFile = (fileToParse: File) => {
    setStatus('parsing');
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const json = JSON.parse(text);
        
        // We no longer force an array wrap here because the new service handles any structure
        setOriginalData(json);
        setProcessedData(null);
        setStatus('idle');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(`解析 JSON 文件失败。请检查文件语法格式是否正确。\n错误详情: ${errorMessage}`);
        setStatus('error');
      }
    };
    reader.readAsText(fileToParse);
  };

  const handleProcess = async () => {
    if (!originalData) return;

    setStatus('processing');
    setError(null);
    // Reset progress initially
    setProgress({ total: 0, current: 0, percentage: 0 });

    try {
      const result = await processJsonKnowledgeBase(originalData, (current, total) => {
        setProgress({
          current,
          total,
          percentage: total > 0 ? Math.round((current / total) * 100) : 0
        });
      });
      setProcessedData(result);
      setStatus('complete');
    } catch (err) {
      console.error(err);
      setError("AI 处理过程中发生错误。可能是因为 API Key 无效、网络问题或文件内容过于复杂。");
      setStatus('error');
    }
  };

  const handleDownload = () => {
    if (!processedData) return;
    
    const jsonString = JSON.stringify(processedData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `optimized_${file?.name || 'knowledge_base.json'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setFile(null);
    setOriginalData(null);
    setProcessedData(null);
    setStatus('idle');
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <RefreshCw className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-800">最优化 JSON 知识库标准化工具</h1>
          </div>
          <div className="text-sm text-slate-500 hidden sm:block">
            由 Gemini 1.5 Flash 驱动
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold">错误</h3>
              <p className="text-sm whitespace-pre-wrap">{error}</p>
            </div>
          </div>
        )}

        {/* State: No File Selected */}
        {!originalData && (
          <div className="max-w-xl mx-auto mt-12">
            <div 
              className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center bg-white hover:border-indigo-500 transition-colors cursor-pointer shadow-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8 text-indigo-600" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900 mb-2">上传知识库文件</h2>
              <p className="text-slate-500 mb-6">请选择包含最优化算法知识点的 JSON 文件。</p>
              <Button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                选择文件
              </Button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".json" 
                className="hidden" 
              />
            </div>
            
            <div className="mt-8 bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                自动化处理任务
              </h3>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex gap-2">
                  <span className="font-mono bg-slate-100 px-1 rounded text-xs py-0.5">math</span>
                  数学符号补全：将变量（如 x, A, b）包裹在 LaTeX $ 符号中。
                </li>
                <li className="flex gap-2">
                  <span className="font-mono bg-slate-100 px-1 rounded text-xs py-0.5">merge</span>
                  公式合并：合并相邻的数学块（如 $min$ $f(x)$ → $min f(x)$）。
                </li>
                <li className="flex gap-2">
                  <span className="font-mono bg-slate-100 px-1 rounded text-xs py-0.5">escape</span>
                  转义处理：应用双反斜杠以符合 JSON 格式（如 \\min）。
                </li>
                <li className="flex gap-2">
                  <span className="font-mono bg-slate-100 px-1 rounded text-xs py-0.5">recursive</span>
                  深度遍历：自动查找任意层级的 name 和 description 字段。
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* State: File Loaded */}
        {originalData && (
          <div className="h-[calc(100vh-12rem)] flex flex-col">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-slate-100 p-2 rounded flex items-center gap-2 border border-slate-200">
                  <FileJson className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-700">{file?.name}</span>
                </div>
                <button onClick={handleReset} className="text-sm text-slate-500 hover:text-red-600 underline">
                  更换文件
                </button>
              </div>

              <div className="flex items-center gap-3">
                {status === 'processing' && (
                  <div className="flex flex-col items-end mr-2">
                    <span className="text-xs text-indigo-600 font-semibold">{progress.percentage}% 完成</span>
                    <div className="w-32 h-1.5 bg-slate-200 rounded-full mt-1 overflow-hidden">
                      <div 
                        className="h-full bg-indigo-600 transition-all duration-300 ease-out"
                        style={{ width: `${progress.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                )}
                
                {status !== 'complete' && status !== 'processing' && (
                  <Button onClick={handleProcess} variant="primary">
                    开始 AI 格式化 <ArrowRight className="w-4 h-4" />
                  </Button>
                )}

                {status === 'complete' && (
                  <Button onClick={handleDownload} variant="primary" className="bg-green-600 hover:bg-green-700 focus:ring-green-500">
                    <Download className="w-4 h-4" /> 下载结果
                  </Button>
                )}
              </div>
            </div>

            {/* Split View */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
              {/* Original */}
              <div className="min-h-0 flex flex-col">
                <JsonViewer 
                  data={originalData} 
                  title="原始数据" 
                  className="h-full"
                />
              </div>

              {/* Processed */}
              <div className="min-h-0 flex flex-col relative">
                {processedData ? (
                   <JsonViewer 
                   data={processedData} 
                   title="格式化结果 (AI)" 
                   className="h-full"
                 />
                ) : (
                  <div className="h-full bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400">
                     {status === 'processing' ? (
                       <div className="text-center">
                         <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
                         <p className="text-slate-600 font-medium">正在深度分析并标准化知识库...</p>
                         <p className="text-sm text-slate-400 mt-2">
                           已识别 {progress.total} 个待处理条目<br/>
                           正在处理第 {progress.current} 到 {Math.min(progress.current + 10, progress.total)} 条
                         </p>
                       </div>
                     ) : (
                        <>
                          <ArrowRight className="w-12 h-12 mb-2 opacity-20" />
                          <p>处理后的结果将显示在这里</p>
                        </>
                     )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;