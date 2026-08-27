import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const scenarioFinalMode = process.argv.includes('--scenario-final');
const finalMode = process.argv.includes('--final') || scenarioFinalMode;
const repoRoot = process.cwd();
const workOrderBase = '799f5d4';
const failures = [];
const warnings = [];

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function lines(value) {
  return value ? value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : [];
}

function normalized(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

let changedFiles = [];
try {
  changedFiles = [...new Set([
    ...lines(git(['diff', '--name-only', `${workOrderBase}..HEAD`, '--relative'])),
    ...lines(git(['diff', '--name-only', '--relative'])),
    ...lines(git(['diff', '--cached', '--name-only', '--relative'])),
    ...lines(git(['ls-files', '--others', '--exclude-standard'])),
  ].map(normalized))];
} catch (error) {
  const message = `기준 커밋 ${workOrderBase} 이후 Git 변경 범위를 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}`;
  if (finalMode) failures.push(message);
  else warnings.push(message);
}

const forbiddenPrefixes = ['src/app/flow/', 'src/components/flow/'];
const forbiddenFiles = new Set([
  'tests/flow-shapes.test.ts',
  'tests/terminal-node.test.tsx',
]);
const forbidden = changedFiles.filter((file) => forbiddenPrefixes.some((prefix) => file.startsWith(prefix)));
forbidden.push(...changedFiles.filter((file) => forbiddenFiles.has(file)));
if (forbidden.length > 0) failures.push(`/flow 보호 경로가 변경되었습니다: ${forbidden.join(', ')}`);

// tests/flow-branches.test.ts는 W4-05 통합 지시(W4_00_MASTER_PARALLEL.md)가 명시적으로 승인한
// 예외를 하나 갖는다: src/app/api/ai/route.ts의 비-route export를
// src/server/flow/flow-prompts.ts로 무동작변경 이동하면서 이 테스트의 import 경로만 갱신하는
// 것. 그 외의 어떤 변경(assertion·prompt 문자열·동작 로직)도 승인 대상이 아니다. 그래서 이
// 파일은 여전히 하드 FAIL이 아니라 사람이 diff를 검토하는 sensitiveFiles(WARN) 쪽에 둔다 —
// api/ai/route.ts와 같은 취급이다. 소급 허용이 아니라 이번 라운드의 실제 필요 때문에 갱신한
// 것이며, npm run test:flow-branches / npm run test:shapes(무회귀 증명)가 항상 함께 통과해야
// 한다.
const sensitiveFiles = new Set([
  'src/app/api/ai/route.ts',
  'src/lib/graph-validation.ts',
  'src/lib/flow-shapes.ts',
  'src/lib/store.ts',
  'tests/flow-branches.test.ts',
]);
const sensitive = changedFiles.filter((file) => sensitiveFiles.has(file));
if (sensitive.length > 0) warnings.push(`공유 고위험 파일 변경을 수동 검토하십시오: ${sensitive.join(', ')}`);

const customerSourceNames = [
  'SOP 작성 및 분석 플랫폼_답변 회신.xlsx',
  'SOP시스템 시나리오.docx',
];
const sourceLeaks = changedFiles.filter((file) => customerSourceNames.some((name) => file.endsWith(name)));
if (sourceLeaks.length > 0) failures.push(`고객 원본 파일이 저장소 변경에 포함되었습니다: ${sourceLeaks.join(', ')}`);
try {
  const trackedSources = lines(git(['ls-files'])).map(normalized).filter((file) => customerSourceNames.some((name) => file.endsWith(name)));
  if (trackedSources.length > 0) failures.push(`고객 원본 파일이 Git에서 추적되고 있습니다: ${trackedSources.join(', ')}`);
} catch (error) {
  failures.push(`Git 추적 파일을 확인하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
}

const packagePath = resolve(repoRoot, 'package.json');
if (!existsSync(packagePath)) {
  failures.push('package.json을 찾을 수 없습니다. 저장소 루트에서 실행하십시오.');
} else {
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  for (const scriptName of ['lint', 'test:sop', 'test:sop-demo', 'build']) {
    if (!pkg.scripts?.[scriptName]) failures.push(`필수 npm script가 없습니다: ${scriptName}`);
  }
  const sopTestScript = String(pkg.scripts?.['test:sop'] || '');
  const requiredSopTests = [
    'tests/sop-task-library.test.ts',
    'tests/sop-member-home.test.ts',
    'tests/sop-subaction-agentization.test.ts',
  ];
  for (const testFile of requiredSopTests) {
    if (finalMode && !sopTestScript.includes(testFile)) {
      failures.push(`최종 모드에서는 ${testFile}가 npm run test:sop에 포함되어야 합니다.`);
    }
  }

  if (scenarioFinalMode) {
    const requiredScenarioTests = [
      'tests/sop-customer-scenario.test.ts',
      'tests/sop-approval-flow.test.ts',
      'tests/sop-hr-analytics.test.ts',
    ];
    for (const testFile of requiredScenarioTests) {
      if (!existsSync(resolve(repoRoot, testFile))) failures.push(`최종 시나리오 실행 테스트가 없습니다: ${testFile}`);
      if (!sopTestScript.includes(testFile)) failures.push(`최종 시나리오 모드에서는 ${testFile}가 npm run test:sop에 포함되어야 합니다.`);
    }
  }
}

const requiredInstructionArtifacts = [
  ['GEMINI.md', 'Gemini/Antigravity 저장소 지침'],
  ['SOP_FINAL_CUSTOMER_SCENARIO_WORK_ORDER.md', '최종 고객 시나리오 작업지시서'],
  ['.agents/skills/implement-sop-customer-requirements/references/final-system-scenario-contract.md', '최종 시나리오 기능 계약'],
  ['.agents/skills/implement-sop-customer-requirements/references/subaction-semantics-contract.md', 'Sub Action 의미 계약'],
];
for (const [path, label] of requiredInstructionArtifacts) {
  if (!existsSync(resolve(repoRoot, path))) failures.push(`${label}가 없습니다: ${path}`);
}

const followupWorkOrderPath = resolve(repoRoot, 'SOP_MEMBER_HOME_SUBACTION_AGENTIZATION_WORK_ORDER.md');
if (!existsSync(followupWorkOrderPath)) {
  failures.push('구성원 Home/Activity–Sub Action 작업지시서를 찾을 수 없습니다.');
}

const followupArtifacts = [
  ['src/app/sop/page.tsx', '구성원 Home route'],
  ['tests/sop-member-home.test.ts', '구성원 Home/lifecycle 실행 테스트'],
  ['tests/sop-subaction-agentization.test.ts', 'Activity–Sub Action/Agentization 실행 테스트'],
];
for (const [path, label] of followupArtifacts) {
  if (existsSync(resolve(repoRoot, path))) continue;
  const message = `${label}가 아직 없습니다: ${path}`;
  if (finalMode) failures.push(message);
  else warnings.push(`${message} (사전 점검에서는 허용)`);
}

if (scenarioFinalMode) {
  const scenarioArtifacts = [
    ['src/app/sop/approvals/page.tsx', '직책자/SME 승인 inbox route'],
    ['src/app/sop/hr/page.tsx', 'HR 대시보드 route'],
  ];
  for (const [path, label] of scenarioArtifacts) {
    if (!existsSync(resolve(repoRoot, path))) failures.push(`${label}가 없습니다: ${path}`);
  }
}

const fixturePath = resolve(repoRoot, 'src/data/sop-task-library-sample.json');
if (!existsSync(fixturePath)) {
  const message = '고객 정규화 fixture가 아직 없습니다: src/data/sop-task-library-sample.json';
  if (finalMode) failures.push(message);
  else warnings.push(`${message} (사전 점검에서는 허용)`);
} else {
  try {
    const parsed = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const jobs = Array.isArray(parsed) ? parsed : parsed.jobs;
    if (!Array.isArray(jobs)) throw new Error('root는 jobs 배열 또는 { jobs: [] }여야 합니다.');

    const tasks = jobs.flatMap((job) => Array.isArray(job.tasks) ? job.tasks : []);
    const activities = tasks.flatMap((task) => Array.isArray(task.activities) ? task.activities : []);
    const skills = activities.flatMap((activity) => Array.isArray(activity.skills) ? activity.skills : []);

    const counts = { jobs: jobs.length, tasks: tasks.length, activities: activities.length, relations: skills.length };
    const expected = { jobs: 2, tasks: 10, activities: 138, relations: 690 };
    for (const [key, value] of Object.entries(expected)) {
      if (counts[key] !== value) failures.push(`fixture ${key} 수가 ${value}가 아닙니다: ${counts[key]}`);
    }

    const expectedJobs = new Map([
      ['50100208', 'Application Marketing'],
      ['50100245', 'Talent Acquisition'],
    ]);
    for (const [sourceJobId, jobName] of expectedJobs) {
      if (!jobs.some((job) => String(job.sourceJobId) === sourceJobId && job.name === jobName)) {
        failures.push(`고객 Job을 찾지 못했습니다: ${sourceJobId} / ${jobName}`);
      }
    }

    const expectedTaskNames = new Set([
      '시장 및 기술 동향 분석 (Market Intelligence)',
      '제품 포트폴리오 및 믹스 최적화',
      '수요 예측 및 수익성 분석',
      '전략적 파트너십 및 신규 고객 발굴',
      '판매 전략 수립 및 시장 커뮤니케이션',
      '채용 전략 수립 및 기획',
      '인재 유치 및 소싱',
      '채용 프로세스 운영 및 최적화',
      '채용 경쟁력 및 EVP 제고',
      '직무 분석 및 역량 매칭',
    ]);
    const actualTaskNames = new Set(tasks.map((task) => task.name));
    for (const taskName of expectedTaskNames) {
      if (!actualTaskNames.has(taskName)) failures.push(`고객 Task를 찾지 못했습니다: ${taskName}`);
    }

    const uniqueSkillNames = new Set(skills.map((skill) => skill.name));
    if (uniqueSkillNames.size !== 339) failures.push(`고유 Skill명 수가 339개가 아닙니다: ${uniqueSkillNames.size}`);

    const ids = { jobs: new Set(), tasks: new Set(), activities: new Set(), skills: new Set() };
    for (const job of jobs) {
      if (!nonEmpty(job.id) || !nonEmpty(String(job.sourceJobId ?? '')) || !nonEmpty(job.name)) failures.push('Job 필수 식별정보가 누락되었습니다.');
      if (ids.jobs.has(job.id)) failures.push(`중복 Job id: ${job.id}`);
      ids.jobs.add(job.id);

      for (const task of job.tasks || []) {
        if (!nonEmpty(task.id) || !nonEmpty(task.name) || !nonEmpty(task.description)) failures.push(`Task 필수값 누락: ${task.id || task.name || '(unknown)'}`);
        if (ids.tasks.has(task.id)) failures.push(`중복 Task id: ${task.id}`);
        ids.tasks.add(task.id);

        const orders = [];
        for (const activity of task.activities || []) {
          if (!nonEmpty(activity.id) || !Number.isInteger(activity.order) || activity.order < 1 || !nonEmpty(activity.name) || !nonEmpty(activity.description)) {
            failures.push(`Activity 필수값 누락: ${activity.id || activity.name || '(unknown)'}`);
          }
          if (ids.activities.has(activity.id)) failures.push(`중복 Activity id: ${activity.id}`);
          ids.activities.add(activity.id);
          orders.push(activity.order);
          if (!Array.isArray(activity.skills) || activity.skills.length !== 5) failures.push(`Activity ${activity.id}의 Skill 관계가 5개가 아닙니다.`);

          for (const skill of activity.skills || []) {
            if (!nonEmpty(skill.id) || !nonEmpty(skill.name) || !nonEmpty(skill.description)) failures.push(`Skill 필수값 누락: ${skill.id || skill.name || '(unknown)'}`);
            if (ids.skills.has(skill.id)) failures.push(`중복 Activity-Skill relation id: ${skill.id}`);
            ids.skills.add(skill.id);
          }
        }
        const sorted = [...orders].sort((a, b) => a - b);
        if (new Set(orders).size !== orders.length || orders.some((order, index) => order !== sorted[index])) {
          failures.push(`Task ${task.id}의 Activity order가 중복되었거나 정렬되지 않았습니다.`);
        }
        if (orders.length < 12 || orders.length > 15) failures.push(`Task ${task.id}의 Activity 수가 12~15 범위를 벗어났습니다: ${orders.length}`);
      }
    }

    const representative = tasks.find((task) => task.name === '채용 프로세스 운영 및 최적화');
    if (!representative || representative.activities?.length !== 14) {
      failures.push('대표 Task "채용 프로세스 운영 및 최적화"의 Activity 14개를 확인하지 못했습니다.');
    }
  } catch (error) {
    failures.push(`고객 fixture를 검증하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`SOP customer guard (${scenarioFinalMode ? 'scenario-final' : finalMode ? 'final' : 'preflight'})`);
console.log(`Changed files inspected: ${changedFiles.length}`);
for (const warning of warnings) console.warn(`[WARN] ${warning}`);
for (const failure of failures) console.error(`[FAIL] ${failure}`);

if (failures.length > 0) process.exit(1);
console.log('[PASS] SOP customer scope guard passed.');
