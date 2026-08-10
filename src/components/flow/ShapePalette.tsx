'use client';

import React, { useState, useMemo } from 'react';
import {
    type FlowShape,
    ALL_SHAPES,
    SHAPE_CATEGORIES,
    type ShapeCategory,
    FLOW_SHAPES,
} from '@/lib/flow-shapes';
import { FlowShapeRenderer } from './FlowShapeRenderer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Sparkles, Check } from 'lucide-react';

interface ShapePaletteProps {
    selectedShape: FlowShape;
    onSelectShape: (shape: FlowShape) => void;
    isAuto: boolean;
    onResetAuto: () => void;
    recommendedShape: FlowShape;
}

export const ShapePalette: React.FC<ShapePaletteProps> = ({
    selectedShape,
    onSelectShape,
    isAuto,
    onResetAuto,
    recommendedShape,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState<ShapeCategory | 'all'>('all');

    const filteredShapes = useMemo(() => {
        return ALL_SHAPES.filter((shape) => {
            const matchesCategory =
                activeCategory === 'all' || shape.category === activeCategory;
            const matchesSearch =
                searchQuery.trim() === '' ||
                shape.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                shape.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                shape.recommendedFor.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    }, [activeCategory, searchQuery]);

    const recommendedDef = FLOW_SHAPES[recommendedShape] || FLOW_SHAPES.process;

    return (
        <div className="space-y-3 bg-slate-50/80 p-3 rounded-xl border border-slate-200/80">
            {/* Header: Auto Selection Info & Reset Button */}
            <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-700">도형 선택</span>
                    {isAuto ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">
                            <Sparkles className="w-3 h-3" /> 추천 자동 적용
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-800 font-medium px-2 py-0.5 rounded-full">
                            수동 지정됨
                        </span>
                    )}
                </div>
                {!isAuto && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onResetAuto}
                        className="h-6 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 flex items-center gap-1"
                        title={`유형 추천 도형(${recommendedDef.name})으로 복원`}
                    >
                        <Sparkles className="w-3 h-3" /> 유형에 맞게 자동 선택
                    </Button>
                )}
            </div>

            {/* Search Bar */}
            <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="도형 이름 또는 용도 검색..."
                    className="h-7 text-xs pl-8 bg-white border-slate-200 placeholder:text-slate-400"
                />
            </div>

            {/* Category Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
                {SHAPE_CATEGORIES.map((cat) => {
                    const isActive = activeCategory === cat.id;
                    return (
                        <button
                            key={cat.id}
                            type="button"
                            onClick={() => setActiveCategory(cat.id)}
                            className={`px-2 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap shrink-0 ${
                                isActive
                                    ? 'bg-blue-600 text-white font-medium shadow-sm'
                                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                            }`}
                        >
                            {cat.label}
                        </button>
                    );
                })}
            </div>

            {/* Shape Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                {filteredShapes.map((shapeDef) => {
                    const isSelected = selectedShape === shapeDef.id;
                    const isRecommended = recommendedShape === shapeDef.id;

                    return (
                        <button
                            key={shapeDef.id}
                            type="button"
                            onClick={() => onSelectShape(shapeDef.id)}
                            aria-label={`${shapeDef.name}: ${shapeDef.description}`}
                            className={`flex flex-col items-center justify-between p-2 rounded-lg border text-left transition-all relative ${
                                isSelected
                                    ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-400/40 shadow-sm'
                                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                        >
                            {/* Selected Checkmark */}
                            {isSelected && (
                                <div className="absolute top-1 right-1 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center text-white z-10 shadow-sm">
                                    <Check className="w-2.5 h-2.5" />
                                </div>
                            )}

                            {/* Recommendation Star */}
                            {isRecommended && !isSelected && (
                                <div className="absolute top-1 right-1 text-[9px] bg-blue-100 text-blue-700 font-semibold px-1 rounded">
                                    추천
                                </div>
                            )}

                            {/* SVG Preview */}
                            <div className="w-full h-9 flex items-center justify-center my-1">
                                <FlowShapeRenderer
                                    shape={shapeDef.id}
                                    width={48}
                                    height={28}
                                    fill={isSelected ? '#eff6ff' : '#ffffff'}
                                    stroke={isSelected ? '#2563eb' : '#64748b'}
                                    strokeWidth={1.5}
                                />
                            </div>

                            {/* Label & Description */}
                            <div className="w-full text-center mt-1">
                                <div className="font-medium text-[11px] text-slate-800 truncate">
                                    {shapeDef.name}
                                </div>
                                <div className="text-[9px] text-slate-500 truncate" title={shapeDef.recommendedFor}>
                                    {shapeDef.recommendedFor}
                                </div>
                            </div>
                        </button>
                    );
                })}

                {filteredShapes.length === 0 && (
                    <div className="col-span-full py-4 text-center text-xs text-slate-400">
                        검색 조건에 맞는 도형이 없습니다.
                    </div>
                )}
            </div>
        </div>
    );
};
