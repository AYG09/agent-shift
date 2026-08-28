#!/usr/bin/env node
/**
 * 코드 품질 가드레일 기계 검증 (docs/QUALITY_CONVENTIONS.md의 집행부).
 *
 * 각 규칙은 "단일 원천(SSOT)이 이미 존재하는데 그것을 우회해 재구현하는 패턴"을
 * 금지한다. 규칙을 바꿔야 하면 docs/QUALITY_CONVENTIONS.md를 먼저 갱신한 뒤
 * 이 스크립트의 허용 목록을 수정한다 — 몰래 우회하지 않는다.
 *
 * 사용: npm run verify:quality  (실패 시 exit 1)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

/** src/**의 .ts/.tsx 파일 목록 (POSIX 경로로 정규화). */
function listSourceFiles(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
        else if (/\.(ts|tsx)$/.test(name)) out.push(full);
    }
    return out;
}

const files = listSourceFiles(SRC).map((full) => ({
    path: relative(ROOT, full).split(sep).join('/'),
    text: readFileSync(full, 'utf8'),
}));

/**
 * 규칙 정의. pattern은 줄 단위로 검사한다.
 *  - allow: 패턴 등장이 허용되는 파일(원천 모듈) 목록
 *  - scope: 검사 대상 경로 prefix (생략 시 src 전체)
 */
const RULES = [
    {
        id: 'provider-import',
        message: "'@ai-sdk/google' import는 모델 팩토리에서만 허용됩니다 (축 4: 프로바이더 교체 지점 단일화). resolveGenerationModel을 사용하세요.",
        pattern: /@ai-sdk\/google/,
        allow: ['src/server/ai/model-factory.ts'],
    },
    {
        id: 'provider-env-key',
        message: 'GOOGLE_GENERATIVE_AI_API_KEY 직접 접근은 모델 팩토리에서만 허용됩니다. resolveGenerationApiKey를 사용하세요.',
        pattern: /GOOGLE_GENERATIVE_AI_API_KEY/,
        allow: ['src/server/ai/model-factory.ts'],
    },
    {
        id: 'provider-options',
        message: '프로바이더 전용 추론 옵션(thinkingConfig)은 모델 팩토리 밖으로 새면 안 됩니다. buildReasoningProviderOptions를 사용하세요.',
        pattern: /thinkingConfig/,
        allow: ['src/server/ai/model-factory.ts', 'src/lib/gemini-models.ts'],
    },
];

let violationCount = 0;
for (const rule of RULES) {
    for (const file of files) {
        if (rule.scope && !file.path.startsWith(rule.scope)) continue;
        if (rule.allow.includes(file.path)) continue;
        file.text.split('\n').forEach((line, index) => {
            if (rule.pattern.test(line)) {
                violationCount += 1;
                console.error(`[FAIL:${rule.id}] ${file.path}:${index + 1}`);
                console.error(`  ${line.trim().slice(0, 120)}`);
                console.error(`  → ${rule.message}`);
            }
        });
    }
}

if (violationCount > 0) {
    console.error(`\n품질 가드레일 위반 ${violationCount}건. docs/QUALITY_CONVENTIONS.md를 확인하세요.`);
    process.exit(1);
}
console.log(`[PASS] 품질 가드레일 통과 (${RULES.length}개 규칙 · ${files.length}개 파일 검사)`);
