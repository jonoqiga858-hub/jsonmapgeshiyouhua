import React from 'react';

interface JsonViewerProps {
  data: any;
  title: string;
  className?: string;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ data, title, className = '' }) => {
  const jsonString = JSON.stringify(data, null, 2);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="bg-slate-800 text-slate-200 px-4 py-2 text-sm font-semibold rounded-t-lg border-b border-slate-700 flex justify-between items-center">
        <span>{title}</span>
        <span className="text-xs text-slate-400">
          {Array.isArray(data) ? `${data.length} 条数据` : '对象'}
        </span>
      </div>
      <div className="bg-slate-900 overflow-auto flex-1 rounded-b-lg p-4 border border-slate-700">
        <pre className="text-xs md:text-sm font-mono text-emerald-400 whitespace-pre-wrap break-all">
          {jsonString}
        </pre>
      </div>
    </div>
  );
};