'use client';

import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';

// 스타일 정의
const styles = StyleSheet.create({
    page: {
        padding: 40,
        backgroundColor: '#ffffff',
    },
    header: {
        marginBottom: 30,
        borderBottomWidth: 2,
        borderBottomColor: '#4f46e5',
        paddingBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1e293b',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 12,
        color: '#64748b',
    },
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#4f46e5',
        marginBottom: 10,
        paddingBottom: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
    },
    row: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    label: {
        fontSize: 10,
        color: '#64748b',
        width: 80,
    },
    value: {
        fontSize: 10,
        color: '#1e293b',
        flex: 1,
    },
    listItem: {
        fontSize: 10,
        color: '#1e293b',
        marginBottom: 4,
        paddingLeft: 10,
    },
    summaryBox: {
        backgroundColor: '#f1f5f9',
        padding: 15,
        borderRadius: 4,
        marginTop: 10,
    },
    metricsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 10,
    },
    metricBox: {
        backgroundColor: '#e0e7ff',
        padding: 10,
        borderRadius: 4,
        width: '30%',
        alignItems: 'center',
    },
    metricValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#4f46e5',
    },
    metricLabel: {
        fontSize: 9,
        color: '#64748b',
        marginTop: 4,
    },
    phaseCard: {
        backgroundColor: '#f8fafc',
        padding: 10,
        marginBottom: 8,
        borderRadius: 4,
        borderLeftWidth: 3,
        borderLeftColor: '#4f46e5',
    },
    phaseName: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#1e293b',
        marginBottom: 4,
    },
    phaseAction: {
        fontSize: 9,
        color: '#64748b',
        marginLeft: 8,
    },
    footer: {
        position: 'absolute',
        bottom: 30,
        left: 40,
        right: 40,
        textAlign: 'center',
        fontSize: 8,
        color: '#94a3b8',
    },
});

// 리포트 데이터 타입
interface ReportData {
    context: { industry: string; role: string; task: string };
    asIsNodes: Array<{ id: string; label: string; description?: string; type: string }>;
    toBeNodes: Array<{ id: string; label: string; description?: string; type: string }>;
    strategy?: {
        framework: string;
        phases: Array<{ name: string; duration: string; actions: string[] }>;
    };
}

// PDF 문서 컴포넌트
const PdfReportDocument = ({ data }: { data: ReportData }) => {
    const date = new Date().toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    const agentCount = data.toBeNodes.filter(n => n.type === 'agent').length;
    const automationRate = data.asIsNodes.length > 0
        ? Math.round((agentCount / data.asIsNodes.length) * 100)
        : 0;

    return (
        <Document>
            {/* Cover Page */}
            <Page size="A4" style={styles.page}>
                <View style={styles.header}>
                    <Text style={styles.title}>Agent Shift</Text>
                    <Text style={styles.subtitle}>AI 기반 변화 관리 분석 리포트</Text>
                    <Text style={[styles.subtitle, { marginTop: 4 }]}>{date}</Text>
                </View>

                {/* Executive Summary */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>📋 Executive Summary</Text>
                    <View style={styles.summaryBox}>
                        <View style={styles.row}>
                            <Text style={styles.label}>분석 대상:</Text>
                            <Text style={styles.value}>{data.context.task}</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>산업:</Text>
                            <Text style={styles.value}>{data.context.industry}</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>직무:</Text>
                            <Text style={styles.value}>{data.context.role}</Text>
                        </View>
                    </View>

                    <View style={styles.metricsRow}>
                        <View style={styles.metricBox}>
                            <Text style={styles.metricValue}>{data.asIsNodes.length}</Text>
                            <Text style={styles.metricLabel}>As-Is 프로세스</Text>
                        </View>
                        <View style={styles.metricBox}>
                            <Text style={styles.metricValue}>{data.toBeNodes.length}</Text>
                            <Text style={styles.metricLabel}>To-Be 프로세스</Text>
                        </View>
                        <View style={styles.metricBox}>
                            <Text style={styles.metricValue}>{automationRate}%</Text>
                            <Text style={styles.metricLabel}>자동화율</Text>
                        </View>
                    </View>
                </View>

                {/* As-Is Analysis */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>📊 As-Is 현황 분석</Text>
                    {data.asIsNodes.map((node) => (
                        <Text key={node.id} style={styles.listItem}>
                            • {node.label}{node.description ? ` - ${node.description}` : ''}
                        </Text>
                    ))}
                </View>

                {/* To-Be Design */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>🤖 To-Be 설계</Text>
                    {data.toBeNodes.map((node) => (
                        <Text key={node.id} style={styles.listItem}>
                            • {node.label} {node.type === 'agent' ? '(AI Agent)' : ''}
                        </Text>
                    ))}
                </View>

                {/* Strategy */}
                {data.strategy && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>📈 실행 전략 ({data.strategy.framework})</Text>
                        {data.strategy.phases.slice(0, 4).map((phase, idx) => (
                            <View key={idx} style={styles.phaseCard}>
                                <Text style={styles.phaseName}>{phase.name} ({phase.duration})</Text>
                                {phase.actions.map((action, aidx) => (
                                    <Text key={aidx} style={styles.phaseAction}>• {action}</Text>
                                ))}
                            </View>
                        ))}
                    </View>
                )}

                <Text style={styles.footer}>
                    Generated by Agent Shift • AI-Powered Change Management
                </Text>
            </Page>
        </Document>
    );
};

// PDF 생성 함수
export async function generatePdfReport(data: ReportData): Promise<void> {
    const blob = await pdf(<PdfReportDocument data={data} />).toBlob();

    // 다운로드
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agent-shift-report.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
