'use client';

import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    handleReset = () => {
        this.setState({ hasError: false, error: undefined });
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-red-950 flex items-center justify-center p-8">
                    <Card className="max-w-md bg-slate-800/70 border-red-500/30 backdrop-blur-sm">
                        <CardHeader>
                            <CardTitle className="text-2xl text-red-400 flex items-center gap-2">
                                ⚠️ 오류가 발생했습니다
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-slate-300">
                                예기치 않은 오류가 발생했습니다. 페이지를 새로고침하거나 홈으로 돌아가 주세요.
                            </p>

                            {this.state.error && (
                                <pre className="text-xs text-red-300 bg-slate-900/50 p-3 rounded-lg overflow-auto max-h-32">
                                    {this.state.error.message}
                                </pre>
                            )}

                            <div className="flex gap-3">
                                <Button
                                    onClick={this.handleReset}
                                    className="bg-red-600 hover:bg-red-500"
                                >
                                    🔄 새로고침
                                </Button>
                                <Button
                                    onClick={() => window.location.href = '/'}
                                    variant="outline"
                                    className="border-slate-600"
                                >
                                    🏠 홈으로
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            );
        }

        return this.props.children;
    }
}
