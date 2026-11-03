import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in section ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 rounded-2xl bg-red-950/40 border border-red-500/40 text-red-200 flex flex-col items-center justify-center gap-3 my-4 mx-auto max-w-xl text-center shadow-xl">
          <div className="p-3 rounded-full bg-red-500/20 text-red-400">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h3 className="text-base sm:text-lg font-bold">
            {this.props.fallbackTitle || 'เกิดข้อผิดพลาดในการแสดงผลส่วนนี้ (Component Error)'}
          </h3>
          <p className="text-xs sm:text-sm text-red-300/80 max-w-md">
            {this.state.error?.message || 'Unexpected rendering error occurred in this section.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs sm:text-sm transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>ลองใหม่อีกครั้ง (Retry)</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
