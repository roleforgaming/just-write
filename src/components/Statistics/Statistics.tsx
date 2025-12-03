import React, { useState, useEffect, useMemo } from 'react';
import { App, TFolder } from 'obsidian';
import { ProjectManager } from '../../utils/projectManager';
import { Target, Calendar, TrendingUp, Clock, AlertCircle, FileDown } from 'lucide-react';

interface StatisticsProps {
    app: App;
    project: TFolder;
}

// Helper to get local date string
const getLocalDateString = (date: Date = new Date()): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Helper to check if a string is in YYYY-MM-DD format
const isValidDateString = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

// --- Phase 4: History Chart Component ---
const HistoryChart: React.FC<{ data: [string, number][] }> = ({ data }) => {
    const maxCount = useMemo(() => Math.max(1, ...data.map(d => Number(d[1]))), [data]);
    
    // Display the last ~14 days for a clean look, in chronological order
    const chartData = useMemo(() => data.slice(0, 14).reverse(), [data]);

    if (chartData.length === 0) {
        return null; // Don't render an empty chart
    }

    return (
        <div className="novelist-history-chart">
            {chartData.map(([date, count]) => {
                const dateParts = date.split('-').map(Number);
                const d = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
                const dayLabel = d.toLocaleDateString(undefined, { day: 'numeric' });
                const monthLabel = d.toLocaleDateString(undefined, { month: 'short' });
                
                const heightPercent = (Number(count) / maxCount) * 100;

                return (
                    <div key={date} className="chart-bar-wrapper" title={`${d.toLocaleDateString()}: ${Number(count).toLocaleString()} words`}>
                        <div className="chart-bar" style={{ height: `${heightPercent}%` }}>
                            <span className="chart-bar-value">{Number(count).toLocaleString()}</span>
                        </div>
                        <div className="chart-label">{dayLabel}</div>
                        <div className="chart-label-month">{monthLabel}</div>
                    </div>
                );
            })}
        </div>
    );
};


export const Statistics: React.FC<StatisticsProps> = ({ app, project }) => {
    const pm = useMemo(() => new ProjectManager(app), [app]);
    const [meta, setMeta] = useState(pm.getProjectMetadata(project));
    const [currentWordCount, setCurrentWordCount] = useState(0);
    const [todayCount, setTodayCount] = useState(0);

    const refresh = async () => {
        const newMeta = pm.getProjectMetadata(project);
        setMeta(newMeta);
        const count = await pm.getProjectWordCount(project);
        setCurrentWordCount(count);
        
        const todayStr = getLocalDateString();
        setTodayCount(Number(newMeta?.writingHistory?.[todayStr] || 0));
    };

    useEffect(() => {
        refresh();
        const events = [
            app.vault.on('modify', () => { 
                setTimeout(refresh, 2000); 
            }),
            app.metadataCache.on('changed', (f) => {
                if (f.name === 'project.md' && f.parent?.path === project.path) refresh();
            })
        ];
        return () => events.forEach(ref => app.vault.offref(ref as any));
    }, [project]);

    // Metrics Calculation
    const target = meta?.targetWordCount || 0;
    const deadline = meta?.targetDeadline ? new Date(meta.targetDeadline) : null;
    const progressPercent = target > 0 ? Math.min(100, Math.round((currentWordCount / target) * 100)) : 0;

    const daysRemaining = useMemo(() => {
        if (!deadline || !meta.targetDeadline || !isValidDateString(meta.targetDeadline)) return null;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const parts = meta.targetDeadline.split('-').map(Number);
        // Month is 0-indexed in JS Date constructor
        const deadlineDate = new Date(parts[0], parts[1] - 1, parts[2]);
        deadlineDate.setHours(0, 0, 0, 0);
        
        if (isNaN(deadlineDate.getTime())) return null;

        const diffTime = deadlineDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        return Math.max(0, diffDays);
    }, [deadline, meta?.targetDeadline]);

    const wordsPerDayNeeded = useMemo(() => {
        if (daysRemaining === null || daysRemaining <= 0 || target === 0) return 0;
        const remainingWords = Math.max(0, target - currentWordCount);
        return Math.ceil(remainingWords / daysRemaining);
    }, [daysRemaining, target, currentWordCount]);

    const streak = useMemo(() => {
        if (!meta?.writingHistory) return 0;
        
        let streakCount = 0;
        const history = meta.writingHistory;
        const d = new Date();

        const todayStr = getLocalDateString(d);
        if (!history[todayStr] || history[todayStr] === 0) {
            d.setDate(d.getDate() - 1);
        }

        while (true) {
            const dStr = getLocalDateString(d);
            if ((history[dStr] || 0) > 0) {
                streakCount++;
                d.setDate(d.getDate() - 1);
            } else {
                break;
            }
        }
        return streakCount;
    }, [meta?.writingHistory]);


    // Sort history for display (newest first) and filter out bad data
    const historyEntries = useMemo((): [string, number][] => {
        if (!meta?.writingHistory) return [];
        return Object.entries(meta.writingHistory)
            .filter(([date, count]) => isValidDateString(date) && !isNaN(Number(count)))
            .map(([date, count]): [string, number] => [date, Number(count)])
            .sort((a, b) => b[0].localeCompare(a[0]))
            .slice(0, 30);
    }, [meta?.writingHistory]);
    
    // --- Phase 4: Data Export ---
    const handleExportCsv = () => {
        if (historyEntries.length === 0) return;

        const headers = "Date,Words Written";
        const rows = historyEntries.map(([date, count]) => `${date},${Number(count)}`).join('\n');
        const csvContent = `${headers}\n${rows}`;
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `${project.name}-writing-history.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="novelist-stats-container">
            <h2 className="novelist-stats-header">
                Statistics for "{project.name}"
            </h2>

            <div className="novelist-stats-grid">
                {/* 1. Main Progress */}
                <div className="novelist-stat-card full-width">
                    <div className="stat-card-title"><Target size={16}/> Manuscript Progress</div>
                    <div className="stat-big-number">{currentWordCount.toLocaleString()} <span className="stat-sub">/ {target > 0 ? target.toLocaleString() : '...'} words</span></div>
                    <div className="novelist-progress-bar-bg huge">
                        <div className="novelist-progress-bar-fill" style={{width: `${progressPercent}%`}}></div>
                    </div>
                    <div className="stat-footer-text">{progressPercent}% Completed</div>
                </div>

                {/* 2. Today's Session */}
                <div className="novelist-stat-card">
                    <div className="stat-card-title"><Clock size={16}/> Today's Session</div>
                    <div className="stat-big-number">{todayCount.toLocaleString()}</div>
                    <div className="stat-footer-text">words written today</div>
                </div>

                {/* 3. Streak */}
                <div className="novelist-stat-card">
                    <div className="stat-card-title"><TrendingUp size={16}/> Writing Streak</div>
                    <div className="stat-big-number">{streak}</div>
                    <div className="stat-footer-text">consecutive days</div>
                </div>

                {/* 4. Deadline Metrics */}
                {deadline && daysRemaining !== null ? (
                    <div className="novelist-stat-card full-width deadline-card">
                        <div className="stat-columns">
                            <div>
                                <div className="stat-card-title"><Calendar size={16}/> Days Remaining</div>
                                <div className="stat-big-number">{daysRemaining}</div>
                                <div className="stat-footer-text">until {deadline.toLocaleDateString()}</div>
                            </div>
                            <div className="stat-separator-vertical"></div>
                            <div>
                                <div className="stat-card-title"><AlertCircle size={16}/> Daily Goal</div>
                                <div className="stat-big-number">{wordsPerDayNeeded?.toLocaleString() || 0}</div>
                                <div className="stat-footer-text">words/day to finish on time</div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="novelist-stat-card full-width" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)'}}>
                        <div style={{textAlign: 'center'}}>
                            <Calendar size={24} style={{marginBottom: 5, opacity: 0.5}}/>
                            <div>Set a deadline in Project Settings to see forecasts.</div>
                        </div>
                    </div>
                )}
            </div>
            
            <div className="novelist-stats-subheader-flex">
                <h3 className="novelist-stats-subheader">Writing History (Last 30 Days)</h3>
                {historyEntries.length > 0 && (
                    <button className="novelist-tool-btn" onClick={handleExportCsv} title="Export as CSV">
                        <FileDown size={14} /> Export
                    </button>
                )}
            </div>

            <HistoryChart data={historyEntries} />

            <div className="novelist-history-table-wrapper">
                <table className="novelist-history-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Words Written</th>
                        </tr>
                    </thead>
                    <tbody>
                        {historyEntries.length > 0 ? (
                            historyEntries.map(([date, count]) => {
                                // Use robust date parsing that ignores timezones
                                const dateParts = date.split('-').map(Number);
                                const d = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
                                return (
                                    <tr key={date}>
                                        <td>{d.toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'})}</td>
                                        <td>{Number(count || 0).toLocaleString()}</td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={2} style={{textAlign: 'center', color: 'var(--text-muted)'}}>No writing history yet.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};