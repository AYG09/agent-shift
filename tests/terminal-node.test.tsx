import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ReactFlowProvider } from '@xyflow/react';
import { TerminalNode, type CommonNodeData } from '../src/components/flow/CustomNodes';

// react-test-renderer의 act() 경고 억제 (jsdom 없이 순수 JS 트리로 렌더링하는 테스트 환경임을 명시)
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

console.log('=== TerminalNode: 상세정보 popover 클릭/렌더링 검증 ===');
let passCount = 0;
let failCount = 0;

function renderTerminal(data: CommonNodeData) {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
        renderer = TestRenderer.create(
            <ReactFlowProvider>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <TerminalNode {...({ data, selected: false } as any)} />
            </ReactFlowProvider>
        );
    });
    return renderer;
}

// NodeShapeWrapper 최상위 div(도형+핸들+콘텐츠를 감싸며 실제 onClick이 걸리는 요소)를 찾는다.
function findShapeWrapper(renderer: TestRenderer.ReactTestRenderer) {
    const divs = renderer.root.findAllByType('div');
    const wrapper = divs.find(
        (d) => typeof d.props.onClick === 'function' && d.props.style?.width !== undefined
    );
    if (!wrapper) throw new Error('클릭 가능한 도형 wrapper(div)를 찾지 못함');
    return wrapper;
}

function clickShape(renderer: TestRenderer.ReactTestRenderer) {
    const wrapper = findShapeWrapper(renderer);
    act(() => {
        wrapper.props.onClick({ stopPropagation: () => {} });
    });
}

function renderedText(renderer: TestRenderer.ReactTestRenderer): string {
    return JSON.stringify(renderer.toJSON());
}

// 1. description이 있으면 실제 클릭으로 popover를 열 수 있고, 설명이 렌더링된다.
{
    const data: CommonNodeData = { label: '시작', terminalType: 'start', description: '프로세스 시작점 설명' };
    const renderer = renderTerminal(data);
    clickShape(renderer);
    const text = renderedText(renderer);
    if (text.includes('프로세스 시작점 설명') && text.includes('✕')) {
        console.log('PASS 1: description 있으면 클릭 시 popover가 열리고 설명 + 닫기 버튼이 표시됨');
        passCount++;
    } else {
        console.error('FAIL 1: description이 있는데도 popover가 열리지 않음', text);
        failCount++;
    }
    act(() => {
        renderer.unmount();
    });
}

// 2. duration이 있으면 실제 클릭으로 popover를 열 수 있고, 소요 시간이 렌더링된다.
{
    const data: CommonNodeData = {
        label: '종료',
        terminalType: 'end',
        metrics: { duration: 5, durationUnit: 'minutes' },
    };
    const renderer = renderTerminal(data);
    clickShape(renderer);
    const text = renderedText(renderer);
    if (text.includes('5분') && text.includes('예상 소요 시간')) {
        console.log('PASS 2: duration 있으면 클릭 시 popover가 열리고 예상 소요 시간이 표시됨');
        passCount++;
    } else {
        console.error('FAIL 2: duration이 있는데도 popover가 열리지 않음', text);
        failCount++;
    }
    act(() => {
        renderer.unmount();
    });
}

// 3. description/duration이 둘 다 없으면 클릭해도 빈 popover가 열리지 않는다.
{
    const data: CommonNodeData = { label: '시작', terminalType: 'start' };
    const renderer = renderTerminal(data);
    clickShape(renderer);
    const text = renderedText(renderer);
    // popover 고유 마커(닫기 버튼)가 없어야 popover가 열리지 않은 것으로 간주한다.
    if (!text.includes('✕')) {
        console.log('PASS 3: description/duration이 없으면 클릭해도 popover가 열리지 않음');
        passCount++;
    } else {
        console.error('FAIL 3: 정보가 없는데도 popover가 열림', text);
        failCount++;
    }
    act(() => {
        renderer.unmount();
    });
}

// 4. 시작(start) terminalType 유지 + 기존 아이콘/레이블 2줄 제한 회귀 없음
{
    const data: CommonNodeData = { label: '시작 노드', terminalType: 'start' };
    const renderer = renderTerminal(data);
    const text = renderedText(renderer);
    const hasStartIcon = text.includes('▶'); // ▶
    const hasClamp = text.includes('"WebkitLineClamp":2');
    if (hasStartIcon && hasClamp) {
        console.log('PASS 4: terminalType=start 아이콘(▶)과 레이블 2줄 제한이 유지됨');
        passCount++;
    } else {
        console.error('FAIL 4: 시작 아이콘 또는 레이블 줄 제한 회귀', { hasStartIcon, hasClamp });
        failCount++;
    }
    act(() => {
        renderer.unmount();
    });
}

// 5. 종료(end) terminalType 유지 + 아이콘 전환 확인
{
    const data: CommonNodeData = { label: '종료 노드', terminalType: 'end' };
    const renderer = renderTerminal(data);
    const text = renderedText(renderer);
    const hasEndIcon = text.includes('⏹'); // ⏹
    if (hasEndIcon) {
        console.log('PASS 5: terminalType=end 아이콘(⏹)이 유지됨');
        passCount++;
    } else {
        console.error('FAIL 5: 종료 아이콘 누락 - terminalType 처리 회귀', text);
        failCount++;
    }
    act(() => {
        renderer.unmount();
    });
}

// 6. 닫기 버튼을 클릭하면 popover가 닫힌다.
{
    const data: CommonNodeData = { label: '시작', terminalType: 'start', description: '설명' };
    const renderer = renderTerminal(data);
    clickShape(renderer);
    const buttons = renderer.root.findAllByType('button');
    const closeButton = buttons.find((b) => typeof b.props.onClick === 'function');
    if (!closeButton) {
        console.error('FAIL 6: popover 닫기 버튼을 찾지 못함');
        failCount++;
    } else {
        act(() => {
            closeButton.props.onClick();
        });
        const text = renderedText(renderer);
        if (!text.includes('✕')) {
            console.log('PASS 6: 닫기 버튼 클릭 시 popover가 닫힘');
            passCount++;
        } else {
            console.error('FAIL 6: 닫기 버튼을 눌러도 popover가 닫히지 않음', text);
            failCount++;
        }
    }
    act(() => {
        renderer.unmount();
    });
}

if (failCount === 0) {
    console.log(`\nALL TERMINAL NODE TESTS PASSED (${passCount}/${passCount})! \u{1F389}`);
    process.exit(0);
} else {
    console.error(`\nTERMINAL NODE TESTS FAILED: ${failCount} failed, ${passCount} passed.`);
    process.exit(1);
}
