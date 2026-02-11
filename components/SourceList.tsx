import React from 'react';
import { GroundingChunk } from '../types';
import { LinkIcon } from './Icons';

interface SourceListProps {
  sources: GroundingChunk[];
}

export const SourceList: React.FC<SourceListProps> = ({ sources }) => {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-slate-200">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Sources</h4>
      <div className="flex flex-wrap gap-2">
        {sources.map((source, index) => (
          <a
            key={index}
            href={source.web?.uri}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-full text-xs transition-colors border border-slate-200 hover:border-indigo-200"
          >
            <LinkIcon />
            <span className="truncate max-w-[150px]">{source.web?.title || 'Unknown Source'}</span>
          </a>
        ))}
      </div>
    </div>
  );
};