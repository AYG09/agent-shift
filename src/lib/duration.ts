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

const UNIT_TO_MINUTES: Record<DurationUnit, number> = {
    seconds: 1 / 60,
    minutes: 1,
    hours: 60,
    days: 60 * 8, // 1 근무일 = 8시간
    weeks: 60 * 8 * 5, // 1 근무주 = 5일
    months: 60 * 8 * 20, // 1 근무월 = 20일
};

/** 화면 표시용 문자열. 예: { value: 30, unit: 'seconds' } → "30초" */
export function formatDuration(duration?: Duration): string | undefined {
    if (!duration) return undefined;
    return `${duration.value}${UNIT_LABELS[duration.unit]}`;
}

/** 시간 계산용 분 단위 환산 */
export function toMinutes(duration: Duration): number {
    return duration.value * UNIT_TO_MINUTES[duration.unit];
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
