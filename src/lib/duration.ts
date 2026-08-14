import type { Duration, DurationUnit, SkillTimeReduction } from './ai-schemas';

// 노드 metrics가 쓰는 단위 (seconds 없음)
export type NodeDurationUnit = Exclude<DurationUnit, 'seconds'>;

const UNIT_LABELS: Record<DurationUnit, string> = {
    seconds: '초',
    minutes: '분',
    hours: '시간',
    days: '일',
    weeks: '주',
    months: '개월',
};


/** 화면 표시용 문자열. 예: { value: 30, unit: 'seconds' } → "30초" */
export function formatDuration(duration?: Duration): string | undefined {
    if (!duration) return undefined;
    return `${duration.value}${UNIT_LABELS[duration.unit]}`;
}

/**
 * 드릴다운의 Duration을 노드 metrics 형태로 변환한다.
 * metrics는 초 단위를 쓰지 않으므로 분으로 올림한다(0분짜리 노드를 만들지 않기 위해 최소 1).
 */
export function toNodeMetrics(
    duration?: Duration
): { duration: number; durationUnit: NodeDurationUnit } | undefined {
    if (!duration) return undefined;

    if (duration.unit === 'seconds') {
        return { duration: Math.max(1, Math.round(duration.value / 60)), durationUnit: 'minutes' };
    }
    return { duration: duration.value, durationUnit: duration.unit };
}

/** 역량별 절감을 화면 표시용으로. 예: "90분 → 5분" */
export function formatSkillReduction(reduction: SkillTimeReduction): string {
    const unit = UNIT_LABELS[reduction.unit];
    return `${reduction.before}${unit} → ${reduction.after}${unit}`;
}
