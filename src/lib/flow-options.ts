export const industries = [
    { value: 'manufacturing', label: '제조 (Manufacturing)' },
    { value: 'it', label: 'IT/소프트웨어 (Software & Services)' },
    { value: 'finance', label: '금융/보험 (Finance & Insurance)' },
    { value: 'retail', label: '유통/소매 (Retail)' },
    { value: 'healthcare', label: '의료/바이오 (Healthcare & Biotech)' },
    { value: 'logistics', label: '물류/운송 (Logistics & Transport)' },
    { value: 'construction', label: '건설/엔지니어링 (Construction)' },
    { value: 'education', label: '교육 (Education)' },
    { value: 'media', label: '미디어/엔터테인먼트 (Media)' },
    { value: 'public', label: '공공/행정 (Public Sector)' },
    { value: 'consulting', label: '컨설팅/전문서비스 (Professional Services)' },
    { value: 'energy', label: '에너지/화학 (Energy & Chemicals)' },
    { value: 'hospitality', label: '숙박/식음료 (Hospitality & F&B)' },
    { value: 'other', label: '직접 입력 (Direct Input)' },
] as const;

export const roles = [
    { value: 'cxo', label: 'C-Level (CEO, CTO, CFO...)' },
    { value: 'head', label: '본부장/실장 (Head of Dept)' },
    { value: 'manager', label: '팀장/매니저 (Team Lead)' },
    { value: 'pm', label: 'PM/PO (Product/Project Manager)' },
    { value: 'sales', label: '영업 (Sales)' },
    { value: 'marketing', label: '마케팅 (Marketing)' },
    { value: 'dev', label: '개발/엔지니어링 (Engineering)' },
    { value: 'design', label: '디자인 (Design)' },
    { value: 'hr', label: '인사/채용 (HR)' },
    { value: 'finance_acc', label: '재무/회계 (Finance)' },
    { value: 'ops', label: '운영/지원 (Operations)' },
    { value: 'data', label: '데이터 분석 (Data Analyst)' },
    { value: 'customer', label: '고객 지원 (CS)' },
    { value: 'legal', label: '법무/총무 (Legal/Admin)' },
    { value: 'student', label: '학생/연구원 (Student/Researcher)' },
    { value: 'other', label: '직접 입력 (Direct Input)' },
] as const;

export const timeScales = [
    { value: 'daily', label: '일일 (Daily)' },
    { value: 'weekly', label: '주간 (Weekly)' },
    { value: 'monthly', label: '월간 (Monthly)' },
    { value: 'quarterly', label: '분기 (Quarterly)' },
    { value: 'yearly', label: '연간 (Yearly)' },
    { value: 'project', label: '프로젝트 단위 (Project-based)' },
] as const;
