import React from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  onClose: () => void;
}

export function Toast({ message, type = 'success', onClose }: ToastProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-lg shadow-2xl bg-slate-900 border border-slate-700 text-xs text-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {type === 'success' ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
      )}
      <span className="font-medium">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 p-0.5 text-slate-400 hover:text-white transition"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
