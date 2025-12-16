'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Cpu, GitMerge, Layers, Plus, FolderOpen, Trash2, Edit3, Calendar } from 'lucide-react';
import { useAppStore, Project } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';

export default function Home() {
    const router = useRouter();
    const { projects, createProject, loadProject, deleteProject, renameProject } = useAppStore();
    
    const [mounted, setMounted] = useState(false);
    const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [editingProject, setEditingProject] = useState<Project | null>(null);
    const [editName, setEditName] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    // Hydration 문제 방지
    useEffect(() => {
        setMounted(true);
    }, []);

    const handleCreateProject = () => {
        if (!newProjectName.trim()) return;
        createProject(newProjectName.trim());
        setNewProjectName('');
        setShowNewProjectDialog(false);
        router.push('/flow');
    };

    const handleOpenProject = (project: Project) => {
        loadProject(project.id);
        router.push('/flow');
    };

    const handleRenameProject = () => {
        if (!editingProject || !editName.trim()) return;
        renameProject(editingProject.id, editName.trim());
        setEditingProject(null);
        setEditName('');
    };

    const handleDeleteProject = (id: string) => {
        deleteProject(id);
        setDeleteConfirm(null);
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return '오늘';
        if (diffDays === 1) return '어제';
        if (diffDays < 7) return `${diffDays}일 전`;
        return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    };

    const sortedProjects = mounted 
        ? [...projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        : [];

    return (
        <div className="min-h-screen pro-canvas relative">
            {/* Pro Background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <Image
                    src="/images/bg-main.png"
                    alt="Pro Background"
                    fill
                    className="object-cover opacity-80"
                    priority
                />
                <div className="absolute inset-0 bg-white/30" />
                <div className="absolute inset-0 bg-[radial-gradient(#000000_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.03]" />
            </div>

            {/* Content */}
            <div className="max-w-5xl mx-auto px-6 py-16 relative z-10">
                {/* Hero - 간소화 */}
                <div className="text-center mb-12">
                    <div className="inline-block mb-4 px-4 py-2 bg-[#F5F6F8] rounded-full border border-[#E2E4E9]">
                        <span className="text-[#71717A] text-sm font-medium">
                            Professional Process Design Tool
                        </span>
                    </div>

                    <h1 className="text-4xl md:text-5xl font-semibold text-[#18181B] mb-4 leading-tight">
                        Agent Shift
                    </h1>

                    <p className="text-lg text-[#71717A] mb-6 max-w-xl mx-auto leading-relaxed">
                        업무 프로세스를 AI Agent로 전환하고, 변화 관리 전략을 수립하세요.
                    </p>
                </div>

                {/* 내 프로젝트 섹션 */}
                <div className="mb-12">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-semibold text-[#18181B]">내 프로젝트</h2>
                            {mounted && projects.length > 0 && (
                                <span className="text-sm text-[#71717A] bg-[#F5F6F8] px-2 py-0.5 rounded-full">
                                    {projects.length}개
                                </span>
                            )}
                        </div>
                        <Button
                            onClick={() => setShowNewProjectDialog(true)}
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            새 프로젝트
                        </Button>
                    </div>

                    {/* 프로젝트 그리드 */}
                    {mounted && sortedProjects.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {sortedProjects.map((project) => (
                                <div
                                    key={project.id}
                                    className="group p-5 rounded-2xl bg-white/70 backdrop-blur-xl border border-white/50 hover:border-blue-300 hover:bg-white/90 transition-all cursor-pointer shadow-lg hover:shadow-xl"
                                    onClick={() => handleOpenProject(project)}
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                                            <FolderOpen className="w-5 h-5" />
                                        </div>
                                        <div 
                                            className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <button
                                                onClick={() => {
                                                    setEditingProject(project);
                                                    setEditName(project.name);
                                                }}
                                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                                                title="이름 변경"
                                            >
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setDeleteConfirm(project.id)}
                                                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"
                                                title="삭제"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <h3 className="font-semibold text-[#18181B] mb-1 truncate">
                                        {project.name}
                                    </h3>
                                    
                                    <div className="flex items-center gap-2 text-xs text-[#71717A]">
                                        <Calendar className="w-3 h-3" />
                                        <span>{formatDate(project.updatedAt)}</span>
                                    </div>
                                    
                                    {/* 프로젝트 통계 */}
                                    <div className="flex gap-2 mt-3">
                                        {project.asIsNodes.length > 0 && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                                                As-Is {project.asIsNodes.length}
                                            </span>
                                        )}
                                        {project.toBeNodes.length > 0 && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                                                To-Be {project.toBeNodes.length}
                                            </span>
                                        )}
                                        {project.strategy && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                                                전략 ✓
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                            
                            {/* 새 프로젝트 추가 카드 */}
                            <div
                                onClick={() => setShowNewProjectDialog(true)}
                                className="p-5 rounded-2xl border-2 border-dashed border-gray-200 hover:border-blue-300 bg-white/30 hover:bg-white/50 transition-all cursor-pointer flex flex-col items-center justify-center min-h-[160px] group"
                            >
                                <div className="w-12 h-12 rounded-xl bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center mb-3 transition-colors">
                                    <Plus className="w-6 h-6 text-gray-400 group-hover:text-blue-600" />
                                </div>
                                <span className="text-sm text-gray-500 group-hover:text-blue-600 font-medium">
                                    새 프로젝트 만들기
                                </span>
                            </div>
                        </div>
                    ) : mounted ? (
                        /* 빈 상태 UI */
                        <div className="text-center py-16 px-8 rounded-2xl bg-white/50 backdrop-blur-xl border border-white/50">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                                <FolderOpen className="w-8 h-8 text-blue-600" />
                            </div>
                            <h3 className="text-lg font-semibold text-[#18181B] mb-2">
                                아직 프로젝트가 없습니다
                            </h3>
                            <p className="text-[#71717A] mb-6 max-w-sm mx-auto">
                                새 프로젝트를 만들어 업무 프로세스 분석을 시작하세요.
                            </p>
                            <Button
                                onClick={() => setShowNewProjectDialog(true)}
                                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                첫 프로젝트 만들기
                            </Button>
                        </div>
                    ) : null}
                </div>

                {/* Features - 간소화 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
                    {[
                        {
                            icon: <GitMerge className="w-5 h-5 text-[#6366F1]" />,
                            title: 'As-Is 분석',
                            desc: '현재 업무 프로세스 시각화',
                        },
                        {
                            icon: <Cpu className="w-5 h-5 text-[#3B82F6]" />,
                            title: 'To-Be 설계',
                            desc: 'AI Agent 자동화 시나리오',
                        },
                        {
                            icon: <Layers className="w-5 h-5 text-[#10B981]" />,
                            title: '변화 전략',
                            desc: 'Kotter, ADKAR 기반 로드맵',
                        },
                    ].map((feature, idx) => (
                        <div
                            key={idx}
                            className="p-4 rounded-xl bg-white/30 backdrop-blur-xl border border-white/50 shadow-md"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/50">
                                    {feature.icon}
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-[#18181B]">
                                        {feature.title}
                                    </h3>
                                    <p className="text-xs text-[#71717A]">{feature.desc}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="text-center text-sm text-[#A1A1AA]">
                    © 2025 Agent Shift. Built with Next.js, React Flow & AI.
                </div>
            </div>

            {/* 새 프로젝트 생성 Dialog */}
            <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>새 프로젝트 만들기</DialogTitle>
                        <DialogDescription>
                            분석할 업무 프로세스의 프로젝트 이름을 입력하세요.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <Input
                            placeholder="예: 고객 문의 처리 자동화"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowNewProjectDialog(false);
                                    setNewProjectName('');
                                }}
                            >
                                취소
                            </Button>
                            <Button
                                onClick={handleCreateProject}
                                disabled={!newProjectName.trim()}
                                className="bg-blue-600 hover:bg-blue-500 text-white"
                            >
                                만들기
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* 이름 변경 Dialog */}
            <Dialog open={!!editingProject} onOpenChange={() => setEditingProject(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>프로젝트 이름 변경</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <Input
                            placeholder="프로젝트 이름"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRenameProject()}
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setEditingProject(null)}>
                                취소
                            </Button>
                            <Button
                                onClick={handleRenameProject}
                                disabled={!editName.trim()}
                                className="bg-blue-600 hover:bg-blue-500 text-white"
                            >
                                변경
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* 삭제 확인 Dialog */}
            <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>프로젝트 삭제</DialogTitle>
                        <DialogDescription>
                            이 작업은 되돌릴 수 없습니다. 정말 삭제하시겠습니까?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                            취소
                        </Button>
                        <Button
                            onClick={() => deleteConfirm && handleDeleteProject(deleteConfirm)}
                            className="bg-red-600 hover:bg-red-500 text-white"
                        >
                            삭제
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
