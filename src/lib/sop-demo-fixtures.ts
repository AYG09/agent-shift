import type { FlowShape } from './flow-shapes';

export type DemoScenario = 'recruiting' | 'purchasing' | 'complaint';

/**
 * 실제로 완성된(제목과 단계·SKILL 내용이 일치하는) 시나리오 목록.
 *
 * purchasing/complaint는 아직 recruiting fixture의 제목만 바꿔치기한 상태라 실제 단계 내용이
 * "채용" 그대로 남아 있다 - 제목과 실제 SOP 내용이 다른 상태를 고객 미팅용 목업에서 노출할 수
 * 없으므로, 완성되기 전까지는 이 목록에 넣지 않는다(UI는 이 목록을 기준으로 선택 가능 여부를
 * 결정하고, 완성되지 않은 시나리오로의 URL 직접 진입도 이 목록 기준으로 recruiting으로 되돌린다).
 */
export const READY_DEMO_SCENARIOS: readonly DemoScenario[] = ['recruiting'];

export function isDemoScenarioReady(scenario: DemoScenario): boolean {
    return READY_DEMO_SCENARIOS.includes(scenario);
}

export const DEMO_MODES: readonly DemoMode[] = ['compact', 'standard', 'detailed'];
export const DEMO_PRESETS: readonly DemoPreset[] = ['simple', 'standard', 'branching'];

/**
 * URL query parameter는 신뢰할 수 없는 외부 입력이다 - 허용 목록에 없는 값은 조용히 안전한
 * 기본값으로 정규화한다(런타임 TypeError나 깨진 화면을 노출하지 않는다). scenario는 완성되지
 * 않은(READY_DEMO_SCENARIOS에 없는) 값도 여기서 바로 recruiting으로 되돌린다.
 */
export function normalizeDemoScenario(value: string | null | undefined): DemoScenario {
    return (READY_DEMO_SCENARIOS as readonly string[]).includes(value ?? '') ? (value as DemoScenario) : 'recruiting';
}

export function normalizeDemoMode(value: string | null | undefined): DemoMode {
    return (DEMO_MODES as readonly string[]).includes(value ?? '') ? (value as DemoMode) : 'standard';
}

export function normalizeDemoPreset(value: string | null | undefined): DemoPreset {
    return (DEMO_PRESETS as readonly string[]).includes(value ?? '') ? (value as DemoPreset) : 'branching';
}
export type DemoMode = 'compact' | 'standard' | 'detailed';
export type DemoPreset = 'simple' | 'standard' | 'branching';
export type DemoReviewStatus = 'ai-draft' | 'reviewed' | 'confirmed';

export interface DemoSkill {
    id: string;
    name: string;
    description: string;
    source: 'work-library' | 'ai-suggested';
    accepted: boolean;
}

export interface DemoStep {
    id: string;
    title: string;
    definition: string;
    detailedInstructions: string;
    responsibleRole: string;
    inputs: string[];
    outputs: string[];
    tools: string[];
    cautions: string[];
    decisionRules: string[];
    requiredSkills: DemoSkill[];
    estimatedDuration: string;
    type: string;
    shape: FlowShape;
    terminalType?: 'start' | 'end';
    position: { x: number; y: number };
    reviewStatus: DemoReviewStatus;
}

export interface DemoEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
    branchType: 'yes' | 'no' | 'condition' | 'default';
    condition?: string;
    sourceHandle?: string;
    targetHandle?: string;
}

export interface DemoDocument {
    id: string;
    scenario: DemoScenario;
    title: string;
    steps: DemoStep[];
    edges: DemoEdge[];
}

export const RECRUITING_CONTEXT = `채용 요청 확인 후 공고를 등록하고 지원자를 접수합니다.
필수 자격 요건을 충족하지 못한 지원자는 서류 유형에서 제외합니다.
적합한 후보자가 없으면 추가 모집 또는 기존 후보자 검토를 병행합니다.
실무 면접과 임원 면접을 통과한 후보자에게 처우안을 제안합니다.
후보자가 처우를 수락하지 않으면 허용 범위 안에서 재협상합니다.
재협상 시도가 2회를 초과하면 대체 후보자를 검토합니다.`;

export const scenarioInfo: Record<DemoScenario, { title: string; task: string; activity: string; nodes: string; decisions: string; loop: string; skills: DemoSkill[] }> = {
    recruiting: {
        title: '채용 및 입사 확정',
        task: '인재 채용',
        activity: '면접 운영',
        nodes: '14–16',
        decisions: '3',
        loop: '2',
        skills: [
            { id: 'r1', name: '채용 요건 분석', description: '채용 요청을 직무·경력·필수 요건으로 구조화합니다.', source: 'work-library', accepted: true },
            { id: 'r2', name: '지원자 자격 검토', description: '제출 자료와 자격 요건의 충족 여부를 판단합니다.', source: 'work-library', accepted: true },
            { id: 'r3', name: '구조화 면접 운영', description: '평가 기준에 맞춰 면접을 진행하고 기록합니다.', source: 'work-library', accepted: true },
            { id: 'r4', name: '평가 결과 종합', description: '면접 결과와 검토 의견을 종합해 다음 단계를 결정합니다.', source: 'work-library', accepted: true },
            { id: 'r5', name: '처우 협상', description: '승인 범위 안에서 후보자와 처우 조건을 조율합니다.', source: 'work-library', accepted: true },
            { id: 'r6', name: '근로계약 및 입사 일정 관리', description: '계약과 입사 준비 사항을 누락 없이 관리합니다.', source: 'work-library', accepted: true },
        ],
    },
    purchasing: { title: '구매 요청 및 비용 승인', task: '구매 관리', activity: '비용 승인', nodes: '10–12', decisions: '2', loop: '1', skills: [] },
    complaint: { title: '고객 불만 접수 및 해결', task: '고객 경험 관리', activity: '불만 해결', nodes: '10–12', decisions: '2', loop: '1', skills: [] },
};

const base = (id: string, title: string, shape: FlowShape, x: number, y: number, extras: Partial<DemoStep> = {}): DemoStep => ({
    id,
    title,
    definition: `${title}에 필요한 입력 정보를 확인하고, 정의된 기준에 따라 다음 단계에서 사용할 결과를 만듭니다.`,
    detailedInstructions: '필수 입력값과 검토 기준을 확인한 뒤, 결과와 근거를 기록합니다. 예외 상황은 승인 기준에 따라 처리합니다.',
    responsibleRole: 'Talent Acquisition Manager',
    inputs: ['채용 요청서'],
    outputs: ['검토 결과'],
    tools: ['ATS', '면접 평가표'],
    cautions: ['개인정보는 업무 목적 범위에서만 취급합니다.'],
    decisionRules: [],
    requiredSkills: [],
    estimatedDuration: '30분',
    type: 'process',
    shape,
    terminalType: undefined,
    position: { x, y },
    reviewStatus: 'ai-draft',
    ...extras,
});

export function recruitingFixture(preset: DemoPreset = 'branching'): DemoDocument {
    const steps: DemoStep[] = [
        base('start', '시작', 'terminal', 0, 120, { terminalType: 'start', type: 'terminal', definition: '승인된 채용 요청을 기준으로 채용 절차를 시작합니다.', outputs: ['채용 진행 시작'] }),
        base('request', '채용 요청 접수', 'manualInput', 240, 120, { definition: '현업 부서의 채용 요청서에서 채용 인원, 직무, 필요 시점을 접수합니다.', inputs: ['채용 요청서', '인력 계획'], outputs: ['접수된 채용 요청'], requiredSkills: [scenarioInfo.recruiting.skills[0]] }),
        base('requirements', '채용 요건 및 경력 조건 검토', 'collate', 480, 120, { definition: '직무 기술서와 인력 계획을 비교해 필수 자격 요건과 경력 조건을 확정합니다.', outputs: ['확정 채용 요건'], requiredSkills: [scenarioInfo.recruiting.skills[0]] }),
        base('ad-draft', '채용 공고 작성', 'document', 720, 120, { definition: '확정된 채용 요건을 바탕으로 공고 문안과 지원 안내를 작성합니다.', outputs: ['채용 공고 초안'], requiredSkills: [{ id: 'ai-ad-draft-1', name: '디지털 채용 마케팅', description: 'AI 제안 이유: 공고 노출과 지원 전환율을 높이려면 채널별 타겟 문구 최적화 역량이 필요합니다.', source: 'ai-suggested', accepted: false }] }),
        base('ad-publish', '채용 공고 등록', 'manualOperation', 720, 320, { definition: '승인된 공고를 채용 채널에 등록하고 접수 기간을 설정합니다.', outputs: ['게시된 채용 공고'] }),
        base('application', '지원자 접수 및 자료 수집', 'data', 480, 320, { definition: '지원서와 제출 자료를 접수하여 검토 가능한 후보자 목록을 만듭니다.', outputs: ['지원자 목록', '제출 자료'] }),
        base('screening', '지원자 자격 요건 대조', 'collate', 240, 320, { definition: '지원자 자료를 필수 자격 요건과 대조하여 서류 검토 결과를 정리합니다.', outputs: ['서류 검토표'], requiredSkills: [scenarioInfo.recruiting.skills[1]] }),
        base('document-pass', '서류 합격 여부', 'decision', 0, 300, { type: 'decision', definition: '필수 요건과 검토 기준을 충족하는지 판단해 면접 진행 또는 후보자 재탐색으로 분기합니다.', decisionRules: ['필수 자격 요건 충족', '경력 조건 부합'] }),
        base('interview', '실무 면접 진행', 'manualOperation', 0, 520, { definition: '직무 역량과 협업 경험을 구조화 면접 기준으로 평가합니다.', outputs: ['실무 면접 평가표'], requiredSkills: [scenarioInfo.recruiting.skills[2]] }),
        base('interview-pass', '실무 면접 합격 여부', 'decision', 240, 500, { type: 'decision', definition: '실무 면접 평가 기준에 따라 임원 면접 진행 여부를 판단합니다.', decisionRules: ['핵심 역량 기준 충족', '직무 적합성 확인'] }),
        base('executive', '임원 면접 진행', 'manualOperation', 480, 520, { definition: '조직 적합성과 입사 의지를 확인하고 최종 평가 의견을 수집합니다.', outputs: ['임원 면접 평가표'] }),
        base('final-review', '최종 평가 결과 종합', 'merge', 720, 520, { definition: '실무와 임원 면접 결과를 종합하여 처우 협의 대상 후보자를 확정합니다.', outputs: ['최종 평가 결과'], requiredSkills: [scenarioInfo.recruiting.skills[3]] }),
        base('offer', '처우 조건 협의', 'loopLimit', 720, 720, { definition: '승인된 처우 범위 안에서 후보자에게 제안하고, 최대 2회까지 재협상을 관리합니다.', outputs: ['처우 제안안'], requiredSkills: [scenarioInfo.recruiting.skills[4]], detailedInstructions: '승인 범위와 후보자의 요구를 비교합니다. 재협상은 최대 2회까지만 허용하고, 초과 시 대체 후보자를 검토합니다.' }),
        base('offer-accept', '조건 수락 여부', 'decision', 480, 700, { type: 'decision', definition: '후보자의 처우 수락 여부에 따라 계약 작성 또는 재협상·대체 후보자 검토로 분기합니다.', decisionRules: ['승인된 처우 범위 이내', '후보자 수락 의사 확인'] }),
        base('contract', '근로계약서 작성 및 입사 정보 등록', 'document', 240, 720, { definition: '합의된 조건으로 근로계약서를 작성하고 입사 준비 정보를 등록합니다.', outputs: ['근로계약서', '입사 정보'], requiredSkills: [scenarioInfo.recruiting.skills[5], { id: 'ai-contract-1', name: '노무 법무 검토', description: 'AI 제안 이유: 근로기준법 필수 명시 항목 누락 여부를 계약 체결 전에 검증해야 합니다.', source: 'ai-suggested', accepted: false }] }),
        base('end', '채용 완료', 'terminal', 0, 720, { terminalType: 'end', type: 'terminal', definition: '근로계약과 입사 정보 등록이 완료되어 채용 절차를 종료합니다.', inputs: ['완료된 입사 정보'], outputs: ['채용 완료'] }),
    ];
    const edges: DemoEdge[] = [
        ['start', 'request'], ['request', 'requirements'], ['requirements', 'ad-draft'], ['ad-draft', 'ad-publish'], ['ad-publish', 'application'], ['application', 'screening'], ['screening', 'document-pass'],
        ['document-pass', 'interview', 'YES', 'yes'], ['document-pass', 'application', 'NO · 추가 모집/후보자 재탐색', 'no'],
        ['interview', 'interview-pass'], ['interview-pass', 'executive', 'YES', 'yes'], ['interview-pass', 'application', 'NO · 후보자 재탐색', 'no'],
        ['executive', 'final-review'], ['final-review', 'offer'], ['offer', 'offer-accept'],
        ['offer-accept', 'contract', 'YES', 'yes'], ['offer-accept', 'offer', 'NO · 재협상', 'no'], ['contract', 'end'],
    ].map(([source, target, label, branchType], index) => ({ id: `edge-${index + 1}`, source, target, label, branchType: (branchType || 'default') as DemoEdge['branchType'], condition: label || '순차 진행', sourceHandle: 'right', targetHandle: 'left' }));

    const limits = preset === 'simple' ? 8 : preset === 'standard' ? 13 : 16;
    const visible = steps.slice(0, limits);
    const visibleIds = new Set(visible.map((step) => step.id));
    if (preset === 'simple') {
        visible[visible.length - 1] = { ...visible[visible.length - 1], id: 'simple-end', title: '서류 검토 완료', shape: 'terminal', terminalType: 'end', type: 'terminal', position: { x: 0, y: 300 } };
        return { id: 'demo-recruiting-simple', scenario: 'recruiting', title: '채용 및 입사 확정 SOP', steps: visible, edges: edges.slice(0, 7).map((edge) => edge.target === 'document-pass' ? { ...edge, target: 'simple-end' } : edge) };
    }
    if (preset === 'standard') {
        visible[visible.length - 1] = { ...visible[visible.length - 1], id: 'standard-end', title: '면접 운영 완료', shape: 'terminal', terminalType: 'end', type: 'terminal', position: { x: 720, y: 720 } };
        return { id: 'demo-recruiting-standard', scenario: 'recruiting', title: '채용 및 입사 확정 SOP', steps: visible, edges: edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)).map((edge) => edge.target === 'offer' ? { ...edge, target: 'standard-end' } : edge) };
    }
    return { id: 'demo-recruiting-branching', scenario: 'recruiting', title: '채용 및 입사 확정 SOP', steps, edges };
}

export function fixtureFor(scenario: DemoScenario, preset: DemoPreset): DemoDocument {
    const fixture = recruitingFixture(preset);
    if (scenario === 'recruiting') return fixture;
    const titles = scenario === 'purchasing'
        ? ['시작', '구매 요청 접수', '예산 및 구매 요건 검토', '견적 요청서 작성', '견적 요청 발송', '견적서 접수', '공급업체 요건 대조', '예산 승인 여부', '비용 적정성 검토', '비용 승인 여부', '결재권자 승인', '승인 결과 종합', '재협상 조건 검토', '최종 승인 여부', '발주서 작성 및 구매 등록', '구매 완료']
        : ['시작', '고객 불만 접수', '사실관계 및 영향도 확인', '고객 안내 초안 작성', '접수 사실 안내', '증빙 자료 수집', '해결 기준 대조', '즉시 해결 가능 여부', '담당 부서 조치', '조치 완료 여부', '고객 확인 요청', '해결 결과 종합', '보상안 재검토', '고객 수락 여부', '처리 결과 등록', '불만 해결 완료'];
    return {
        ...fixture,
        id: `demo-${scenario}-${preset}`,
        scenario,
        title: `${scenarioInfo[scenario].title} SOP`,
        steps: fixture.steps.map((step, index) => ({ ...step, title: titles[index] || step.title, definition: `${titles[index] || step.title}에 필요한 정보를 확인하고, 정해진 기준에 따라 다음 단계의 결과를 만듭니다.`, requiredSkills: [] })),
    };
}
