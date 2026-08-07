/**
 * Enterprise AI Agent 플랫폼 데이터
 * - 기업용 AI Agent 서비스 제공업체 목록
 * - 카테고리별 그룹핑
 * - NON-AI 유저를 위한 도구 추천 컨텍스트 제공
 */

// 플랫폼 카테고리 타입
type PlatformCategory =
    | 'productivity' 
    | 'crm' 
    | 'itsm' 
    | 'communication' 
    | 'knowledge' 
    | 'automation';

// 플랫폼 인터페이스
interface Platform {
    value: string;      // 고유 식별자
    label: string;      // 표시 이름
    category: PlatformCategory;
}

// 카테고리 레이블 (한국어)
export const PLATFORM_CATEGORIES: Record<PlatformCategory, string> = {
    productivity: '생산성 도구',
    crm: 'CRM / 영업',
    itsm: 'IT 서비스',
    communication: '커뮤니케이션',
    knowledge: '지식 관리',
    automation: '자동화',
};

// 카테고리 순서 (UI 표시용)
export const PLATFORM_CATEGORY_ORDER: PlatformCategory[] = [
    'productivity',
    'communication',
    'automation',
    'crm',
    'knowledge',
    'itsm',
];

/**
 * Enterprise AI 플랫폼 목록
 * - 2024-2025 기업 AI Agent 트렌드 기반
 * - 주요 업체: Microsoft, Google, Salesforce, ServiceNow, Slack 등
 */
export const ENTERPRISE_PLATFORMS: Platform[] = [
    // Productivity (생산성 도구)
    { value: 'ms365-copilot', label: 'Microsoft 365 Copilot', category: 'productivity' },
    { value: 'google-workspace', label: 'Google Workspace', category: 'productivity' },
    
    // Communication (커뮤니케이션)
    { value: 'slack-ai', label: 'Slack AI', category: 'communication' },
    { value: 'teams-copilot', label: 'Microsoft Teams Copilot', category: 'communication' },
    { value: 'zoom-ai', label: 'Zoom AI Companion', category: 'communication' },
    
    // Automation (자동화)
    { value: 'power-automate', label: 'Power Automate', category: 'automation' },
    { value: 'zapier', label: 'Zapier', category: 'automation' },
    { value: 'make', label: 'Make (Integromat)', category: 'automation' },
    { value: 'uipath', label: 'UiPath', category: 'automation' },
    
    // CRM / 영업
    { value: 'salesforce-agentforce', label: 'Salesforce Agentforce', category: 'crm' },
    { value: 'hubspot-ai', label: 'HubSpot AI', category: 'crm' },
    { value: 'dynamics-copilot', label: 'Dynamics 365 Copilot', category: 'crm' },
    
    // Knowledge (지식 관리)
    { value: 'notion-ai', label: 'Notion AI', category: 'knowledge' },
    { value: 'confluence-ai', label: 'Confluence AI', category: 'knowledge' },
    { value: 'coda-ai', label: 'Coda AI', category: 'knowledge' },
    
    // ITSM (IT 서비스)
    { value: 'servicenow-ai', label: 'ServiceNow AI Agents', category: 'itsm' },
    { value: 'jira-ai', label: 'Jira AI (Atlassian)', category: 'itsm' },
];

