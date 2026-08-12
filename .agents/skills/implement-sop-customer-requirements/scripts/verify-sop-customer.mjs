import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const finalMode = process.argv.includes('--final');
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
const forbidden = changedFiles.filter((file) => forbiddenPrefixes.some((prefix) => file.startsWith(prefix)));
if (forbidden.length > 0) failures.push(`/flow 보호 경로가 변경되었습니다: ${forbidden.join(', ')}`);

const sensitiveFiles = new Set([
  'src/app/api/ai/route.ts',
  'src/lib/graph-validation.ts',
  'src/lib/flow-shapes.ts',
  'src/lib/store.ts',
]);
const sensitive = changedFiles.filter((file) => sensitiveFiles.has(file));
if (sensitive.length > 0) warnings.push(`공유 고위험 파일 변경을 수동 검토하십시오: ${sensitive.join(', ')}`);

const workbookLeak = changedFiles.filter((file) => file.endsWith('SOP 작성 및 분석 플랫폼_답변 회신.xlsx'));
if (workbookLeak.length > 0) failures.push(`고객 원본 Excel이 저장소 변경에 포함되었습니다: ${workbookLeak.join(', ')}`);
try {
  const trackedWorkbook = lines(git(['ls-files'])).map(normalized).filter((file) => file.endsWith('SOP 작성 및 분석 플랫폼_답변 회신.xlsx'));
  if (trackedWorkbook.length > 0) failures.push(`고객 원본 Excel이 Git에서 추적되고 있습니다: ${trackedWorkbook.join(', ')}`);
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
  if (finalMode && !String(pkg.scripts?.['test:sop'] || '').includes('tests/sop-task-library.test.ts')) {
    failures.push('최종 모드에서는 tests/sop-task-library.test.ts가 npm run test:sop에 포함되어야 합니다.');
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

console.log(`SOP customer guard (${finalMode ? 'final' : 'preflight'})`);
console.log(`Changed files inspected: ${changedFiles.length}`);
for (const warning of warnings) console.warn(`[WARN] ${warning}`);
for (const failure of failures) console.error(`[FAIL] ${failure}`);

if (failures.length > 0) process.exit(1);
console.log('[PASS] SOP customer scope guard passed.');
