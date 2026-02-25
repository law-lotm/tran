import * as React from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-3xl max-w-md w-full shadow-2xl">
            <div className="bg-red-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertOctagon className="text-red-400" size={32} />
            </div>
            <h1 className="text-xl font-bold text-gray-100 mb-2">Something went wrong</h1>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              The application encountered an unexpected error. This might be due to a temporary glitch or a connection issue.
            </p>
            <div className="bg-black/30 p-3 rounded-lg mb-6 text-left overflow-hidden">
                <p className="text-[10px] font-mono text-red-400/80 break-all">
                    {this.state.error?.message}
                </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-xl font-bold transition-all"
            >
              <RefreshCw size={18} />
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
